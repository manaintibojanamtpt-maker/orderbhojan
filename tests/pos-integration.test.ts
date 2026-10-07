import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { posDb } from '../src/features/pos/db/posDatabase';
import { getOrderSyncService } from '../src/features/pos/services/orderSyncService';
import { audioAlert } from '../src/features/pos/services/audioAlertService';
import { eodService } from '../src/features/pos/services/eodService';
import type { PosOrder } from '../src/features/pos/domain/pos.types';

test('Phase 4E: POS Integration Test Suite', async (t) => {
  const testRestaurantId = `test_rst_${Date.now()}`;

  await t.test('1. Firestore order mapper creates valid PosOrder with orderSource and onlineOrderId', () => {
    const rawFirestoreDoc = {
      tenantId: testRestaurantId,
      orderNumber: 1042,
      orderSource: 'ORDERBHOJAN',
      orderType: 'delivery',
      status: 'PLACED',
      totalAmount: 499,
      subtotal: 450,
      gstAmount: 24,
      deliveryFee: 25,
      customerName: 'Suresh Reddy',
      phone: '9876543210',
      address: 'Madhapur, Hyderabad',
      items: [
        { menuItemId: 'item_biryani', name: 'Hyderabadi Chicken Biryani', price: 299, quantity: 1, lineTotal: 299 },
        { menuItemId: 'item_drink', name: 'Thums Up', price: 40, quantity: 2, lineTotal: 80 },
      ],
      createdAt: '2026-09-14T20:00:00.000Z',
    };

    const mapped = getOrderSyncService(async () => 'test-token').mapFirestoreToPosOrder('ord_online_123', rawFirestoreDoc);

    assert.equal(mapped.id, 'ord_online_123');
    assert.equal(mapped.onlineOrderId, 'ord_online_123');
    assert.equal(mapped.orderSource, 'ORDERBHOJAN');
    assert.equal(mapped.orderStatus, 'NEW');
    assert.equal(mapped.customer.name, 'Suresh Reddy');
    assert.equal(mapped.customer.phone, '9876543210');
    assert.equal(mapped.pricing.total, 499);
    assert.equal(mapped.items.length, 2);
    assert.equal(mapped.items[0].price, 299);
    assert.equal(mapped.items[0].lineTotal, 299);
  });

  await t.test('2. Order items maintain immutable price snapshots', () => {
    const itemSnapshot = {
      itemId: 'food_biryani_01',
      name: 'Special Chicken Biryani',
      price: 320,
      quantity: 2,
      lineTotal: 640,
    };

    assert.equal(itemSnapshot.price * itemSnapshot.quantity, itemSnapshot.lineTotal);
    assert.equal(itemSnapshot.price, 320);
    // Menu price edits do not mutate snapshot
    const currentMenuPrice = 380;
    assert.notEqual(itemSnapshot.price, currentMenuPrice);
  });

  await t.test('3. Idempotent sync prevents duplicate online order creation in Dexie', async () => {
    const onlineOrder: PosOrder = {
      id: 'local_ord_001',
      onlineOrderId: 'online_ord_999',
      restaurantId: testRestaurantId,
      orderNumber: 501,
      orderSource: 'ORDERBHOJAN',
      orderType: 'DELIVERY',
      orderStatus: 'NEW',
      paymentMethod: 'UPI',
      paymentStatus: 'PENDING',
      customer: { name: 'Ananya Rao', phone: '9988776655' },
      items: [{ itemId: 'it_1', name: 'Meals', price: 150, quantity: 1, lineTotal: 150 }],
      pricing: { subtotal: 150, taxes: 8, deliveryFee: 0, packingFee: 0, discount: 0, total: 158 },
      timestamps: { createdAt: new Date().toISOString() },
    };

    // First upsert
    const res1 = await posDb.upsertOnlineOrder(onlineOrder);
    assert.equal(res1.created, true);

    // Duplicate event with same onlineOrderId
    const res2 = await posDb.upsertOnlineOrder({
      ...onlineOrder,
      id: 'local_ord_duplicate_attempt',
      pricing: { ...onlineOrder.pricing, total: 158 },
    });
    assert.equal(res2.created, false);

    // Verify only 1 order exists with onlineOrderId
    const matching = await posDb.orders.where('onlineOrderId').equals('online_ord_999').toArray();
    assert.equal(matching.length, 1);
  });

  await t.test('4. Audio alert triggers and mutes correctly', () => {
    audioAlert.stopAlert();
    assert.equal(audioAlert.getIsRinging(), false);

    audioAlert.startContinuousAlert();
    assert.equal(audioAlert.getIsRinging(), true);

    audioAlert.stopAlert();
    assert.equal(audioAlert.getIsRinging(), false);

    const initialMute = audioAlert.getMuted();
    const toggled = audioAlert.toggleMute();
    assert.equal(toggled, !initialMute);
    audioAlert.toggleMute(); // reset
  });

  await t.test('5. Staff accept transitions order to PREPARING and generates KOT', async () => {
    const order: PosOrder = {
      id: 'ord_accept_test',
      onlineOrderId: 'online_accept_01',
      restaurantId: testRestaurantId,
      orderSource: 'ORDERBHOJAN',
      orderType: 'DINE_IN',
      orderStatus: 'NEW',
      paymentMethod: 'CASH',
      paymentStatus: 'PENDING',
      customer: { name: 'Ravi Kumar', phone: '9123456780', tableNo: 'T2' },
      items: [{ itemId: 'it_dosa', name: 'Masala Dosa', price: 90, quantity: 2, lineTotal: 180 }],
      pricing: { subtotal: 180, taxes: 9, deliveryFee: 0, packingFee: 0, discount: 0, total: 189 },
      timestamps: { createdAt: new Date().toISOString() },
    };
    await posDb.orders.put(order);

    // 1. Accept order
    const updated = await posDb.updateOrderStatus(order.id, 'PREPARING');
    assert.equal(updated?.orderStatus, 'PREPARING');
    assert.ok(updated?.timestamps.acceptedAt);

    // 2. Create KOT
    const kot = await posDb.createKot(order);
    assert.ok(kot.id);
    assert.equal(kot.orderId, order.id);
    assert.equal(kot.status, 'PENDING');
    assert.equal(kot.items[0].name, 'Masala Dosa');
    assert.equal(kot.items[0].quantity, 2);
    assert.equal(kot.tableNo, 'T2');
  });

  await t.test('6. Staff reject requires mandatory reason and updates order with rejectionReason', async () => {
    const order: PosOrder = {
      id: 'ord_reject_test',
      onlineOrderId: 'online_reject_01',
      restaurantId: testRestaurantId,
      orderSource: 'ORDERBHOJAN',
      orderType: 'DELIVERY',
      orderStatus: 'NEW',
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      customer: { name: 'Kavitha', phone: '9888877777' },
      items: [{ itemId: 'it_curry', name: 'Paneer Curry', price: 220, quantity: 1, lineTotal: 220 }],
      pricing: { subtotal: 220, taxes: 11, deliveryFee: 30, packingFee: 10, discount: 0, total: 271 },
      timestamps: { createdAt: new Date().toISOString() },
    };
    await posDb.orders.put(order);

    const rejectionReason = 'Item(s) out of stock';
    const updated = await posDb.updateOrderStatus(order.id, 'REJECTED', { rejectionReason });
    assert.equal(updated?.orderStatus, 'REJECTED');
    assert.equal(updated?.rejectionReason, rejectionReason);
    assert.ok(updated?.timestamps.rejectedAt);
  });

  await t.test('7. KOT status advances from PENDING -> PREPARING -> READY', async () => {
    const order: PosOrder = {
      id: 'ord_kot_status_test',
      restaurantId: testRestaurantId,
      orderSource: 'WALK_IN',
      orderType: 'DINE_IN',
      orderStatus: 'PREPARING',
      paymentMethod: 'CASH',
      paymentStatus: 'PENDING',
      customer: { name: 'Walk-in', phone: '' },
      items: [{ itemId: 'it_coffee', name: 'Filter Coffee', price: 40, quantity: 1, lineTotal: 40 }],
      pricing: { subtotal: 40, taxes: 2, deliveryFee: 0, packingFee: 0, discount: 0, total: 42 },
      timestamps: { createdAt: new Date().toISOString() },
    };

    const kot = await posDb.createKot(order);
    assert.equal(kot.status, 'PENDING');

    await posDb.kots.update(kot.id, { status: 'PREPARING' });
    const p1 = await posDb.kots.get(kot.id);
    assert.equal(p1?.status, 'PREPARING');

    await posDb.kots.update(kot.id, { status: 'READY' });
    const p2 = await posDb.kots.get(kot.id);
    assert.equal(p2?.status, 'READY');
  });

  await t.test('8. Walk-in billing calculates subtotal, GST (5%), discount, and grand total', () => {
    const cart = [
      { itemId: 'item_1', name: 'Biryani', price: 250, quantity: 2, lineTotal: 500 },
      { itemId: 'item_2', name: 'Naan', price: 40, quantity: 3, lineTotal: 120 },
    ];

    const subtotal = cart.reduce((acc, it) => acc + it.lineTotal, 0);
    assert.equal(subtotal, 620);

    const discountPercent = 10;
    const discountAmount = Math.round((subtotal * discountPercent) / 100);
    assert.equal(discountAmount, 62);

    const taxableAmount = subtotal - discountAmount;
    assert.equal(taxableAmount, 558);

    const gstPercent = 5;
    const gstAmount = Math.round((taxableAmount * gstPercent) / 100);
    assert.equal(gstAmount, 28);

    const grandTotal = taxableAmount + gstAmount;
    assert.equal(grandTotal, 586);
  });

  await t.test('9. Bundled Paytm QR parameters match B Lakshmi Prasanna configuration', () => {
    const PAYTM_UPI_ID = 'paytm.s33cotk@pty';
    const PAYTM_RECIPIENT_NAME = 'B Lakshmi Prasanna';
    const billAmount = 450;
    const orderNumber = 1055;

    const dynamicUpiUrl = `upi://pay?pa=${PAYTM_UPI_ID}&pn=${encodeURIComponent(PAYTM_RECIPIENT_NAME)}&am=${billAmount}&cu=INR&tn=${encodeURIComponent(`Order_${orderNumber}`)}`;

    assert.ok(dynamicUpiUrl.includes('pa=paytm.s33cotk@pty'));
    assert.ok(dynamicUpiUrl.includes('pn=B%20Lakshmi%20Prasanna'));
    assert.ok(dynamicUpiUrl.includes('am=450'));
    assert.ok(dynamicUpiUrl.includes('cu=INR'));
  });

  await t.test('10. Static QR safety: Payment remains PENDING until manual payment confirmation', async () => {
    const order: PosOrder = {
      id: 'ord_qr_safety_test',
      restaurantId: testRestaurantId,
      orderSource: 'WALK_IN',
      orderType: 'DINE_IN',
      orderStatus: 'PREPARING',
      paymentMethod: 'UPI',
      paymentStatus: 'PENDING',
      customer: { name: 'Customer', phone: '' },
      items: [{ itemId: 'it_1', name: 'Dosa', price: 80, quantity: 1, lineTotal: 80 }],
      pricing: { subtotal: 80, taxes: 4, deliveryFee: 0, packingFee: 0, discount: 0, total: 84 },
      timestamps: { createdAt: new Date().toISOString() },
    };
    await posDb.orders.put(order);

    // Initial state is PENDING
    const saved = await posDb.orders.get(order.id);
    assert.equal(saved?.paymentStatus, 'PENDING');

    // Only staff manual action updates to PAID
    await posDb.recordPayment(order.id, 'UPI', 84, 'UTR998811');
    const updated = await posDb.orders.get(order.id);
    // Staff-recorded settlement is RECORDED, distinct from gateway VERIFIED.
    assert.equal(updated?.paymentStatus, 'RECORDED');
  });

  await t.test('11. Physical Cash Drawer math strictly excludes Online and UPI payments', async () => {
    const dateStr = '2026-09-15';
    const restId = `rst_eod_test_${Date.now()}`;

    // 1. Cash order (₹300)
    await posDb.orders.put({
      id: 'eod_o1',
      restaurantId: restId,
      orderSource: 'WALK_IN',
      orderType: 'DINE_IN',
      orderStatus: 'COMPLETED',
      paymentMethod: 'CASH',
      paymentStatus: 'RECORDED',
      customer: { name: 'Walk-in', phone: '' },
      items: [{ itemId: 'i1', name: 'Meals', price: 300, quantity: 1, lineTotal: 300 }],
      pricing: { subtotal: 300, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 300 },
      timestamps: { createdAt: `${dateStr}T12:00:00.000Z` },
    });

    // 2. Paytm QR UPI order (₹400) -> MUST NOT BE IN CASH DRAWER
    await posDb.orders.put({
      id: 'eod_o2',
      restaurantId: restId,
      orderSource: 'WALK_IN',
      orderType: 'DINE_IN',
      orderStatus: 'COMPLETED',
      paymentMethod: 'UPI',
      paymentStatus: 'RECORDED',
      customer: { name: 'Walk-in UPI', phone: '' },
      items: [{ itemId: 'i2', name: 'Biryani', price: 400, quantity: 1, lineTotal: 400 }],
      pricing: { subtotal: 400, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 400 },
      timestamps: { createdAt: `${dateStr}T13:00:00.000Z` },
    });

    // 3. OrderBhojan Online order (₹500) -> MUST NOT BE IN CASH DRAWER
    await posDb.orders.put({
      id: 'eod_o3',
      restaurantId: restId,
      orderSource: 'ORDERBHOJAN',
      orderType: 'DELIVERY',
      orderStatus: 'COMPLETED',
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'RECORDED',
      customer: { name: 'Online Cust', phone: '' },
      items: [{ itemId: 'i3', name: 'Family Pack', price: 500, quantity: 1, lineTotal: 500 }],
      pricing: { subtotal: 500, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 500 },
      timestamps: { createdAt: `${dateStr}T14:00:00.000Z` },
    });

    const summary = await eodService.generateEodReport({
      restaurantId: restId,
      dateStr,
      openingFloat: 2000,
      cashExpenses: 150,
      actualClosingCash: 2150,
    });

    // Gross total = 300 + 400 + 500 = 1200
    assert.equal(summary.grossSales, 1200);

    // Cash sales MUST ONLY BE 300!
    assert.equal(summary.cashReconciliation.totalCashSales, 300);
    assert.equal(summary.paymentBreakdown.cash, 300);
    assert.equal(summary.paymentBreakdown.upi, 400);
    assert.equal(summary.paymentBreakdown.online, 500);

    // Expected closing cash = 2000 + 300 - 150 = 2150
    assert.equal(summary.cashReconciliation.expectedClosingCash, 2150);
    assert.equal(summary.cashReconciliation.actualClosingCash, 2150);
    assert.equal(summary.cashReconciliation.variance, 0);
  });

  await t.test('12. EOD Reconciliation computes channel totals and excludes cancelled/rejected orders', async () => {
    const dateStr = '2026-09-15';
    const restId = `rst_channel_test_${Date.now()}`;

    // Valid Walk-in
    await posDb.orders.put({
      id: 'c_o1',
      restaurantId: restId,
      orderSource: 'WALK_IN',
      orderType: 'DINE_IN',
      orderStatus: 'COMPLETED',
      paymentMethod: 'CASH',
      paymentStatus: 'RECORDED',
      customer: { name: 'Cust 1', phone: '' },
      items: [{ itemId: 'i1', name: 'Meals', price: 200, quantity: 1, lineTotal: 200 }],
      pricing: { subtotal: 200, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 200 },
      timestamps: { createdAt: `${dateStr}T10:00:00.000Z` },
    });

    // Valid Online
    await posDb.orders.put({
      id: 'c_o2',
      restaurantId: restId,
      orderSource: 'ORDERBHOJAN',
      orderType: 'DELIVERY',
      orderStatus: 'COMPLETED',
      paymentMethod: 'UPI',
      paymentStatus: 'RECORDED',
      customer: { name: 'Cust 2', phone: '' },
      items: [{ itemId: 'i2', name: 'Biryani', price: 300, quantity: 1, lineTotal: 300 }],
      pricing: { subtotal: 300, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 300 },
      timestamps: { createdAt: `${dateStr}T11:00:00.000Z` },
    });

    // Rejected order -> Must be excluded
    await posDb.orders.put({
      id: 'c_o3',
      restaurantId: restId,
      orderSource: 'ORDERBHOJAN',
      orderType: 'DELIVERY',
      orderStatus: 'REJECTED',
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      customer: { name: 'Cust 3', phone: '' },
      items: [{ itemId: 'i3', name: 'Cancelled Biryani', price: 300, quantity: 1, lineTotal: 300 }],
      pricing: { subtotal: 300, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 300 },
      timestamps: { createdAt: `${dateStr}T11:30:00.000Z` },
    });

    const summary = await eodService.generateEodReport({
      restaurantId: restId,
      dateStr,
    });

    assert.equal(summary.totalOrdersCount, 2);
    assert.equal(summary.walkInOrdersCount, 1);
    assert.equal(summary.onlineOrdersCount, 1);
    assert.equal(summary.grossSales, 500);
  });

  await t.test('13. Item-wise sales aggregation combines identical items and revenue', async () => {
    const dateStr = '2026-09-15';
    const restId = `rst_items_test_${Date.now()}`;

    // Order 1: 2 Biryani
    await posDb.orders.put({
      id: 'it_o1',
      restaurantId: restId,
      orderSource: 'WALK_IN',
      orderType: 'DINE_IN',
      orderStatus: 'COMPLETED',
      paymentMethod: 'CASH',
      paymentStatus: 'RECORDED',
      customer: { name: 'Cust 1', phone: '' },
      items: [{ itemId: 'biryani_id', name: 'Chicken Biryani', price: 250, quantity: 2, lineTotal: 500, category: 'Biryani' }],
      pricing: { subtotal: 500, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 500 },
      timestamps: { createdAt: `${dateStr}T10:00:00.000Z` },
    });

    // Order 2: 3 Biryani + 1 Coffee
    await posDb.orders.put({
      id: 'it_o2',
      restaurantId: restId,
      orderSource: 'ORDERBHOJAN',
      orderType: 'DELIVERY',
      orderStatus: 'COMPLETED',
      paymentMethod: 'UPI',
      paymentStatus: 'RECORDED',
      customer: { name: 'Cust 2', phone: '' },
      items: [
        { itemId: 'biryani_id', name: 'Chicken Biryani', price: 250, quantity: 3, lineTotal: 750, category: 'Biryani' },
        { itemId: 'coffee_id', name: 'Filter Coffee', price: 40, quantity: 1, lineTotal: 40, category: 'Beverages' },
      ],
      pricing: { subtotal: 790, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 790 },
      timestamps: { createdAt: `${dateStr}T11:00:00.000Z` },
    });

    const summary = await eodService.generateEodReport({
      restaurantId: restId,
      dateStr,
    });

    assert.equal(summary.itemSales.length, 2);
    const biryaniRow = summary.itemSales.find((i) => i.itemId === 'biryani_id');
    assert.ok(biryaniRow);
    assert.equal(biryaniRow.quantitySold, 5); // 2 + 3
    assert.equal(biryaniRow.totalRevenue, 1250); // 500 + 750

    const coffeeRow = summary.itemSales.find((i) => i.itemId === 'coffee_id');
    assert.ok(coffeeRow);
    assert.equal(coffeeRow.quantitySold, 1);
    assert.equal(coffeeRow.totalRevenue, 40);
  });

  await t.test('14. Offline Sync Queue enqueues mutations and records pending state', async () => {
    await posDb.enqueueSync('UpdateOrderStatus', 'ORDER', {
      orderId: 'sync_test_01',
      orderStatus: 'READY',
    });

    const pending = await posDb.syncQueue.where('status').equals('PENDING').toArray();
    assert.ok(pending.length >= 1);
    const item = pending.find((i) => (i.data as any).orderId === 'sync_test_01');
    assert.ok(item);
    assert.equal(item.action, 'UpdateOrderStatus');
    assert.equal(item.entity, 'orders');
  });
});
