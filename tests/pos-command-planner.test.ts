import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCommandResponse,
  computeBackoffMs,
  planFlushOrder,
  planQueuedCommand,
  summarizeQueue,
  MAX_AUTOMATIC_RETRIES,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  type PosQueuedCommand,
} from '../src/features/pos/services/posCommandPlanner';
import { ORDER_COMMAND_TYPES } from '../src/features/pos/services/posCommandContract';

const queued = (over: Partial<PosQueuedCommand> = {}): PosQueuedCommand => ({
  id: 'sync_1',
  tenantId: 'tenant_a',
  orderId: 'order_1',
  clientSequence: 1,
  orderSequence: 1,
  action: 'AcceptOrder',
  payload: {},
  ...over,
});

test('POS command planner — command derivation', async (t) => {
  await t.test('maps a queued action to the matching command type', () => {
    const result = planQueuedCommand(queued({ action: 'MarkReady' }));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.command.type, 'MarkReady');
  });

  await t.test('maps legacy UPDATE_STATUS to the canonical command for the target status', () => {
    const accept = planQueuedCommand(
      queued({ action: 'UPDATE_STATUS', payload: { orderStatus: 'ACCEPTED' } })
    );
    assert.equal(accept.ok, true);
    if (accept.ok) {
      assert.equal(accept.command.type, 'AcceptOrder');
      assert.deepEqual(accept.command.payload, { orderStatus: 'ACCEPTED' });
    }

    const preparing = planQueuedCommand(
      queued({ action: 'UPDATE_STATUS', payload: { status: 'IN_KITCHEN' } })
    );
    assert.equal(preparing.ok, true);
    if (preparing.ok) assert.equal(preparing.command.type, 'MarkPreparing');
  });

  await t.test('strips paymentStatus from a status update so the command API is never asked to set payment', () => {
    const result = planQueuedCommand(
      queued({
        action: 'UPDATE_STATUS',
        payload: { orderStatus: 'COMPLETED', paymentStatus: 'PAID' },
      })
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal('paymentStatus' in result.command.payload, false);
    }
  });

  await t.test('always supplies a rejection reason for reject/cancel', () => {
    const result = planQueuedCommand(
      queued({ action: 'UPDATE_STATUS', payload: { orderStatus: 'REJECTED' } })
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.command.type, 'RejectOrder');
      assert.ok(String(result.command.payload.rejectionReason).length > 0);
    }
  });

  await t.test('translates POS UPI to the staff-recorded method the server accepts', () => {
    const result = planQueuedCommand(
      queued({ action: 'RecordPayment', payload: { method: 'UPI', amount: 250, reference: 'R1' } })
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.command.payload.method, 'UPI_MANUAL');
      assert.equal(result.command.payload.amount, 250);
    }
  });

  await t.test('forwards deviceId, clientSequence, expectedVersion and correlationId', () => {
    const result = planQueuedCommand(
      queued({ deviceId: 'pos_abc', clientSequence: 42, expectedVersion: 7, correlationId: 'cc_1' })
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.command.deviceId, 'pos_abc');
      assert.equal(result.command.clientSequence, 42);
      assert.equal(result.command.expectedVersion, 7);
      assert.equal(result.command.correlationId, 'cc_1');
      assert.equal(result.command.commandId, 'sync_1');
    }
  });
});

test('POS command planner — unsupported and malformed work becomes a visible failure', async (t) => {
  await t.test('an unknown action is never sent to the server', () => {
    const result = planQueuedCommand(queued({ action: 'REPRINT_KITCHEN_TICKET' }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'UNSUPPORTED');
      assert.match(result.detail, /not supported/i);
      assert.match(result.detail, /nothing was sent/i);
    }
  });

  await t.test('a status update with no target status is a visible failure, not a silent no-op', () => {
    const result = planQueuedCommand(queued({ action: 'UPDATE_STATUS', payload: {} }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'UNSUPPORTED');
  });

  await t.test('a command with no tenant cannot be attributed', () => {
    const result = planQueuedCommand(queued({ tenantId: '' }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'INVALID');
  });

  await t.test('a command with no order id is rejected before any network call', () => {
    const result = planQueuedCommand(queued({ orderId: '' }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'INVALID');
  });

  await t.test('unsupported entries are separated from runnable work by planFlushOrder', () => {
    const plan = planFlushOrder([
      queued({ id: 'a', action: 'AcceptOrder', orderSequence: 1 }),
      queued({ id: 'b', orderSequence: 2, action: 'MYSTERY_ACTION' }),
      queued({ id: 'c', orderSequence: 3, action: 'MarkReady' }),
    ]);
    assert.equal(plan.blocked.length, 1);
    assert.equal(plan.blocked[0].item.id, 'b');
    assert.deepEqual(plan.runnable.map((item) => item.id), ['a']);
    assert.deepEqual(
      plan.deferred.map((entry) => entry.item.id),
      ['c'],
      'the command behind the unsupported one waits for staff, it is not discarded'
    );
  });
});

test('POS command planner — dependency ordering', async (t) => {
  await t.test('commands for one order run in local sequence order regardless of enqueue order', () => {
    const plan = planFlushOrder([
      queued({ id: 'third', action: 'UpdateOrderStatus', orderSequence: 3, payload: { orderStatus: 'COMPLETED' } }),
      queued({ id: 'first', action: 'AcceptOrder', orderSequence: 1 }),
      queued({ id: 'second', action: 'RecordPayment', orderSequence: 2, payload: { method: 'CASH', amount: 100 } }),
    ]);
    assert.deepEqual(
      plan.runnable.map((item) => item.id),
      ['first']
    );
  });

  await t.test('a payment never overtakes the accept that authorised it', () => {
    const plan = planFlushOrder([
      queued({ id: 'payment', action: 'RecordPayment', orderSequence: 2, payload: { method: 'CASH', amount: 100 } }),
      queued({ id: 'accept', action: 'AcceptOrder', orderSequence: 1 }),
    ]);
    assert.equal(plan.runnable[0].id, 'accept');
    assert.equal(plan.runnable.some((item) => item.id === 'payment'), false);
  });

  await t.test('only one command per order is released per pass', () => {
    const plan = planFlushOrder([
      queued({ id: 'a', action: 'AcceptOrder', orderSequence: 1 }),
      queued({ id: 'b', action: 'MarkPreparing', orderSequence: 2 }),
      queued({ id: 'c', action: 'MarkReady', orderSequence: 3 }),
    ]);
    assert.deepEqual(plan.runnable.map((item) => item.id), ['a']);
    assert.deepEqual(plan.deferred.map((entry) => entry.item.id), ['b', 'c']);
    assert.equal(plan.chains.length, 1);
    assert.deepEqual(plan.chains[0].items.map((item) => item.id), ['a', 'b', 'c']);
  });

  await t.test('work beyond the per-order budget is deferred, not dropped', () => {
    const many = Array.from({ length: 5 }, (_, index) =>
      queued({ id: `o${index}`, action: 'MarkPreparing', orderSequence: index + 1 })
    );
    const plan = planFlushOrder(many, { perOrderBudget: 2 });
    assert.equal(plan.runnable.length, 2);
    assert.equal(plan.deferred.length, 3);
    assert.equal(plan.runnable.length + plan.deferred.length, 5);
  });

  await t.test('orders are interleaved deterministically, not starved', () => {
    const plan = planFlushOrder([
      queued({ id: 'z1', tenantId: 'tenant_z', orderId: 'o1', orderSequence: 1, action: 'AcceptOrder' }),
      queued({ id: 'a1', tenantId: 'tenant_a', orderId: 'o1', orderSequence: 1, action: 'AcceptOrder' }),
    ]);
    assert.deepEqual(
      plan.runnable.map((item) => item.id),
      ['a1', 'z1']
    );
  });

  await t.test('a blocked head holds back the rest of its own order', () => {
    const plan = planFlushOrder([
      queued({ id: 'bad', orderSequence: 1, action: 'NOPE' }),
      queued({ id: 'good', orderSequence: 2, action: 'MarkReady' }),
    ]);
    assert.equal(plan.blocked.length, 1);
    assert.equal(plan.runnable.length, 0, 'MarkReady would be rejected by the server against a PLACED order');
    const held = plan.deferred.find((entry) => entry.item.id === 'good');
    assert.equal(held?.reason, 'PREDECESSOR_UNRESOLVED');
    assert.equal(held?.blockedBy, 'bad');
  });

  await t.test('one stuck order never blocks an unrelated order', () => {
    const plan = planFlushOrder([
      queued({ id: 'stuck_bad', orderId: 'o1', orderSequence: 1, action: 'NOPE' }),
      queued({ id: 'stuck_next', orderId: 'o1', orderSequence: 2, action: 'MarkReady' }),
      queued({ id: 'other_ok', orderId: 'o2', orderSequence: 1, action: 'AcceptOrder' }),
    ]);
    assert.deepEqual(plan.runnable.map((item) => item.id), ['other_ok']);
    assert.equal(plan.blocked.length, 1);
  });
});

test('POS command planner — an unresolved predecessor gates its own order', async (t) => {
  await t.test('a command already in flight holds back everything behind it', () => {
    const plan = planFlushOrder([
      queued({ id: 'inflight', orderSequence: 1, action: 'AcceptOrder', state: 'SYNCING' }),
      queued({ id: 'after', orderSequence: 2, action: 'MarkReady', state: 'PENDING' }),
    ]);
    assert.equal(plan.runnable.length, 0, 'another worker owns the head');
    assert.equal(plan.blocked.length, 0, 'nothing is permanently blocked');
    const held = plan.deferred.find((entry) => entry.item.id === 'after');
    assert.equal(held?.blockedBy, 'inflight');
    assert.match(
      plan.deferred.find((entry) => entry.item.id === 'inflight')?.detail ?? '',
      /in flight/i,
      'the operator is told why the head is not being sent'
    );
  });

  await t.test('a FAILED predecessor holds back its successors instead of cascading failures', () => {
    const plan = planFlushOrder([
      queued({ id: 'failed', orderSequence: 1, action: 'AcceptOrder', state: 'FAILED' }),
      queued({ id: 'payment', orderSequence: 2, action: 'RecordPayment', state: 'PENDING', payload: { method: 'CASH', amount: 100 } }),
    ]);
    assert.equal(plan.runnable.length, 0);
    assert.equal(plan.blocked.length, 0, 'already-failed work is not re-reported as newly blocked');
    assert.equal(plan.deferred.find((entry) => entry.item.id === 'payment')?.reason, 'PREDECESSOR_UNRESOLVED');
  });

  await t.test('a settled predecessor no longer gates anything', () => {
    // SYNCED rows are filtered out of the unsettled set, so an accepted order
    // leaves only the command that still has to run.
    const plan = planFlushOrder([
      queued({ id: 'pending', orderSequence: 2, action: 'MarkReady', state: 'PENDING' }),
    ]);
    assert.deepEqual(plan.runnable.map((item) => item.id), ['pending']);
  });
});

test('POS command planner — HTTP outcome classification', async (t) => {
  await t.test('2xx is a durable acknowledgement', () => {
    const result = classifyCommandResponse(200, { success: true });
    assert.equal(result.outcome, 'acknowledged');
  });

  await t.test('401 pauses the queue for re-authentication instead of burning retries', () => {
    const result = classifyCommandResponse(401, { error: { code: 'UNAUTHENTICATED' } });
    assert.equal(result.outcome, 'auth');
    assert.equal(result.reason, 'AUTH_REQUIRED');
  });

  await t.test('403 and 404 are permanent and actionable', () => {
    assert.equal(classifyCommandResponse(403, {}).outcome, 'blocked');
    assert.equal(classifyCommandResponse(403, {}).reason, 'FORBIDDEN');
    assert.equal(classifyCommandResponse(404, {}).reason, 'NOT_FOUND');
  });

  await t.test('a concurrency conflict is retryable with fresh state', () => {
    const result = classifyCommandResponse(409, {
      error: { code: 'CONCURRENCY_CONFLICT', currentVersion: 9 },
    });
    assert.equal(result.outcome, 'retryable');
    assert.equal(result.reason, 'CONFLICT');
  });

  await t.test('an idempotency-key conflict is permanent, not a retry loop', () => {
    const result = classifyCommandResponse(409, { error: { code: 'IDEMPOTENCY_KEY_CONFLICT' } });
    assert.equal(result.outcome, 'blocked');
  });

  await t.test('422 with UNSUPPORTED_COMMAND is surfaced as unsupported', () => {
    const result = classifyCommandResponse(400, { error: { code: 'UNSUPPORTED_COMMAND' } });
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.reason, 'UNSUPPORTED');
  });

  await t.test('5xx and 429 are retryable', () => {
    assert.equal(classifyCommandResponse(500, {}).outcome, 'retryable');
    assert.equal(classifyCommandResponse(503, {}).outcome, 'retryable');
    assert.equal(classifyCommandResponse(429, {}).outcome, 'retryable');
  });

  await t.test('the server message is preserved for operator display', () => {
    const result = classifyCommandResponse(422, {
      error: { code: 'INVALID_TRANSITION', message: "Cannot transition order from 'READY' to 'ACCEPTED'." },
    });
    assert.match(result.detail ?? '', /Cannot transition/);
  });
});

test('POS command planner — bounded exponential backoff with jitter', async (t) => {
  await t.test('delay grows with retry count and stays inside the jitter band', () => {
    const noJitter = computeBackoffMs(0, { random: () => 0 });
    assert.equal(noJitter.delayMs, Math.round(BASE_BACKOFF_MS * 0.5));
    const fullJitter = computeBackoffMs(0, { random: () => 1 });
    assert.equal(fullJitter.delayMs, BASE_BACKOFF_MS);
    const later = computeBackoffMs(3, { random: () => 1 });
    assert.equal(later.delayMs, BASE_BACKOFF_MS * 8);
  });

  await t.test('the delay is capped so a stuck command still retries within minutes', () => {
    const capped = computeBackoffMs(30, { random: () => 1 });
    assert.ok(capped.delayMs <= MAX_BACKOFF_MS);
  });

  await t.test('retries are bounded and then reported exhausted', () => {
    assert.equal(computeBackoffMs(MAX_AUTOMATIC_RETRIES, { random: () => 1 }).exhausted, true);
    assert.equal(computeBackoffMs(MAX_AUTOMATIC_RETRIES - 1).exhausted, false);
  });
});

test('POS command planner — queue health reporting', async (t) => {
  await t.test('reports depth, blocked count and the oldest pending age', () => {
    const now = Date.parse('2026-10-05T12:00:00.000Z');
    const health = summarizeQueue(
      [
        { createdAt: '2026-10-05T11:50:00.000Z', state: 'PENDING' },
        { createdAt: '2026-10-05T11:40:00.000Z', state: 'PENDING' },
        { createdAt: '2026-10-05T11:59:00.000Z', state: 'SYNCING' },
        { createdAt: '2026-10-05T11:00:00.000Z', state: 'FAILED' },
        { createdAt: '2026-10-05T11:30:00.000Z', state: 'SYNCED' },
      ],
      now,
      false,
      false
    );
    assert.equal(health.pending, 2);
    assert.equal(health.inFlight, 1);
    assert.equal(health.blocked, 1);
    assert.equal(health.oldestPendingAgeMs, 20 * 60_000);
    assert.equal(health.offline, false);
  });

  await t.test('surfaces offline and awaiting-auth state for the status bar', () => {
    const health = summarizeQueue([], Date.now(), true, true);
    assert.equal(health.offline, true);
    assert.equal(health.awaitingAuth, true);
  });
});

test('POS command contract parity', async (t) => {
  await t.test('the client command vocabulary covers every product action the server accepts', () => {
    // The server accepts these eight; the planner can only ever emit them.
    for (const type of ORDER_COMMAND_TYPES) {
      assert.equal(typeof type, 'string');
    }
    assert.deepEqual([...ORDER_COMMAND_TYPES].sort(), [
      'AcceptOrder',
      'CreateKot',
      'CreateOrder',
      'MarkPreparing',
      'MarkReady',
      'RecordPayment',
      'RejectOrder',
      'UpdateOrderStatus',
    ]);
  });
});