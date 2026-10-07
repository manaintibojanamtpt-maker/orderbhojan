import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
import { PosDatabase } from '../src/features/pos/db/posDatabase';
import type { PosOrder, SyncQueueItem } from '../src/features/pos/domain/pos.types';

const TENANT = 'tenant_offline_a';
const OTHER_TENANT = 'tenant_offline_b';

const makeOrder = (over: Partial<PosOrder> = {}): PosOrder => ({
  id: `ord_${Math.random().toString(36).slice(2, 10)}`,
  onlineOrderId: `ord_${Math.random().toString(36).slice(2, 10)}`,
  restaurantId: TENANT,
  orderSource: 'ORDERBHOJAN',
  orderType: 'DELIVERY',
  orderStatus: 'ACCEPTED',
  paymentMethod: 'CASH',
  paymentStatus: 'PENDING',
  customer: { name: 'Guest', phone: '9999999999' },
  items: [{ itemId: 'i1', name: 'Meals', price: 200, quantity: 1, lineTotal: 200 }],
  pricing: { subtotal: 200, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 200 },
  timestamps: { createdAt: new Date().toISOString() },
  version: 3,
  ...over,
});

/**
 * A fresh PosDatabase instance over the same IndexedDB simulates an app restart:
 * nothing survives in memory, only what was durably written.
 */
const reopen = () => new PosDatabase();

test('offline POS queue â€” durability across restart', async (t) => {
  await t.test('an interrupted in-flight command is recovered to PENDING after restart', async () => {
    const db = new PosDatabase();
    const item = await db.enqueueSync(
      'UpdateOrderStatus',
      'ORDER',
      { orderId: 'ord_recover', orderStatus: 'ACCEPTED' },
      { tenantId: TENANT, deviceId: 'pos_1' }
    );
    // Simulate the tab being killed mid-request.
    item.status = 'SYNCING';
    item.lastAttemptAt = new Date().toISOString();
    await db.syncQueue.put(item);

    const afterRestart = reopen();
    const recovered = await afterRestart.recoverInFlightCommands({ tenantId: TENANT });
    assert.equal(recovered, 1);

    const restored = await afterRestart.syncQueue.get(item.id);
    assert.equal(restored?.status, 'PENDING');
    assert.match(restored?.lastError ?? '', /interrupted/i);
  });

  await t.test('recovery is scoped to the tenant so another device queue is untouched', async () => {
    const db = new PosDatabase();
    const mine = await db.enqueueSync('MarkReady', 'ORDER', { orderId: 'o1' }, { tenantId: TENANT });
    const theirs = await db.enqueueSync('MarkReady', 'ORDER', { orderId: 'o2' }, { tenantId: OTHER_TENANT });
    mine.status = 'SYNCING';
    theirs.status = 'SYNCING';
    await db.syncQueue.put(mine);
    await db.syncQueue.put(theirs);

    const afterRestart = reopen();
    assert.equal(await afterRestart.recoverInFlightCommands({ tenantId: TENANT }), 1);
    assert.equal((await afterRestart.syncQueue.get(mine.id))?.status, 'PENDING');
    assert.equal((await afterRestart.syncQueue.get(theirs.id))?.status, 'SYNCING');
  });

  await t.test('an unsynced payment survives restart and is still queued', async () => {
    const db = new PosDatabase();
    const order = makeOrder({ orderStatus: 'READY' });
    await db.orders.put(order);
    const result = await db.recordPayment(order.id, 'CASH', 200, 'CASH-REF-1', {
      tenantId: TENANT,
      deviceId: 'pos_1',
    });
    assert.equal(result.success, true);

    const afterRestart = reopen();
    const payments = await afterRestart.payments.where('orderId').equals(order.id).toArray();
    assert.equal(payments.length, 1);
    assert.equal(payments[0].status, 'RECORDED');
    assert.equal(payments[0].synced, false);

    const queue = await afterRestart.syncQueue.where('tenantId').equals(TENANT).toArray();
    assert.ok(queue.some((item) => item.action === 'RecordPayment'));
    assert.ok(queue.every((item) => item.status === 'PENDING'));
  });

  await t.test('a KOT queued offline is not lost on restart', async () => {
    const db = new PosDatabase();
    const order = makeOrder({ orderStatus: 'ACCEPTED' });
    await db.orders.put(order);
    await db.createKot(order, { tenantId: TENANT, deviceId: 'pos_1' });

    const afterRestart = reopen();
    const kots = await afterRestart.kots.where('orderId').equals(order.id).toArray();
    assert.equal(kots.length, 1);
    const queued = await afterRestart.syncQueue.where('tenantId').equals(TENANT).toArray();
    assert.ok(queued.some((item) => item.action === 'CreateKot'));
  });
});

test('offline POS queue â€” ordering and idempotency', async (t) => {
  await t.test('orderSequence increases per order so dependent commands cannot overtake', async () => {
    const db = new PosDatabase();
    const a1 = await db.enqueueSync('AcceptOrder', 'ORDER', { orderId: 'ord_seq' }, { tenantId: TENANT });
    const a2 = await db.enqueueSync('RecordPayment', 'PAYMENT', { orderId: 'ord_seq', method: 'CASH' }, { tenantId: TENANT });
    const a3 = await db.enqueueSync('UpdateOrderStatus', 'ORDER', { orderId: 'ord_seq', orderStatus: 'COMPLETED' }, { tenantId: TENANT });
    assert.ok(a1.orderSequence! < a2.orderSequence!);
    assert.ok(a2.orderSequence! < a3.orderSequence!);
  });

  await t.test('different orders get independent sequences', async () => {
    const db = new PosDatabase();
    const one = await db.enqueueSync('AcceptOrder', 'ORDER', { orderId: 'ord_one' }, { tenantId: TENANT });
    const two = await db.enqueueSync('AcceptOrder', 'ORDER', { orderId: 'ord_two' }, { tenantId: TENANT });
    assert.equal(one.orderSequence, 1);
    assert.equal(two.orderSequence, 1);
  });

  await t.test('the queue id is a stable idempotency key that survives retries', async () => {
    const db = new PosDatabase();
    const item = await db.enqueueSync('AcceptOrder', 'ORDER', { orderId: 'ord_key' }, { tenantId: TENANT });
    await db.markCommandRetry(item, 'network', 'CONNECTION', Date.now() - 1);
    const retried = await db.syncQueue.get(item.id);
    assert.equal(retried?.id, item.id);
    assert.equal(retried?.retryCount, 1);
    assert.equal(retried?.status, 'PENDING');
  });

  await t.test('a duplicate local payment is rejected without creating a second record', async () => {
    const db = new PosDatabase();
    const order = makeOrder();
    await db.orders.put(order);
    await db.recordPayment(order.id, 'CASH', 200, 'REF-A', { tenantId: TENANT });
    const second = await db.recordPayment(order.id, 'CASH', 200, 'REF-B', { tenantId: TENANT });
    assert.equal(second.success, false);
    assert.equal(second.alreadyPaid, true);
    const payments = await db.payments.where('orderId').equals(order.id).toArray();
    assert.equal(payments.length, 1);
    assert.equal(payments[0].reference, 'REF-A');
  });
});

test('offline POS queue â€” failure visibility and re-authentication', async (t) => {
  await t.test('an auth failure blocks rather than fails, and consumes no retry', async () => {
    const db = new PosDatabase();
    const item = await db.enqueueSync('AcceptOrder', 'ORDER', { orderId: 'ord_auth' }, { tenantId: TENANT });
    await db.markCommandBlocked(item, 'Session expired.', 'AUTH_REQUIRED');
    const stored = await db.syncQueue.get(item.id);
    assert.equal(stored?.status, 'BLOCKED');
    assert.equal(stored?.retryCount, 0);
    assert.equal(stored?.failureCode, 'AUTH_REQUIRED');
    assert.equal(stored?.failureDetail, 'Session expired.');
  });

  await t.test('releasing auth-blocked work returns it to PENDING with the same ids', async () => {
    const db = new PosDatabase();
    const item = await db.enqueueSync('AcceptOrder', 'ORDER', { orderId: 'ord_reauth' }, { tenantId: TENANT });
    await db.markCommandBlocked(item, 'Session expired.', 'AUTH_REQUIRED');

    const released = await db.releaseAuthBlockedCommands(TENANT);
    assert.ok(released >= 1);
    const restored = await db.syncQueue.get(item.id);
    assert.equal(restored?.status, 'PENDING');
    assert.equal(restored?.nextAttemptAt, undefined);
  });

  await t.test('a permanent failure is reported with actionable detail', async () => {
    const db = new PosDatabase();
    const item = await db.enqueueSync('UpdateOrderStatus', 'ORDER', { orderId: 'ord_perm' }, { tenantId: TENANT });
    await db.markCommandBlocked(item, "Cannot transition order from 'READY' to 'ACCEPTED'.", 'INVALID');
    const stored = await db.syncQueue.get(item.id);
    assert.equal(stored?.status, 'FAILED');
    assert.match(stored?.failureDetail ?? '', /Cannot transition/);
  });

  await t.test('queue depth separates pending, in-flight and blocked', async () => {
    const db = new PosDatabase();
    const suffix = Math.random().toString(36).slice(2, 8);
    const tenant = `tenant_depth_${suffix}`;
    const pending = await db.enqueueSync('AcceptOrder', 'ORDER', { orderId: 'o1' }, { tenantId: tenant });
    const inFlight = await db.enqueueSync('AcceptOrder', 'ORDER', { orderId: 'o2' }, { tenantId: tenant });
    const blocked = await db.enqueueSync('AcceptOrder', 'ORDER', { orderId: 'o3' }, { tenantId: tenant });
    inFlight.status = 'SYNCING';
    await db.syncQueue.put(inFlight);
    await db.markCommandBlocked(blocked, 'nope', 'INVALID');

    const depth = await db.getQueueDepth(tenant);
    assert.equal(depth.pending, 1);
    assert.equal(depth.inFlight, 1);
    assert.equal(depth.blocked, 1);
    assert.ok(pending.id);
  });

  await t.test('backoff gates keep a command from being attempted early', async () => {
    const db = new PosDatabase();
    const tenant = `tenant_backoff_${Math.random().toString(36).slice(2, 8)}`;
    const item = await db.enqueueSync('AcceptOrder', 'ORDER', { orderId: 'o1' }, { tenantId: tenant });
    await db.markCommandRetry(item, 'network down', 'CONNECTION', Date.now() + 60_000);

    const early = await db.getDispatchableCommands(tenant, Date.now());
    assert.equal(early.length, 0);
    const later = await db.getDispatchableCommands(tenant, Date.now() + 61_000);
    assert.equal(later.length, 1);
  });
});

test('offline POS queue â€” retention never discards unacknowledged work', async (t) => {
  await t.test('only acknowledged commands past the retention window are purged', async () => {
    const db = new PosDatabase();
    const tenant = `tenant_retention_${Math.random().toString(36).slice(2, 8)}`;
    const longAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const oldAck = await db.enqueueSync('AcceptOrder', 'ORDER', { orderId: 'o1' }, { tenantId: tenant });
    oldAck.status = 'SYNCED';
    oldAck.acknowledgedAt = longAgo;
    await db.syncQueue.put(oldAck);

    const newAck = await db.enqueueSync('AcceptOrder', 'ORDER', { orderId: 'o2' }, { tenantId: tenant });
    newAck.status = 'SYNCED';
    newAck.acknowledgedAt = Date.now();
    await db.syncQueue.put(newAck);

    const unsynced = await db.enqueueSync('RecordPayment', 'PAYMENT', { orderId: 'o3' }, { tenantId: tenant });
    unsynced.createdAt = new Date(longAgo).toISOString();
    await db.syncQueue.put(unsynced);

    const purged = await db.purgeAcknowledgedCommands(tenant);
    assert.equal(purged, 1);
    assert.equal(await db.syncQueue.get(oldAck.id), undefined);
    assert.ok(await db.syncQueue.get(newAck.id));
    assert.ok(await db.syncQueue.get(unsynced.id));
  });
});

test('offline POS queue â€” confirmed versus optimistic state', async (t) => {
  await t.test('a queued status change is optimistic until the server acknowledges', async () => {
    const db = new PosDatabase();
    const tenant = `tenant_confirm_${Math.random().toString(36).slice(2, 8)}`;
    const order = makeOrder({ orderStatus: 'NEW', confirmedVersion: 4, confirmedStatus: 'PLACED' });
    await db.orders.put(order);

    await db.updateOrderStatus(order.id, 'ACCEPTED', undefined, { tenantId: tenant, deviceId: 'pos_1' });
    const optimistic = await db.orders.get(order.id);
    assert.equal(optimistic?.orderStatus, 'ACCEPTED');
    assert.equal(optimistic?.synced, false);
    assert.equal(optimistic?.confirmedStatus, 'PLACED');
    assert.equal(optimistic?.confirmedVersion, 4);

    const queued = await db.syncQueue.where('tenantId').equals(tenant).toArray();
    assert.equal(queued.length, 1);
    await db.markCommandAcknowledged(queued[0], {
      version: 5,
      orderStatus: 'ACCEPTED',
      paymentStatus: 'PENDING',
    });

    const confirmed = await db.orders.get(order.id);
    assert.equal(confirmed?.synced, true);
    assert.equal(confirmed?.confirmedVersion, 5);
    assert.equal(confirmed?.confirmedStatus, 'ACCEPTED');
  });
});
