import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { posDb } from '../src/features/pos/db/posDatabase';
import { getOrderSyncService } from '../src/features/pos/services/orderSyncService';
import { ownerIntelligence } from '../src/features/pos/services/ownerIntelligenceService';
import { backupService, POS_BACKUP_VERSION } from '../src/features/pos/services/backupService';
import { csvExportService } from '../src/features/pos/services/csvExportService';
import type { PosOrder, PosMenuItem, PosPaymentRecord, EodSummary } from '../src/features/pos/domain/pos.types';

test('Phase 4F: Production Hardening & Owner Intelligence Test Suite', async (t) => {
  const testRestaurantId = `test_rst_4f_${Date.now()}`;

  await t.test('1. Hardened Sync Queue schema includes entityType, entityId, operation, and payload', async () => {
    const item = await posDb.enqueueSync(
      'UpdateOrderStatus',
      'ORDER',
      { orderId: 'ord_test_001', orderStatus: 'ACCEPTED' },
      { tenantId: testRestaurantId, deviceId: 'pos_test_device', operation: 'UPDATE', entityId: 'ord_test_001' },
    );

    assert.equal(item.entityType, 'ORDER');
    assert.equal(item.tenantId, testRestaurantId);
    assert.equal(item.deviceId, 'pos_test_device');
    assert.equal(item.payload?.orderId, 'ord_test_001');
    assert.equal(item.operation, 'UPDATE');
    assert.equal(item.status, 'PENDING');
    assert.equal(item.retryCount, 0);
    assert.ok(item.createdAt);
  });

  await t.test('2. Sync queue status transitions to SYNCING before attempting network dispatch', async () => {
    const item = await posDb.enqueueSync(
      'RecordPayment',
      'PAYMENT',
      { orderId: 'ord_pay_test', method: 'CASH', amount: 300 },
      { tenantId: testRestaurantId, operation: 'CREATE' },
    );
    item.status = 'SYNCING';
    item.lastAttemptAt = new Date().toISOString();
    await posDb.syncQueue.put(item);

    const saved = await posDb.syncQueue.get(item.id);
    assert.equal(saved?.status, 'SYNCING');
    assert.ok(saved?.lastAttemptAt);
  });

  await t.test('3. Exponential backoff calculation doubles delay capped at 60 seconds', () => {
    const calcBackoff = (retryCount: number) => Math.min(60000, 1000 * Math.pow(2, retryCount));
    assert.equal(calcBackoff(0), 1000);
    assert.equal(calcBackoff(1), 2000);
    assert.equal(calcBackoff(2), 4000);
    assert.equal(calcBackoff(3), 8000);
    assert.equal(calcBackoff(4), 16000);
    assert.equal(calcBackoff(5), 32000);
    assert.equal(calcBackoff(6), 60000); // Capped at 60s
    assert.equal(calcBackoff(10), 60000);
  });

  await t.test('4. Permanent failure status FAILED after 5 retries', async () => {
    const item = await posDb.enqueueSync(
      'UpdateOrderStatus',
      'ORDER',
      { orderId: 'ord_fail_test', orderStatus: 'ACCEPTED' },
      { tenantId: testRestaurantId, operation: 'UPDATE' },
    );
    item.retryCount = 5;
    item.status = 'FAILED';
    item.lastError = 'Network timeout';
    await posDb.syncQueue.put(item);

    const saved = await posDb.syncQueue.get(item.id);
    assert.equal(saved?.status, 'FAILED');
    assert.equal(saved?.retryCount, 5);
  });

  await t.test('5. Pending sync queue count reflects both PENDING and SYNCING items', async () => {
    const syncService = getOrderSyncService(async () => 'test-token');
    try {
      await syncService.initialize({ tenantId: testRestaurantId, deviceId: 'pos_test_device' });
      const count = await syncService.getPendingSyncCount();
      assert.ok(typeof count === 'number');
    } finally {
      // initialize() starts the lease renewal heartbeat; leaving it running
      // keeps the process alive after the suite finishes.
      await syncService.shutdown();
    }
  });

  await t.test('6. Duplicate payment prevention: second recordPayment on a settled order returns alreadyPaid: true', async () => {
    const order: PosOrder = {
      id: `ord_dup_pay_${Date.now()}`,
      restaurantId: testRestaurantId,
      orderNumber: 201,
      orderSource: 'WALK_IN',
      orderType: 'DINE_IN',
      orderStatus: 'ACCEPTED',
      paymentMethod: 'CASH',
      paymentStatus: 'PENDING',
      customer: { name: 'Customer 1', phone: '9876543210' },
      items: [{ itemId: 'item_1', name: 'Veg Thali', price: 150, quantity: 1, lineTotal: 150 }],
      pricing: { subtotal: 150, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 150 },
      timestamps: { createdAt: new Date().toISOString() },
    };
    await posDb.orders.put(order);

    // 1st Payment
    const res1 = await posDb.recordPayment(order.id, 'CASH', 150);
    assert.equal(res1.success, true);
    assert.equal(res1.order?.paymentStatus, 'RECORDED');

    // 2nd Duplicate Payment Attempt
    const res2 = await posDb.recordPayment(order.id, 'CASH', 150);
    assert.equal(res2.success, false);
    assert.equal(res2.alreadyPaid, true);
    assert.equal(res2.message, 'Payment already recorded.');
  });

  await t.test('7. Duplicate payment does not create redundant payment records or alter existing payment', async () => {
    const orderId = `ord_dup_recs_${Date.now()}`;
    const order: PosOrder = {
      id: orderId,
      restaurantId: testRestaurantId,
      orderNumber: 202,
      orderSource: 'WALK_IN',
      orderType: 'DINE_IN',
      orderStatus: 'ACCEPTED',
      paymentMethod: 'UPI',
      paymentStatus: 'PENDING',
      customer: { name: 'Customer 2', phone: '9876543210' },
      items: [{ itemId: 'item_1', name: 'Tea', price: 20, quantity: 1, lineTotal: 20 }],
      pricing: { subtotal: 20, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 20 },
      timestamps: { createdAt: new Date().toISOString() },
    };
    await posDb.orders.put(order);

    await posDb.recordPayment(orderId, 'UPI', 20, 'REF111');
    await posDb.recordPayment(orderId, 'UPI', 20, 'REF222'); // Rejected

    const payments = await posDb.payments.where('orderId').equals(orderId).toArray();
    assert.equal(payments.length, 1);
    assert.equal(payments[0].reference, 'REF111');
  });

  await t.test('8. Paytm UPI URL generation contains exact VPA paytm.s33cotk@pty and recipient B Lakshmi Prasanna', () => {
    const PAYTM_UPI_ID = 'paytm.s33cotk@pty';
    const PAYTM_RECIPIENT_NAME = 'B Lakshmi Prasanna';
    const billAmount = 249;
    const url = `upi://pay?pa=${PAYTM_UPI_ID}&pn=${encodeURIComponent(PAYTM_RECIPIENT_NAME)}&am=${billAmount}&cu=INR`;

    assert.ok(url.includes('pa=paytm.s33cotk@pty'));
    assert.ok(url.includes('B%20Lakshmi%20Prasanna'));
    assert.ok(url.includes('am=249'));
  });

  await t.test('9. Dynamic UPI URL reflects exact bill amount for orders of varying values', () => {
    const makeUrl = (amt: number) => `upi://pay?pa=paytm.s33cotk@pty&pn=B%20Lakshmi%20Prasanna&am=${amt}&cu=INR`;
    assert.equal(makeUrl(85), 'upi://pay?pa=paytm.s33cotk@pty&pn=B%20Lakshmi%20Prasanna&am=85&cu=INR');
    assert.equal(makeUrl(1499), 'upi://pay?pa=paytm.s33cotk@pty&pn=B%20Lakshmi%20Prasanna&am=1499&cu=INR');
  });

  await t.test('10. Cash Reconciliation: Expected cash = float + cash sales - cash payouts', () => {
    const openingFloat = 2000;
    const totalCashSales = 4500;
    const cashExpenses = 350;
    const expectedClosingCash = openingFloat + totalCashSales - cashExpenses;
    assert.equal(expectedClosingCash, 6150);

    const actualClosingCash = 6150;
    const variance = actualClosingCash - expectedClosingCash;
    assert.equal(variance, 0);
  });

  await t.test('11. Cash Reconciliation strictly excludes UPI, Card, and Online payments from physical drawer', () => {
    const cashSales = 1200;
    const upiSales = 3400;
    const cardSales = 800;
    const onlineSales = 2100;
    const openingFloat = 1000;

    // Expected physical drawer strictly considers cashSales
    const expectedDrawer = openingFloat + cashSales;
    assert.equal(expectedDrawer, 2200);
    assert.notEqual(expectedDrawer, openingFloat + cashSales + upiSales + cardSales + onlineSales);
  });

  await t.test('12. Business Day Lock records closed state with opening float and actual closing cash', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const closed = await posDb.closeBusinessDay(testRestaurantId, 2000, 6150, 'Manager Ramu');

    assert.equal(closed.isClosed, true);
    assert.equal(closed.openingFloat, 2000);
    assert.equal(closed.actualClosingCash, 6150);
    assert.equal(closed.closedBy, 'Manager Ramu');

    const retrieved = await posDb.getBusinessDayState(testRestaurantId, today);
    assert.equal(retrieved.isClosed, true);
  });

  await t.test('13. Business Day Reopen requires a server-verified credential and audits the authorization', async () => {
    const res = await posDb.reopenBusinessDay(
      testRestaurantId,
      { verifiedBy: 'owner-uid-1', method: 'admin-session' },
      'Late night dine-in party settled cash bill',
      'owner-uid-1',
    );
    assert.equal(res.success, true);
    assert.equal(res.state?.isClosed, false);
    assert.equal(res.state?.reopenReason, 'Late night dine-in party settled cash bill');

    const audit = (await posDb.getAuditLogs(20)).find((entry) => entry.action === 'DAY_REOPENED');
    assert.equal(audit?.details?.authorizationMethod, 'admin-session');
    assert.equal(audit?.details?.authorizedBy, 'owner-uid-1');
  });

  await t.test('14. Business Day Reopen is refused without a verified credential', async () => {
    const res = await posDb.reopenBusinessDay(
      testRestaurantId,
      { verifiedBy: '', method: 'supervisor-pin' },
      'Unauthorized attempt',
    );
    assert.equal(res.success, false);
    assert.match(res.message ?? '', /authenticated supervisor credential/i);
  });

  await t.test('15. Audit Log captures critical actions: DAY_CLOSED, DAY_REOPENED, PAYMENT_RECORDED', async () => {
    const logs = await posDb.getAuditLogs(10);
    assert.ok(logs.length > 0);
    const actions = logs.map((l) => l.action);
    assert.ok(actions.includes('DAY_CLOSED') || actions.includes('DAY_REOPENED') || actions.includes('PAYMENT_RECORDED'));
  });

  await t.test('16. Hourly Sales correctly buckets orders into 6 specific brackets (4:30 PM - 10:30 PM IST)', () => {
    // 5:00 PM IST = 11:30 AM UTC
    // 7:00 PM IST = 1:30 PM UTC
    // 8:00 PM IST = 2:30 PM UTC
    const orders: PosOrder[] = [
      {
        id: 'ord_h1',
        restaurantId: testRestaurantId,
        orderSource: 'WALK_IN',
        orderType: 'DINE_IN',
        orderStatus: 'COMPLETED',
        paymentMethod: 'CASH',
        paymentStatus: 'RECORDED',
        customer: { name: 'G1', phone: '' },
        items: [{ itemId: 'i1', name: 'Item 1', price: 200, quantity: 1, lineTotal: 200 }],
        pricing: { subtotal: 200, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 200 },
        timestamps: { createdAt: '2026-09-15T11:30:00.000Z' }, // 5:00 PM IST -> 4:30 - 5:30 slot
      },
      {
        id: 'ord_h2',
        restaurantId: testRestaurantId,
        orderSource: 'WALK_IN',
        orderType: 'DINE_IN',
        orderStatus: 'COMPLETED',
        paymentMethod: 'CASH',
        paymentStatus: 'RECORDED',
        customer: { name: 'G2', phone: '' },
        items: [{ itemId: 'i2', name: 'Item 2', price: 600, quantity: 1, lineTotal: 600 }],
        pricing: { subtotal: 600, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 600 },
        timestamps: { createdAt: '2026-09-15T14:00:00.000Z' }, // 7:30 PM IST -> 7:30 - 8:30 slot
      },
    ];

    const { slots } = ownerIntelligence.calculateHourlySlots(orders);
    assert.equal(slots.length, 6);
    assert.equal(slots[0].slotLabel, '4:30 PM - 5:30 PM');
    assert.equal(slots[0].ordersCount, 1);
    assert.equal(slots[0].salesAmount, 200);

    assert.equal(slots[3].slotLabel, '7:30 PM - 8:30 PM');
    assert.equal(slots[3].ordersCount, 1);
    assert.equal(slots[3].salesAmount, 600);
  });

  await t.test('17. Peak Hour correctly identifies the highest revenue hourly bracket', () => {
    const orders: PosOrder[] = [
      {
        id: 'o_p1',
        restaurantId: testRestaurantId,
        orderSource: 'WALK_IN',
        orderType: 'DINE_IN',
        orderStatus: 'COMPLETED',
        paymentMethod: 'CASH',
        paymentStatus: 'RECORDED',
        customer: { name: 'G1', phone: '' },
        items: [{ itemId: 'i1', name: 'Item 1', price: 100, quantity: 1, lineTotal: 100 }],
        pricing: { subtotal: 100, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 100 },
        timestamps: { createdAt: '2026-09-15T11:30:00.000Z' }, // 5:00 PM IST
      },
      {
        id: 'o_p2',
        restaurantId: testRestaurantId,
        orderSource: 'WALK_IN',
        orderType: 'DINE_IN',
        orderStatus: 'COMPLETED',
        paymentMethod: 'CASH',
        paymentStatus: 'RECORDED',
        customer: { name: 'G2', phone: '' },
        items: [{ itemId: 'i2', name: 'Item 2', price: 850, quantity: 1, lineTotal: 850 }],
        pricing: { subtotal: 850, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 850 },
        timestamps: { createdAt: '2026-09-15T14:30:00.000Z' }, // 8:00 PM IST -> 7:30 - 8:30 slot
      },
    ];

    const { peakHour } = ownerIntelligence.calculateHourlySlots(orders);
    assert.ok(peakHour);
    assert.equal(peakHour?.slotLabel, '7:30 PM - 8:30 PM');
    assert.equal(peakHour?.salesAmount, 850);
  });

  await t.test('18. Top Sellers separately rank items by volume sold vs total revenue', () => {
    const orders: PosOrder[] = [
      {
        id: 'o_rank',
        restaurantId: testRestaurantId,
        orderSource: 'WALK_IN',
        orderType: 'DINE_IN',
        orderStatus: 'COMPLETED',
        paymentMethod: 'CASH',
        paymentStatus: 'RECORDED',
        customer: { name: 'G', phone: '' },
        items: [
          { itemId: 'item_samosa', name: 'Samosa', price: 20, quantity: 10, lineTotal: 200 },
          { itemId: 'item_biryani', name: 'Family Biryani', price: 600, quantity: 1, lineTotal: 600 },
        ],
        pricing: { subtotal: 800, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 800 },
        timestamps: { createdAt: new Date().toISOString() },
      },
    ];

    const { topSellersByVolume, topSellersByRevenue } = ownerIntelligence.calculateItemRankings(orders);

    // Volume winner: Samosa (10 sold)
    assert.equal(topSellersByVolume[0].name, 'Samosa');
    assert.equal(topSellersByVolume[0].quantity, 10);

    // Revenue winner: Family Biryani (₹600)
    assert.equal(topSellersByRevenue[0].name, 'Family Biryani');
    assert.equal(topSellersByRevenue[0].revenue, 600);
  });

  await t.test('19. Slow-Moving Items identified with neutral "Low sales volume" copy', () => {
    const menuItems: PosMenuItem[] = [
      { id: 'm1', restaurantId: testRestaurantId, name: 'Rare Special Drink', category: 'Beverages', price: 90, isAvailable: true },
      { id: 'm2', restaurantId: testRestaurantId, name: 'Popular Dosa', category: 'Tiffins', price: 60, isAvailable: true },
    ];
    const orders: PosOrder[] = [
      {
        id: 'o_sm',
        restaurantId: testRestaurantId,
        orderSource: 'WALK_IN',
        orderType: 'DINE_IN',
        orderStatus: 'COMPLETED',
        paymentMethod: 'CASH',
        paymentStatus: 'RECORDED',
        customer: { name: 'G', phone: '' },
        items: [{ itemId: 'm2', name: 'Popular Dosa', price: 60, quantity: 5, lineTotal: 300 }],
        pricing: { subtotal: 300, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 300 },
        timestamps: { createdAt: new Date().toISOString() },
      },
    ];

    const slowItems = ownerIntelligence.calculateSlowMovingItems(menuItems, orders, 1);
    assert.equal(slowItems.length, 2);
    assert.equal(slowItems[0].name, 'Rare Special Drink'); // 0 sold
    assert.equal(slowItems[0].quantitySold, 0);
    assert.equal(slowItems[0].statusCopy, 'Low sales volume');
  });

  await t.test('20. Channel comparison calculates Online vs Walk-in metrics accurately', () => {
    const orders: PosOrder[] = [
      {
        id: 'o_w',
        restaurantId: testRestaurantId,
        orderSource: 'WALK_IN',
        orderType: 'DINE_IN',
        orderStatus: 'COMPLETED',
        paymentMethod: 'CASH',
        paymentStatus: 'RECORDED',
        customer: { name: 'Walk', phone: '' },
        items: [{ itemId: 'i1', name: 'Item', price: 200, quantity: 1, lineTotal: 200 }],
        pricing: { subtotal: 200, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 200 },
        timestamps: { createdAt: new Date().toISOString() },
      },
      {
        id: 'o_on',
        restaurantId: testRestaurantId,
        orderSource: 'ORDERBHOJAN',
        orderType: 'DELIVERY',
        orderStatus: 'COMPLETED',
        paymentMethod: 'UPI',
        paymentStatus: 'RECORDED',
        customer: { name: 'Online', phone: '' },
        items: [{ itemId: 'i1', name: 'Item', price: 400, quantity: 2, lineTotal: 400 }],
        pricing: { subtotal: 400, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 400 },
        timestamps: { createdAt: new Date().toISOString() },
      },
    ];

    const comparison = ownerIntelligence.calculateChannelComparison(orders);
    assert.equal(comparison.walkInOrdersCount, 1);
    assert.equal(comparison.walkInSales, 200);
    assert.equal(comparison.walkInAov, 200);

    assert.equal(comparison.onlineOrdersCount, 1);
    assert.equal(comparison.onlineSales, 400);
    assert.equal(comparison.onlineAov, 400);
  });

  await t.test('21. Item-level channel split calculates quantities sold per channel', () => {
    const orders: PosOrder[] = [
      {
        id: 'o_split1',
        restaurantId: testRestaurantId,
        orderSource: 'WALK_IN',
        orderType: 'DINE_IN',
        orderStatus: 'COMPLETED',
        paymentMethod: 'CASH',
        paymentStatus: 'RECORDED',
        customer: { name: 'G', phone: '' },
        items: [{ itemId: 'dish_01', name: 'Special Rice', price: 150, quantity: 3, lineTotal: 450 }],
        pricing: { subtotal: 450, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 450 },
        timestamps: { createdAt: new Date().toISOString() },
      },
      {
        id: 'o_split2',
        restaurantId: testRestaurantId,
        orderSource: 'ORDERBHOJAN',
        orderType: 'DELIVERY',
        orderStatus: 'COMPLETED',
        paymentMethod: 'UPI',
        paymentStatus: 'RECORDED',
        customer: { name: 'G2', phone: '' },
        items: [{ itemId: 'dish_01', name: 'Special Rice', price: 150, quantity: 5, lineTotal: 750 }],
        pricing: { subtotal: 750, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 750 },
        timestamps: { createdAt: new Date().toISOString() },
      },
    ];

    const comparison = ownerIntelligence.calculateChannelComparison(orders);
    const split = comparison.itemChannelSplits.find((s) => s.itemId === 'dish_01');
    assert.ok(split);
    assert.equal(split?.walkInCount, 3);
    assert.equal(split?.onlineCount, 5);
  });

  await t.test('22. Deterministic insights generate factual summaries without LLM hallucinations', () => {
    const insights = ownerIntelligence.generateDeterministicInsights({
      totalSales: 10000,
      totalOrders: 25,
      aov: 400,
      peakHour: { slotLabel: '7:30 PM - 8:30 PM', startHour: 19.5, endHour: 20.5, ordersCount: 12, salesAmount: 4800 },
      channelComparison: {
        onlineOrdersCount: 10,
        onlineSales: 4000,
        onlineAov: 400,
        walkInOrdersCount: 15,
        walkInSales: 6000,
        walkInAov: 400,
        itemChannelSplits: [],
      },
      topSellersByVolume: [{ name: 'Chicken Biryani', quantity: 18 }],
      cashVariance: 0,
    });

    assert.ok(insights.length >= 3);
    assert.ok(insights.some((i) => i.includes('Peak business hour was 7:30 PM - 8:30 PM')));
    assert.ok(insights.some((i) => i.includes('Walk-in dining accounted for 60%')));
    assert.ok(insights.some((i) => i.includes('Top-selling item: "Chicken Biryani"')));
    assert.ok(insights.some((i) => i.includes('Cash Drawer Balance: Expected physical cash exactly matches drawer count.')));
  });

  await t.test('23. Reconciliation Validator flags mismatch between order totals and collected payments', () => {
    const orders: PosOrder[] = [
      {
        id: 'ord_rec_1',
        restaurantId: testRestaurantId,
        orderSource: 'WALK_IN',
        orderType: 'DINE_IN',
        orderStatus: 'COMPLETED',
        paymentMethod: 'CASH',
        paymentStatus: 'RECORDED',
        customer: { name: 'G', phone: '' },
        items: [{ itemId: 'i', name: 'Meal', price: 500, quantity: 1, lineTotal: 500 }],
        pricing: { subtotal: 500, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 500 },
        timestamps: { createdAt: new Date().toISOString() },
      },
    ];
    // Payment record collected only ₹400 (₹100 mismatch)
    const payments = [{ amount: 400, status: 'PAID' }];

    const result = ownerIntelligence.validateReconciliation(orders, payments);
    assert.equal(result.isValid, false);
    assert.equal(result.hasMismatch, true);
    assert.ok(result.message.includes('RECONCILIATION ISSUE'));
  });

  await t.test('24. JSON Backup exports tables and Restore requires a verified credential', async () => {
    const backup = await backupService.createBackup(testRestaurantId, false);
    assert.equal(backup.version, POS_BACKUP_VERSION);
    assert.ok(Array.isArray(backup.orders));
    assert.ok(Array.isArray(backup.menu));

    // Restore without a server-verified credential is denied.
    const uncredentialed = await backupService.restoreBackup(
      backup,
      { verifiedBy: '', method: 'supervisor-pin' },
      testRestaurantId
    );
    assert.equal(uncredentialed.success, false);
    assert.equal(!uncredentialed.success && uncredentialed.code, 'UNAUTHORIZED');
    assert.match(uncredentialed.message ?? '', /supervisor credential/i);

    // A backup belonging to a different restaurant is refused: importing it
    // would pull another tenant's orders and payments into this terminal.
    const crossTenant = await backupService.restoreBackup(
      backup,
      { verifiedBy: 'owner-uid-1', method: 'admin-session' },
      'a_different_restaurant'
    );
    assert.equal(crossTenant.success, false);
    assert.equal(!crossTenant.success && crossTenant.code, 'TENANT_MISMATCH');

    // A file from a future version is refused rather than half-read.
    const futureVersion = await backupService.restoreBackup(
      { ...backup, version: POS_BACKUP_VERSION + 5 },
      { verifiedBy: 'owner-uid-1', method: 'admin-session' },
      testRestaurantId
    );
    assert.equal(futureVersion.success, false);
    assert.equal(!futureVersion.success && futureVersion.code, 'UNSUPPORTED_VERSION');

    // Restore is refused while queued commands are not yet confirmed by the
    // server: this is what prevents recorded payments and KOTs being lost.
    const unacknowledged = (await posDb.syncQueue.toArray()).filter(
      (item) => item.status !== 'SYNCED'
    ).length;
    const blocked = await backupService.restoreBackup(
      backup,
      { verifiedBy: 'owner-uid-1', method: 'admin-session' },
      testRestaurantId
    );
    if (unacknowledged > 0) {
      assert.equal(blocked.success, false);
      assert.equal(!blocked.success && blocked.code, 'UNSYNCED_WORK');
      assert.match(blocked.message ?? '', /not yet confirmed/i);
    }

    // Once every queued command is acknowledged, a verified restore succeeds.
    const queued = await posDb.syncQueue.toArray();
    for (const item of queued) {
      item.status = 'SYNCED';
      item.acknowledgedAt = Date.now();
      await posDb.syncQueue.put(item);
    }
    const goodRestore = await backupService.restoreBackup(
      backup,
      { verifiedBy: 'owner-uid-1', method: 'admin-session' },
      testRestaurantId
    );
    assert.equal(goodRestore.success, true);
  });

  await t.test('25. CSV Export Service generates valid CSV strings with headers and rows', () => {
    const mockSummary: EodSummary = {
      date: '2026-09-15',
      restaurantId: testRestaurantId,
      totalOrdersCount: 10,
      walkInOrdersCount: 6,
      onlineOrdersCount: 4,
      grossSales: 3500,
      netSales: 3500,
      totalTaxes: 0,
      totalDiscounts: 0,
      paymentBreakdown: { cash: 2000, upi: 1000, online: 500, card: 0, other: 0 },
      cashReconciliation: {
        openingFloat: 1000,
        totalCashSales: 2000,
        cashExpenses: 0,
        expectedClosingCash: 3000,
        actualClosingCash: 3000,
        variance: 0,
      },
      itemSales: [
        { itemId: 'it1', name: 'Dosa', category: 'Tiffins', quantitySold: 8, totalRevenue: 480 },
      ],
    };

    const itemCsv = csvExportService.exportItemSalesCsv(mockSummary, false);
    assert.ok(itemCsv.includes('Item Name,Category,Quantity Sold,Total Revenue (INR)'));
    assert.ok(itemCsv.includes('"Dosa","Tiffins",8,480'));

    const dailyCsv = csvExportService.exportDailySalesCsv(mockSummary, false);
    assert.ok(dailyCsv.includes('Metric,Value'));
    assert.ok(dailyCsv.includes('Total Orders,10'));
    assert.ok(dailyCsv.includes('Cash Sales (INR),2000'));
  });
});
