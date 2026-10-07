/**
 * Phase A acceptance — Gap 1: CreateOrder.
 *
 * A POS walk-in bill used to be a purely local row plus a queue of
 * CreateKot/UpdateOrderStatus commands pointed at an order id the server had
 * never heard of. Everything after it was therefore rejected with
 * ORDER_NOT_FOUND, and the sale existed only on the terminal.
 *
 * These tests pin the replacement:
 *  - a durable client-minted order identity that the server adopts as its
 *    document id,
 *  - server-side validation that recomputes the money,
 *  - one atomic commit of order + receipt + outbox,
 *  - a legacy queue migration that replays `CREATE_ORDER` as an order creation
 *    and never as a status update,
 *  - the `expectedVersion` contract, separating a transport retry from a revised
 *    command after a concurrency conflict.
 */

import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { posDb } from '../src/features/pos/db/posDatabase';
import { planQueuedCommand } from '../src/features/pos/services/posCommandPlanner';
import { ORDER_COMMAND_TYPES } from '../src/features/pos/services/posCommandContract';
import type { PosOrder } from '../src/features/pos/domain/pos.types';

const SERVER_CONTRACT_PATH =
  'F:/Manaintibojanam_final2/manaintibojanam-backend/backend-lib/orders/orderCommandContract.ts';

const walkInOrder = (over: Partial<PosOrder> = {}): PosOrder => {
  const id = over.id ?? `pos_walkin_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  return {
    id,
    onlineOrderId: id,
    restaurantId: 'tenant_acme',
    orderNumber: 4242,
    orderSource: 'WALK_IN',
    orderType: 'DINE_IN',
    orderStatus: 'NEW',
    paymentMethod: 'CASH',
    paymentStatus: 'PENDING',
    customer: { name: 'Walk-in Customer', phone: '9000000000', tableNo: 'T4' },
    items: [
      { itemId: 'menu_biryani', name: 'Biryani', price: 250, quantity: 2, lineTotal: 500 },
      { itemId: 'menu_naan', name: 'Naan', price: 40, quantity: 1, lineTotal: 40 },
    ],
    pricing: { subtotal: 540, taxes: 27, deliveryFee: 0, packingFee: 0, discount: 0, total: 567 },
    timestamps: { createdAt: new Date().toISOString() },
    ...over,
  } as PosOrder;
};

test('Gap 1 — CreateOrder command vocabulary is shared with the server', async (t) => {
  await t.test('the server contract file lists CreateOrder and the client mirrors it', () => {
    const source = readFileSync(SERVER_CONTRACT_PATH, 'utf8');
    assert.match(
      source,
      /export const ORDER_COMMAND_TYPES = \[[\s\S]*?'CreateOrder'/,
      'the authoritative server vocabulary must offer CreateOrder'
    );
    assert.ok(ORDER_COMMAND_TYPES.includes('CreateOrder'));
  });

  await t.test('the planner can emit every command the server accepts', () => {
    for (const type of ORDER_COMMAND_TYPES) {
      assert.equal(typeof type, 'string');
    }
    assert.equal(ORDER_COMMAND_TYPES.length, 8);
  });
});

test('Gap 1 — a walk-in bill gets a durable client→server identity', async (t) => {
  await t.test('CreateOrder is queued first and carries the order id as the identity', async () => {
    const order = walkInOrder();
    const queued = await posDb.createWalkInOrder(order, { tenantId: 'tenant_acme', deviceId: 'pos_a' });

    assert.equal(queued.action, 'CreateOrder');
    assert.equal(queued.status, 'PENDING');
    assert.equal(queued.tenantId, 'tenant_acme');
    assert.equal(queued.payload?.orderId, order.id);
    // The queue record id doubles as the Idempotency-Key, so a retry of the
    // creation can never open a second bill.
    assert.equal(queued.id.length > 16, true);
    assert.equal(queued.entityId, order.id);
  });

  await t.test('the local order row survives so the bill is visible offline', async () => {
    const order = walkInOrder();
    await posDb.createWalkInOrder(order, { tenantId: 'tenant_acme' });
    const stored = await posDb.orders.get(order.id);
    assert.ok(stored, 'the walk-in order is persisted locally before it is ever sent');
    assert.equal(stored?.synced, false);
  });

  await t.test('a later command for the same order is ordered after the creation', async () => {
    const order = walkInOrder();
    await posDb.createWalkInOrder(order, { tenantId: 'tenant_acme' });
    await posDb.createKot(order, { tenantId: 'tenant_acme' });

    const rows = (await posDb.syncQueue.where('tenantId').equals('tenant_acme').toArray())
      .filter((row) => row.payload?.orderId === order.id)
      .sort((a, b) => (a.orderSequence ?? 0) - (b.orderSequence ?? 0));

    assert.equal(rows.length, 2);
    assert.equal(rows[0].action, 'CreateOrder', 'the creation is the head of the order chain');
    assert.equal(rows[1].action, 'CreateKot');
    assert.equal(
      rows[1].orderSequence! > rows[0].orderSequence!,
      true,
      'the KOT must be sent after the order exists on the server'
    );
  });

  await t.test('the tenant scope is enforced when queuing a bill', async () => {
    const order = walkInOrder({ restaurantId: 'tenant_other' } as Partial<PosOrder>);
    await assert.rejects(
      () => posDb.createWalkInOrder(order, { tenantId: 'tenant_acme' }),
      /scoped to tenant_acme/,
      'a bill must never be attributed to a tenant the terminal is not scoped to'
    );
  });
});

test('Gap 1 — the server validates and reprices the bill', async (t) => {
  await t.test('the planner sends items and customer, never a total', () => {
    const order = walkInOrder();
    const queued = {
      id: 'sync_create_1',
      tenantId: 'tenant_acme',
      orderId: order.id,
      clientSequence: 1,
      orderSequence: 1,
      action: 'CreateOrder',
      payload: {
        orderId: order.id,
        orderType: 'DINE_IN',
        paymentMethod: 'CASH',
        customer: order.customer,
        items: order.items,
        discountPercent: 0,
        gstPercent: 0,
        // A hostile or stale client total that must not survive planning.
        total: 1,
        pricing: { total: 1 },
      },
    };
    const plan = planQueuedCommand(queued);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.command.type, 'CreateOrder');
    assert.equal('total' in plan.command.payload, false);
    assert.equal('pricing' in plan.command.payload, false);
    assert.deepEqual(plan.command.payload.customer, order.customer);
  });

  await t.test('a creation never asserts a version the order cannot have', () => {
    const plan = planQueuedCommand({
      id: 'sync_create_2',
      tenantId: 'tenant_acme',
      orderId: 'pos_new',
      clientSequence: 1,
      orderSequence: 1,
      action: 'CreateOrder',
      expectedVersion: 7,
      payload: {
        orderId: 'pos_new',
        orderType: 'DINE_IN',
        paymentMethod: 'CASH',
        customer: { name: 'G', phone: '' },
        items: [{ itemId: 'i', name: 'I', unitPrice: 10, quantity: 1 }],
      },
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(
      plan.command.expectedVersion,
      undefined,
      'a brand new order has no prior version to assert'
    );
  });

  await t.test('a bill with no items is a visible failure, not an empty order', () => {
    const plan = planQueuedCommand({
      id: 'sync_create_3',
      tenantId: 'tenant_acme',
      orderId: 'pos_new',
      clientSequence: 1,
      orderSequence: 1,
      action: 'CreateOrder',
      payload: { orderId: 'pos_new', customer: { name: 'G' }, items: [] },
    });
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, 'INVALID');
    assert.match(plan.detail, /nothing to bill/i);
    assert.match(plan.detail, /not been discarded/i);
  });

  await t.test('a POS bill may not be opened on a gateway method', () => {
    const plan = planQueuedCommand({
      id: 'sync_create_4',
      tenantId: 'tenant_acme',
      orderId: 'pos_new',
      clientSequence: 1,
      orderSequence: 1,
      action: 'CreateOrder',
      payload: {
        orderId: 'pos_new',
        orderType: 'DINE_IN',
        paymentMethod: 'RAZORPAY',
        customer: { name: 'G', phone: '' },
        items: [{ itemId: 'i', name: 'I', unitPrice: 10, quantity: 1 }],
      },
    });
    // The planner forwards the method; the server is the authority that rejects
    // it. Forwarding keeps the refusal visible in one place with one message.
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.command.payload.paymentMethod, 'RAZORPAY');
  });

  await t.test('an unknown order type is refused before any network call', () => {
    const plan = planQueuedCommand({
      id: 'sync_create_5',
      tenantId: 'tenant_acme',
      orderId: 'pos_new',
      clientSequence: 1,
      orderSequence: 1,
      action: 'CreateOrder',
      payload: {
        orderId: 'pos_new',
        orderType: 'TELEPORT',
        customer: { name: 'G', phone: '' },
        items: [{ itemId: 'i', name: 'I', unitPrice: 10, quantity: 1 }],
      },
    });
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.match(plan.detail, /DINE_IN, PICKUP, DELIVERY/);
  });
});

test('Gap 1 — legacy CREATE_ORDER records migrate to a real order creation', async (t) => {
  const legacyItem = {
    id: 'sync_legacy_1',
    tenantId: 'tenant_acme',
    orderId: 'pos_legacy_1',
    clientSequence: 7,
    orderSequence: 1,
    action: 'CREATE_ORDER',
    payload: {
      orderId: 'pos_legacy_1',
      orderType: 'DINE_IN',
      paymentMethod: 'CASH',
      customer: { name: 'Offline Guest', phone: '9000000001' },
      items: [{ itemId: 'menu_1', name: 'Meals', unitPrice: 200, quantity: 1 }],
      // Legacy rows carried a client-computed total. It must not be replayed.
      total: 200,
    },
  };

  await t.test('CREATE_ORDER becomes CreateOrder, never a status update', () => {
    const plan = planQueuedCommand(legacyItem);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(
      plan.command.type,
      'CreateOrder',
      'replaying an order creation as a status change would target an order the server never had'
    );
    assert.notEqual(plan.command.type, 'UpdateOrderStatus');
  });

  await t.test('the migrated command keeps its identity and idempotency key', () => {
    const plan = planQueuedCommand(legacyItem);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.command.commandId, 'sync_legacy_1');
    assert.equal(plan.command.orderId, 'pos_legacy_1');
  });

  await t.test('the legacy client total is dropped rather than replayed', () => {
    const plan = planQueuedCommand(legacyItem);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal('total' in plan.command.payload, false);
  });

  await t.test('COD and UPI legacy spellings map to staff-recorded methods', () => {
    const cod = planQueuedCommand({
      ...legacyItem,
      id: 'sync_legacy_cod',
      payload: { ...legacyItem.payload, paymentMethod: 'COD' },
    });
    assert.equal(cod.ok, true);
    if (cod.ok) assert.equal(cod.command.payload.paymentMethod, 'CASH');

    const upi = planQueuedCommand({
      ...legacyItem,
      id: 'sync_legacy_upi',
      payload: { ...legacyItem.payload, paymentMethod: 'UPI' },
    });
    assert.equal(upi.ok, true);
    if (upi.ok) assert.equal(upi.command.payload.paymentMethod, 'UPI_MANUAL');
  });

  await t.test('a legacy creation with no items is surfaced, not silently dropped', () => {
    const plan = planQueuedCommand({
      ...legacyItem,
      id: 'sync_legacy_empty',
      payload: { orderId: 'pos_legacy_1', customer: { name: 'G' }, items: [] },
    });
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, 'INVALID');
  });
});

test('Gap 1 — expectedVersion: transport retry vs revised command', async (t) => {
  await t.test('a transport retry is byte-identical, so the server replays it', () => {
    // The POS resends the same queue record: same commandId, same
    // expectedVersion. That is a pure transport retry and needs no special
    // handling in the client at all.
    const first = planQueuedCommand({
      id: 'sync_retry',
      tenantId: 'tenant_acme',
      orderId: 'pos_1',
      clientSequence: 3,
      orderSequence: 1,
      action: 'AcceptOrder',
      expectedVersion: 4,
      payload: {},
    });
    const retry = planQueuedCommand({
      id: 'sync_retry',
      tenantId: 'tenant_acme',
      orderId: 'pos_1',
      clientSequence: 3,
      orderSequence: 1,
      action: 'AcceptOrder',
      expectedVersion: 4,
      payload: {},
    });
    assert.equal(first.ok && retry.ok, true);
    if (!first.ok || !retry.ok) return;
    assert.equal(first.command.commandId, retry.command.commandId);
    assert.equal(first.command.expectedVersion, retry.command.expectedVersion);
    assert.deepEqual(first.command.payload, retry.command.payload);
  });

  await t.test('a revision after a conflict keeps the command id and moves the precondition', () => {
    // CONCURRENCY_CONFLICT carries the authoritative version and pins no
    // receipt, so keeping the id while replacing expectedVersion is a legitimate
    // retry of the same intent. Changing the commandId instead would abandon the
    // audit trail and could double-apply.
    const stale = planQueuedCommand({
      id: 'sync_conflict',
      tenantId: 'tenant_acme',
      orderId: 'pos_1',
      clientSequence: 3,
      orderSequence: 1,
      action: 'RecordPayment',
      expectedVersion: 4,
      payload: { method: 'CASH', amount: 250 },
    });
    const revised = planQueuedCommand({
      id: 'sync_conflict',
      tenantId: 'tenant_acme',
      orderId: 'pos_1',
      clientSequence: 3,
      orderSequence: 1,
      action: 'RecordPayment',
      expectedVersion: 9,
      payload: { method: 'CASH', amount: 250 },
    });
    assert.equal(stale.ok && revised.ok, true);
    if (!stale.ok || !revised.ok) return;
    assert.equal(revised.command.commandId, stale.command.commandId, 'the identity never changes');
    assert.equal(revised.command.expectedVersion, 9);
    assert.deepEqual(
      revised.command.payload,
      stale.command.payload,
      'the revision changes only the precondition, never the intent'
    );
  });

  await t.test('the conflict revision is persisted on the queue record', async () => {
    const queued = await posDb.enqueueSync(
      'AcceptOrder',
      'ORDER',
      { orderId: 'pos_rev_1' },
      { tenantId: 'tenant_acme', expectedVersion: 3 }
    );
    assert.equal(queued.expectedVersion, 3);

    const lease = await posDb.acquireSyncLease('worker_test_gap1');
    assert.equal(lease.acquired, true);

    const claimed = await posDb.claimCommand(queued, 'worker_test_gap1', lease.token);
    assert.ok(claimed);
    await posDb.applyCommandOutcome(claimed, 'worker_test_gap1', lease.token, (current) => ({
      ...current,
      status: 'PENDING',
      expectedVersion: 11,
      expectedVersionRevision: 1,
      retryCount: 1,
    }));

    const reloaded = await posDb.syncQueue.get(queued.id);
    assert.equal(reloaded?.expectedVersion, 11);
    assert.equal(reloaded?.expectedVersionRevision, 1);
    assert.equal(reloaded?.status, 'PENDING');
    await posDb.releaseSyncLease('worker_test_gap1', lease.token);
  });
});