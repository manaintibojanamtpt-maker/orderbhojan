import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
import { PosDatabase, CURRENT_SCHEMA_VERSION } from '../src/features/pos/db/posDatabase';

const DB_NAME = 'OrderBhojanPosDb';
const TENANT = 'tenant_migration_a';

type LegacyPayment = {
  id: string;
  orderId: string;
  restaurantId: string;
  amount: number;
  method: string;
  status: string;
  recordedAt: string;
  synced?: boolean;
};

/**
 * Builds the shipped v2 schema directly, so the v3 upgrade path runs against the
 * exact shape real devices have on disk: legacy rows carried `restaurantId`
 * inside the serialized payload, not as a field of their own.
 */
async function seedV2Database() {
  const legacy = new Dexie(DB_NAME);
  legacy.version(1).stores({
    orders: 'id, onlineOrderId, restaurantId, orderSource, orderStatus, paymentStatus',
    menu: 'id, restaurantId, category, isAvailable',
    kots: 'id, orderId, kotNumber, restaurantId, status, createdAt',
    payments: 'id, orderId, restaurantId, method, status, recordedAt',
    syncQueue: 'id, action, entity, status, createdAt',
  });
  legacy.version(2).stores({
    orders: 'id, onlineOrderId, restaurantId, orderSource, orderStatus, paymentStatus',
    menu: 'id, restaurantId, category, isAvailable',
    kots: 'id, orderId, kotNumber, restaurantId, status, createdAt',
    payments: 'id, orderId, restaurantId, method, status, recordedAt',
    syncQueue: 'id, action, entity, entityType, entityId, status, createdAt',
    auditLogs: 'id, timestamp, action, entity, entityId',
    businessDayState: 'date, restaurantId, isClosed',
    backups: 'id, createdAt',
  });
  await legacy.open();
  assert.equal(legacy.verno, 2, 'probe must start on the shipped v2 schema');

  await legacy.table<LegacyPayment>('payments').put({
    id: 'pay_legacy',
    orderId: 'ord_legacy',
    restaurantId: TENANT,
    amount: 350,
    method: 'CASH',
    // v2 apps marked staff-collected cash as fully paid.
    status: 'PAID',
    recordedAt: new Date().toISOString(),
    synced: false,
  });
  await legacy.table('kots').put({
    id: 'kot_legacy',
    kotNumber: 1,
    orderId: 'ord_legacy',
    restaurantId: TENANT,
    orderType: 'DELIVERY',
    items: [],
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    synced: false,
  });
  await legacy.table('syncQueue').put({
    id: 'sync_legacy_payment',
    action: 'RECORD_PAYMENT',
    entity: 'payments',
    data: { orderId: 'ord_legacy', amount: 350, method: 'CASH', restaurantId: TENANT },
    createdAt: new Date().toISOString(),
    retryCount: 1,
    status: 'PENDING',
  });
  await legacy.table('syncQueue').put({
    id: 'sync_legacy_inflight',
    action: 'UPDATE_STATUS',
    entity: 'orders',
    data: { orderId: 'ord_legacy', orderStatus: 'ACCEPTED', restaurantId: TENANT },
    createdAt: new Date().toISOString(),
    retryCount: 2,
    status: 'SYNCING',
  });
  await legacy.table('syncQueue').put({
    id: 'sync_legacy_acked',
    action: 'UPDATE_STATUS',
    entity: 'orders',
    data: { orderId: 'ord_legacy_done', orderStatus: 'ACCEPTED', restaurantId: TENANT },
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    retryCount: 0,
    status: 'SYNCED',
  });
  // Worst case: a row with no recoverable tenant anywhere in its payload.
  await legacy.table('syncQueue').put({
    id: 'sync_legacy_no_tenant',
    action: 'UPDATE_STATUS',
    entity: 'orders',
    data: { orderId: 'ord_orphan', orderStatus: 'ACCEPTED' },
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: 'PENDING',
  });
  legacy.close();
}

test('POS database migration — a v2 device upgrades to the current schema with no unsynced loss', async (t) => {
  await Dexie.delete(DB_NAME);
  await seedV2Database();

  await t.test('the upgrade runs and produces the current schema', async () => {
    const upgraded = new PosDatabase();
    await upgraded.open();
    assert.equal(upgraded.verno, CURRENT_SCHEMA_VERSION);
    assert.ok(
      upgraded.tables.some((table) => table.name === 'syncLeases'),
      'the durable lease table exists after the upgrade'
    );
    assert.equal(
      (await upgraded.syncQueue.get('sync_legacy_acked'))?.status,
      'SYNCED',
      'already-acknowledged work stays acknowledged'
    );
    upgraded.close();
  });

  await t.test('an unsynced payment and KOT are preserved, never dropped', async () => {
    const upgraded = new PosDatabase();
    await upgraded.open();
    const payment = await upgraded.payments.get('pay_legacy');
    assert.ok(payment, 'unsynced legacy payment must survive the upgrade');
    assert.equal(payment.amount, 350);
    assert.equal(payment.synced, false, 'unsynced payment must not be marked synced');
    assert.ok(await upgraded.kots.get('kot_legacy'), 'unsynced legacy KOT must survive the upgrade');
    upgraded.close();
  });

  await t.test('legacy queue rows are backfilled into the tenant-scoped command shape', async () => {
    const upgraded = new PosDatabase();
    await upgraded.open();

    const payment = await upgraded.syncQueue.get('sync_legacy_payment');
    assert.ok(payment);
    assert.equal(payment.entityType, 'PAYMENT');
    assert.equal(payment.tenantId, TENANT, 'tenant is recovered from the legacy payload');
    assert.equal(payment.payload?.orderId, 'ord_legacy');
    assert.equal(payment.status, 'PENDING', 'legacy pending work stays pending');
    assert.equal(payment.clientSequence, payment.orderSequence);

    const inflight = await upgraded.syncQueue.get('sync_legacy_inflight');
    assert.equal(inflight?.status, 'SYNCING', 'interrupted state is preserved for recovery');
    assert.equal(inflight?.tenantId, TENANT);
    assert.equal(inflight?.retryCount, 2);
    assert.equal(inflight?.entityType, 'ORDER');
    upgraded.close();
  });

  await t.test('a row with no recoverable tenant is surfaced, not silently stranded', async () => {
    const upgraded = new PosDatabase();
    await upgraded.open();
    const orphan = await upgraded.syncQueue.get('sync_legacy_no_tenant');
    assert.ok(orphan, 'the row is still present and recoverable');
    assert.equal(orphan?.status, 'BLOCKED');
    assert.equal(orphan?.failureCode, 'TENANT_REQUIRED');
    assert.match(orphan?.failureDetail ?? '', /Select the restaurant/i);

    // It must be visible to the operator, not invisible to every tenant scope.
    const blockedForTenant = (await upgraded.getBlockedCommands(TENANT)).map((row) => row.id);
    assert.deepEqual(blockedForTenant, [], 'tenant-scoped rows must not be reported blocked');
    assert.deepEqual(
      (await upgraded.getDispatchableCommands(TENANT)).map((row) => row.id),
      ['sync_legacy_payment'],
      'only known-tenant pending work is dispatchable'
    );
    upgraded.close();
  });

  await t.test('interrupted work becomes dispatchable again after restart', async () => {
    const upgraded = new PosDatabase();
    await upgraded.open();
    const recovered = await upgraded.recoverInFlightCommands({ tenantId: TENANT });
    assert.equal(recovered, 1);
    assert.equal((await upgraded.syncQueue.get('sync_legacy_inflight'))?.status, 'PENDING');

    const dispatchable = await upgraded.getDispatchableCommands(TENANT);
    assert.ok(
      dispatchable.some((item) => item.id === 'sync_legacy_inflight'),
      'recovered work must be dispatchable'
    );
    upgraded.close();
  });

  await t.test('already-acknowledged work is eligible for retention', async () => {
    const upgraded = new PosDatabase();
    await upgraded.open();
    const purged = await upgraded.purgeAcknowledgedCommands(TENANT);
    assert.equal(purged, 1);
    assert.equal(await upgraded.syncQueue.get('sync_legacy_acked'), undefined);
    assert.ok(await upgraded.syncQueue.get('sync_legacy_payment'), 'pending work is never purged');
    assert.ok(await upgraded.syncQueue.get('sync_legacy_inflight'), 'recovered work is never purged');
    upgraded.close();
  });

  await Dexie.delete(DB_NAME);
});

/**
 * The v4 upgrade introduces the durable lease. A device that is mid-queue when
 * the app updates must keep its unsynced work, and an in-flight command must not
 * be silently reset into something re-sendable.
 */
test('POS database migration — a v3 device picks up the sync lease without losing work', async (t) => {
  await Dexie.delete(DB_NAME);

  const v3 = new Dexie(DB_NAME);
  v3.version(3).stores({
    orders:
      'id, onlineOrderId, restaurantId, orderSource, orderStatus, paymentStatus, canonicalOrderStatus',
    menu: 'id, restaurantId, category, isAvailable',
    kots: 'id, orderId, kotNumber, restaurantId, status, createdAt',
    payments: 'id, orderId, restaurantId, method, status, recordedAt',
    syncQueue:
      'id, tenantId, deviceId, clientSequence, orderSequence, status, nextAttemptAt, acknowledgedAt, createdAt, [tenantId+status], [tenantId+orderSequence]',
    auditLogs: 'id, timestamp, action, entity, entityId',
    businessDayState: 'date, restaurantId, isClosed',
    backups: 'id, createdAt',
  });
  await v3.open();
  assert.equal(v3.verno, 3, 'probe must start on the v3 schema');

  await v3.table('syncQueue').bulkPut([
    {
      id: 'v3_pending',
      action: 'CreateOrder',
      tenantId: TENANT,
      entityType: 'ORDER',
      entityId: 'ord_v3',
      payload: { orderId: 'ord_v3', items: [{ menuItemId: 'm1', quantity: 1 }] },
      status: 'PENDING',
      clientSequence: 1,
      orderSequence: 1,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    },
    {
      id: 'v3_inflight',
      action: 'AcceptOrder',
      tenantId: TENANT,
      entityType: 'ORDER',
      entityId: 'ord_v3',
      payload: { orderId: 'ord_v3' },
      status: 'SYNCING',
      clientSequence: 2,
      orderSequence: 2,
      createdAt: new Date().toISOString(),
      retryCount: 1,
    },
  ]);
  v3.close();

  const upgraded = new PosDatabase();
  await upgraded.open();

  assert.equal(upgraded.verno, CURRENT_SCHEMA_VERSION);
  assert.ok(upgraded.tables.some((table) => table.name === 'syncLeases'));

  const pending = await upgraded.syncQueue.get('v3_pending');
  assert.ok(pending, 'unsynced pending work survives the lease upgrade');
  assert.equal(pending.status, 'PENDING');
  assert.equal(pending.payload?.orderId, 'ord_v3');

  const inflight = await upgraded.syncQueue.get('v3_inflight');
  assert.equal(inflight?.status, 'SYNCING', 'in-flight state is preserved, not reset');
  assert.equal(
    inflight?.leaseFence,
    undefined,
    'a pre-lease row carries no fence, which is what makes it recoverable'
  );

  // No lease is invented by the upgrade; the next worker takes the first token.
  assert.equal(await upgraded.readSyncLease(), undefined);
  const taken = await upgraded.acquireSyncLease('worker_after_upgrade');
  assert.equal(taken.acquired, true);
  assert.equal(taken.token, 1);

  upgraded.close();
  await Dexie.delete(DB_NAME);
});