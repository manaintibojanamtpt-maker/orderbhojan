/**
 * Phase A acceptance — Gap 2: same-order dependency gating.
 *
 * The flusher used to release every command for an order in the same pass. Each
 * command bumps `orders.version`, so a payment released alongside the accept that
 * authorised it raced that accept, and the server answered INVALID_TRANSITION or
 * CONCURRENCY_CONFLICT for work that was perfectly valid a moment earlier.
 *
 * These tests drive the real service against the real Dexie queue with a stub
 * transport, and assert the property the POS depends on: a dependent command
 * never overtakes an unresolved predecessor, while an unrelated order flushes.
 */

import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { posDb } from '../src/features/pos/db/posDatabase';
import { OrderSyncService } from '../src/features/pos/services/orderSyncService';
import { planFlushOrder } from '../src/features/pos/services/posCommandPlanner';
import type { PosOrder } from '../src/features/pos/domain/pos.types';

/** Requests the service made, in order. */
type CapturedRequest = { url: string; body: Record<string, unknown> };

interface StubOptions {
  /** Response per command type. Defaults to a success acknowledgement. */
  respond?: (type: string, body: Record<string, unknown>) => {
    status: number;
    body: Record<string, unknown>;
  };
  /** Resolve when `held()` is true, to model a slow request. */
  hold?: () => boolean;
}

const installStub = (options: StubOptions = {}) => {
  const requests: CapturedRequest[] = [];
  const originalFetch = globalThis.fetch;
  let release: (() => void) | undefined;

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
    requests.push({ url, body });

    if (options.hold) {
      await new Promise<void>((resolve) => {
        const poll = () => {
          if (!options.hold?.()) {
            release = resolve;
            return;
          }
          setTimeout(poll, 5);
        };
        poll();
      });
    }

    const type = String(body.type ?? '');
    const outcome = options.respond
      ? options.respond(type, body)
      : {
          status: 200,
          body: {
            success: true,
            commandId: body.commandId,
            tenantId: body.tenantId,
            orderId: body.orderId,
            orderStatus: 'ACCEPTED',
            paymentStatus: 'PENDING',
            version: 2,
            executedAt: new Date().toISOString(),
          },
        };
    return new Response(JSON.stringify(outcome.body), {
      status: outcome.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  return {
    requests,
    release: () => release?.(),
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
};

const makeService = (overrides: Partial<ConstructorParameters<typeof OrderSyncService>[0]> = {}) =>
  new OrderSyncService({
    getIdToken: async () => 'test-token',
    // One worker identity for the whole file: re-acquiring our own live lease is
    // idempotent, which keeps each test independent of the previous one's
    // bookkeeping while still exercising real lease acquisition.
    workerId: 'worker_gap2',
    leaseMs: 30_000,
    setInterval: () => 0,
    clearInterval: () => undefined,
    ...overrides,
  });

const walkIn = (id: string, tenantId: string): PosOrder => ({
  id,
  onlineOrderId: id,
  restaurantId: tenantId,
  orderNumber: 1001,
  orderSource: 'WALK_IN',
  orderType: 'DINE_IN',
  orderStatus: 'NEW',
  paymentMethod: 'CASH',
  paymentStatus: 'PENDING',
  customer: { name: 'Guest', phone: '9000000000' },
  items: [{ itemId: 'menu_1', name: 'Meals', price: 250, quantity: 1, lineTotal: 250 }],
  pricing: { subtotal: 250, taxes: 0, deliveryFee: 0, packingFee: 0, discount: 0, total: 250 },
  timestamps: { createdAt: new Date().toISOString() },
});

test('Gap 2 — a dependent command never overtakes an unresolved predecessor', async (t) => {
  await t.test('a whole walk-in chain flushes in order, one step at a time', async () => {
    const tenantId = 'tenant_gap2_chain';
    const order = walkIn('pos_gap2_chain', tenantId);
    await posDb.createWalkInOrder(order, { tenantId });
    await posDb.updateOrderStatus(order.id, 'ACCEPTED', undefined, { tenantId });
    await posDb.updateOrderStatus(order.id, 'PREPARING', undefined, { tenantId });
    await posDb.createKot(order, { tenantId });

    const stub = installStub();
    const service = makeService();
    try {
      await service.initialize({ tenantId });
      const plan = await service.flushSyncQueue();

      assert.deepEqual(
        plan.runnable.map((item) => item.id).length,
        1,
        'one command per order is released to start with'
      );
      assert.deepEqual(
        stub.requests.map((request) => request.body.type),
        ['CreateOrder', 'AcceptOrder', 'MarkPreparing', 'CreateKot'],
        'the chain is applied strictly in local sequence order'
      );

      const rows = (await posDb.syncQueue.where('tenantId').equals(tenantId).toArray()).filter(
        (row) => row.payload?.orderId === order.id
      );
      assert.equal(
        rows.every((row) => row.status === 'SYNCED'),
        true,
        'every command in the chain is durably acknowledged'
      );
    } finally {
      stub.restore();
      await service.shutdown();
    }
  });

  await t.test('a failed predecessor stops its own order but not the others', async () => {
    const tenantId = 'tenant_gap2_partial';
    const good = walkIn('pos_gap2_good', tenantId);
    const stuck = walkIn('pos_gap2_stuck', tenantId);
    await posDb.createWalkInOrder(good, { tenantId });
    await posDb.createKot(good, { tenantId });
    await posDb.createWalkInOrder(stuck, { tenantId });
    await posDb.updateOrderStatus(stuck.id, 'ACCEPTED', undefined, { tenantId });

    const stub = installStub({
      respond: (type, body) =>
        type === 'AcceptOrder' && body.orderId === stuck.id
          ? {
              status: 422,
              body: {
                success: false,
                error: {
                  code: 'INVALID_TRANSITION',
                  message: "Cannot transition order from 'READY' to 'ACCEPTED'.",
                },
              },
            }
          : {
              status: 200,
              body: {
                success: true,
                commandId: body.commandId,
                tenantId: body.tenantId,
                orderId: body.orderId,
                orderStatus: 'ACCEPTED',
                paymentStatus: 'PENDING',
                version: 2,
                executedAt: new Date().toISOString(),
              },
            },
    });

    const service = makeService();
    try {
      await service.initialize({ tenantId });
      await service.flushSyncQueue();

      const sentTypes = stub.requests.map((request) => `${request.body.orderId}:${request.body.type}`);
      assert.ok(
        sentTypes.includes('pos_gap2_good:CreateOrder'),
        'the healthy order still flushes'
      );
      assert.ok(sentTypes.includes('pos_gap2_stuck:CreateOrder'));
      assert.ok(
        !sentTypes.includes('pos_gap2_stuck:UpdateOrderStatus'),
        'nothing is sent behind a command the server just rejected'
      );

      const stuckRows = (await posDb.syncQueue.where('tenantId').equals(tenantId).toArray()).filter(
        (row) => row.payload?.orderId === stuck.id
      );
      const failed = stuckRows.find((row) => row.action === 'UpdateOrderStatus');
      assert.equal(failed?.status, 'FAILED', 'the operator is shown the real cause');
      assert.match(failed?.failureDetail ?? '', /Cannot transition/);
    } finally {
      stub.restore();
      await service.shutdown();
    }
  });

  await t.test('a command blocked at planning time is not sent at all', async () => {
    const tenantId = 'tenant_gap2_planned';
    await posDb.enqueueSync(
      'REPRINT_KITCHEN_TICKET',
      'KOT',
      { orderId: 'pos_gap2_unsupported' },
      { tenantId, entityId: 'pos_gap2_unsupported' }
    );
    await posDb.enqueueSync(
      'MarkReady',
      'ORDER',
      { orderId: 'pos_gap2_unsupported', orderStatus: 'READY' },
      { tenantId, entityId: 'pos_gap2_unsupported' }
    );

    const stub = installStub();
    const service = makeService();
    try {
      await service.initialize({ tenantId });
      const plan = await service.flushSyncQueue();

      assert.equal(plan.blocked.length, 1);
      assert.match(plan.blocked[0].detail, /not supported/i);
      assert.equal(stub.requests.length, 0, 'nothing is sent for an order whose head cannot be sent');

      const blockedRow = await posDb.syncQueue.get(plan.blocked[0].item.id);
      assert.equal(blockedRow?.status, 'FAILED');
    } finally {
      stub.restore();
      await service.shutdown();
    }
  });

  await t.test('a command still in its backoff window holds back the rest of its order', async () => {
    const tenantId = 'tenant_gap2_backoff';
    const order = walkIn('pos_gap2_backoff', tenantId);
    await posDb.createWalkInOrder(order, { tenantId });
    await posDb.createKot(order, { tenantId });

    const rows = (await posDb.syncQueue.where('tenantId').equals(tenantId).toArray()).filter(
      (row) => row.payload?.orderId === order.id
    );
    const head = rows.sort((a, b) => (a.orderSequence ?? 0) - (b.orderSequence ?? 0))[0];
    head.status = 'PENDING';
    head.nextAttemptAt = Date.now() + 60_000;
    head.retryCount = 1;
    head.lastError = 'Network failure';
    await posDb.syncQueue.put(head);

    const stub = installStub();
    const service = makeService();
    try {
      await service.initialize({ tenantId });
      const plan = await service.flushSyncQueue();
      assert.equal(stub.requests.length, 0, 'a command in backoff is not attempted');
      assert.deepEqual(
        plan.runnable.map((item) => item.id),
        [head.id],
        'the head is still eligible; only its backoff window defers it'
      );
      assert.equal(
        plan.deferred.some((entry) => entry.item.id === rows[1].id),
        true,
        'the next command for the order waits rather than jumping the queue'
      );
    } finally {
      stub.restore();
      await service.shutdown();
    }
  });
});

test('Gap 2 — planFlushOrder releases one command per order per pass', async (t) => {
  const queued = (over: Record<string, unknown> = {}) => ({
    id: 'x',
    tenantId: 'tenant_p',
    orderId: 'o',
    clientSequence: 1,
    orderSequence: 1,
    action: 'AcceptOrder' as const,
    payload: {},
    ...over,
  });

  await t.test('an unrelated order is never starved by a busy one', () => {
    const plan = planFlushOrder([
      queued({ id: 'busy1', orderId: 'o1', orderSequence: 1 }),
      queued({ id: 'busy2', orderId: 'o1', orderSequence: 2 }),
      queued({ id: 'quiet1', orderId: 'o2', orderSequence: 1 }),
      queued({ id: 'quiet2', orderId: 'o2', orderSequence: 2 }),
    ]);
    assert.deepEqual(plan.runnable.map((item) => item.id), ['busy1', 'quiet1']);
    assert.equal(plan.chains.length, 2);
  });

  await t.test('the plan reports which command is holding each order back', () => {
    const plan = planFlushOrder([
      queued({ id: 'a', orderSequence: 1, state: 'BLOCKED' as const }),
      queued({ id: 'b', orderSequence: 2 }),
    ]);
    const blocker = plan.deferred.find((entry) => entry.item.id === 'a');
    assert.match(blocker?.detail ?? '', /resolved by staff/);
    const held = plan.deferred.find((entry) => entry.item.id === 'b');
    assert.equal(held?.blockedBy, 'a');
    assert.equal(held?.reason, 'PREDECESSOR_UNRESOLVED');
    assert.match(held?.detail ?? '', /held until 'a'/i);
  });

  await t.test('nothing is discarded: every input appears exactly once', () => {
    const inputs = [
      queued({ id: 'a', orderSequence: 1, state: 'FAILED' as const }),
      queued({ id: 'b', orderSequence: 2 }),
      queued({ id: 'c', orderId: 'o2', orderSequence: 1, action: 'NOPE' as never }),
      queued({ id: 'd', orderId: 'o2', orderSequence: 2 }),
    ];
    const plan = planFlushOrder(inputs);
    const seen = [
      ...plan.runnable.map((item) => item.id),
      ...plan.deferred.map((entry) => entry.item.id),
      ...plan.blocked.map((entry) => entry.item.id),
    ];
    assert.deepEqual(seen.sort(), ['a', 'b', 'c', 'd']);
  });
});