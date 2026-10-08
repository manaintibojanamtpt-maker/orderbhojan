/**
 * Phase A acceptance — Gap 3: durable Dexie lease with fencing.
 *
 * A POS terminal runs several tabs, and an OS memory reclaim can kill a tab
 * mid-request. The flush loop therefore needs ownership that (a) outlives the
 * tab, (b) can be taken over after a crash, and (c) stops a *slow* worker from
 * writing once it has been replaced.
 *
 * The fencing token is what makes (c) possible: every acquisition takes the next
 * token, commands are stamped with the token that claimed them, and every write
 * after an `await` re-checks that it still owns the lease. A worker that was
 * paused past its lease can therefore detect that it lost, and drop its response
 * instead of overwriting the new owner's outcome.
 */

import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { posDb } from '../src/features/pos/db/posDatabase';
import { OrderSyncService } from '../src/features/pos/services/orderSyncService';
import {
  DEFAULT_LEASE_MS,
  SYNC_LEASE_NAME,
  createLeaseOwnerId,
  evaluateLeaseAcquisition,
  evaluateLeaseRenewal,
  isCommandRecoverable,
  isLeaseFenceCurrent,
} from '../src/features/pos/services/posSyncLease';
import type { SyncQueueItem } from '../src/features/pos/domain/pos.types';

const NOW = Date.parse('2026-10-05T12:00:00.000Z');

/**
 * The lease is one-per-device, so the tests below share it. Expiring it puts the
 * next test in a known state without touching the fencing token, which is what
 * makes each test independent of the ones before it.
 */
const resetLease = async (): Promise<void> => {
  const current = await posDb.readSyncLease();
  if (!current) return;
  await posDb.syncLeases.put({ ...current, expiresAt: 0 });
};

test('Gap 3 — lease acquisition rules', async (t) => {
  await t.test('an unheld lease is taken and the first token is 1', () => {
    const decision = evaluateLeaseAcquisition(undefined, 'worker_a', NOW);
    assert.equal(decision.acquired, true);
    assert.equal(decision.acquired && decision.token, 1);
    assert.equal(decision.acquired && decision.takeover, false);
  });

  await t.test('a live lease held by another worker is refused', () => {
    const decision = evaluateLeaseAcquisition(
      { ownerId: 'worker_a', fencingToken: 4, expiresAt: NOW + 10_000 },
      'worker_b',
      NOW
    );
    assert.equal(decision.acquired, false);
    assert.equal(!decision.acquired && decision.reason, 'HELD_BY_OTHER');
    assert.equal(!decision.acquired && decision.ownerId, 'worker_a');
  });

  await t.test('an expired lease is taken over with the next token', () => {
    const decision = evaluateLeaseAcquisition(
      { ownerId: 'worker_a', fencingToken: 4, expiresAt: NOW - 1 },
      'worker_b',
      NOW
    );
    assert.equal(decision.acquired, true);
    assert.equal(decision.acquired && decision.token, 5, 'the token always advances');
    assert.equal(decision.acquired && decision.takeover, true);
  });

  await t.test('re-acquiring our own live lease keeps the token', () => {
    const decision = evaluateLeaseAcquisition(
      { ownerId: 'worker_a', fencingToken: 7, expiresAt: NOW + 10_000 },
      'worker_a',
      NOW
    );
    assert.equal(decision.acquired, true);
    assert.equal(decision.acquired && decision.token, 7);
    assert.equal(
      decision.acquired && decision.takeover,
      false,
      'commands already in flight stay fenced to the same token'
    );
  });

  await t.test('every worker gets a distinct identity', () => {
    const a = createLeaseOwnerId(() => 0.5, () => NOW);
    const b = createLeaseOwnerId(() => 0.5, () => NOW + 1);
    assert.notEqual(a, b);
    assert.match(a, /^pos_worker_/);
  });
});

test('Gap 3 — lease renewal and fencing rules', async (t) => {
  const held = { ownerId: 'worker_a', fencingToken: 4, expiresAt: NOW + 10_000 };

  await t.test('the owner can renew and pushes the expiry out', () => {
    const decision = evaluateLeaseRenewal(held, 'worker_a', 4, NOW, DEFAULT_LEASE_MS);
    assert.equal(decision.renewed, true);
    assert.equal(decision.renewed && decision.expiresAt, NOW + DEFAULT_LEASE_MS);
  });

  await t.test('a replaced worker is told it is fenced, not silently ignored', () => {
    const takenOver = { ...held, ownerId: 'worker_b', fencingToken: 5 };
    const decision = evaluateLeaseRenewal(takenOver, 'worker_a', 4, NOW);
    assert.equal(decision.renewed, false);
    assert.equal(!decision.renewed && decision.reason, 'NOT_OWNER');
    assert.equal(!decision.renewed && decision.token, 5, 'it learns the current token');
  });

  await t.test('a superseded token cannot renew even for the same owner', () => {
    const decision = evaluateLeaseRenewal({ ...held, fencingToken: 5 }, 'worker_a', 4, NOW);
    assert.equal(decision.renewed, false);
    assert.equal(!decision.renewed && decision.reason, 'FENCED');
  });

  await t.test('an expired lease is not resurrected by its old owner', () => {
    const decision = evaluateLeaseRenewal({ ...held, expiresAt: NOW - 1 }, 'worker_a', 4, NOW);
    assert.equal(decision.renewed, false);
    assert.equal(!decision.renewed && decision.reason, 'EXPIRED');
  });

  await t.test('no lease at all cannot be renewed', () => {
    const decision = evaluateLeaseRenewal(undefined, 'worker_a', 1, NOW);
    assert.equal(decision.renewed, false);
    assert.equal(!decision.renewed && decision.reason, 'NOT_OWNER');
  });

  await t.test('fence currency requires owner and token to match', () => {
    assert.equal(isLeaseFenceCurrent(held, 'worker_a', 4), true);
    assert.equal(isLeaseFenceCurrent(held, 'worker_a', 5), false);
    assert.equal(isLeaseFenceCurrent(held, 'worker_b', 4), false);
    assert.equal(isLeaseFenceCurrent(undefined, 'worker_a', 4), false);
  });
});

test('Gap 3 — crash recovery respects the fence', async (t) => {
  await t.test('a command from a superseded worker is recoverable', () => {
    assert.equal(isCommandRecoverable(3, 5, NOW, NOW + 10_000), true);
  });

  await t.test('a pre-lease in-flight record is always recoverable', () => {
    assert.equal(isCommandRecoverable(undefined, 5, NOW, NOW + 10_000), true);
  });

  await t.test('a live tab’s in-flight command is left alone', () => {
    assert.equal(
      isCommandRecoverable(5, 5, NOW, NOW + 10_000),
      false,
      'resetting it would send the same command twice'
    );
  });

  await t.test('a command at the current fence under a dead lease is recoverable', () => {
    assert.equal(isCommandRecoverable(5, 5, NOW, NOW - 1), true);
  });
});

test('Gap 3 — durable lease in the database', async (t) => {
  const workerA = 'lease_worker_a';
  const workerB = 'lease_worker_b';

  await t.test('the lease is persisted, so it survives the tab that took it', async () => {
    await resetLease();
    const taken = await posDb.acquireSyncLease(workerA, NOW);
    assert.equal(taken.acquired, true);

    const stored = await posDb.readSyncLease();
    assert.equal(stored?.id, SYNC_LEASE_NAME);
    assert.equal(stored?.ownerId, workerA);
    assert.equal(stored?.fencingToken, 1);
    assert.equal(stored?.expiresAt, NOW + DEFAULT_LEASE_MS);
  });

  await t.test('a second worker is refused while the lease is live', async () => {
    const refused = await posDb.acquireSyncLease(workerB, NOW + 1_000);
    assert.equal(refused.acquired, false);
    assert.equal(refused.heldBy, workerA);
    assert.equal(refused.token, 1, 'it learns the token it would have to beat');
  });

  await t.test('the owner can renew and the other still cannot', async () => {
    assert.equal(await posDb.renewSyncLease(workerA, 1, NOW + 2_000), true);
    assert.equal(await posDb.renewSyncLease(workerB, 1, NOW + 2_000), false);
    const stored = await posDb.readSyncLease();
    assert.equal(stored?.ownerId, workerA);
  });

  await t.test('a released lease expires rather than disappearing', async () => {
    assert.equal(await posDb.releaseSyncLease(workerA, 1), true);
    const stored = await posDb.readSyncLease();
    assert.ok(stored, 'the record stays so the token keeps increasing');
    assert.equal(stored?.expiresAt, 0);

    const takenOver = await posDb.acquireSyncLease(workerB, NOW + 3_000);
    assert.equal(takenOver.acquired, true);
    assert.equal(takenOver.token, 2, 'the token advanced, so old work is detectable as stale');
    assert.equal(takenOver.takeover, true);
  });

  await t.test('a worker cannot release a lease it no longer owns', async () => {
    assert.equal(await posDb.releaseSyncLease(workerA, 1), false);
    assert.equal((await posDb.readSyncLease())?.ownerId, workerB);
  });

  await t.test('a stale worker cannot renew, and is told it lost', async () => {
    assert.equal(await posDb.renewSyncLease(workerA, 1, NOW + 4_000), false);
  });
});

test('Gap 3 — claims and outcomes are fenced', async (t) => {
  const tenantId = 'tenant_fence_writes';
  const worker = 'fence_worker_a';
  const rival = 'fence_worker_b';

  // These tests assert on live lease expiry, so they run against the real clock
  // rather than the fixed instant used by the pure-rule tests above.
  const t0 = Date.now();
  let strandedCommandId = '';

  const enqueue = async (id: string): Promise<SyncQueueItem> =>
    posDb.enqueueSync(
      'AcceptOrder',
      'ORDER',
      { orderId: `order_${id}` },
      { tenantId, entityId: `order_${id}` }
    );

  await t.test('claiming stamps the fence onto the command', async () => {
    await resetLease();
    const lease = await posDb.acquireSyncLease(worker, t0);
    const item = await enqueue('fence_1');
    const claimed = await posDb.claimCommand(item, worker, lease.token);
    assert.ok(claimed);
    assert.equal(claimed?.status, 'SYNCING');
    assert.equal(claimed?.leaseFence, lease.token);
    assert.equal(claimed?.leaseOwner, worker);
    await posDb.markCommandAcknowledged(claimed!, {}, { ownerId: worker, fence: lease.token });
  });

  await t.test('a stale fence cannot claim a command', async () => {
    await resetLease();
    const lease = await posDb.acquireSyncLease(worker, t0 + 1_000);
    const item = await enqueue('fence_2');
    // A worker whose token is behind the current one.
    const claimed = await posDb.claimCommand(item, worker, lease.token - 1);
    assert.equal(claimed, undefined);
    assert.equal((await posDb.syncQueue.get(item.id))?.status, 'PENDING');
  });

  await t.test('a fenced worker cannot claim work at all', async () => {
    await resetLease();
    const first = await posDb.acquireSyncLease(worker, t0 + 2_000);
    const stolen = await posDb.acquireSyncLease(rival, t0 + 2_000 + DEFAULT_LEASE_MS + 1);
    assert.equal(stolen.token > first.token, true);

    const item = await enqueue('fence_2b');
    assert.equal(
      await posDb.claimCommand(item, worker, first.token),
      undefined,
      'a replaced worker must not start new work'
    );
    assert.ok(await posDb.claimCommand(item, rival, stolen.token), 'the new owner can');
    await posDb.markCommandAcknowledged(item, {}, { ownerId: rival, fence: stolen.token });
  });

  await t.test('a command already claimed cannot be claimed twice', async () => {
    await resetLease();
    const lease = await posDb.acquireSyncLease(worker, t0 + 3_000);
    const item = await enqueue('fence_3');
    assert.ok(await posDb.claimCommand(item, worker, lease.token));
    assert.equal(
      await posDb.claimCommand(item, worker, lease.token),
      undefined,
      'a duplicate send of the same command is impossible'
    );
    await posDb.markCommandAcknowledged(item, {}, { ownerId: worker, fence: lease.token });
  });

  await t.test('an outcome written by the owner is applied', async () => {
    await resetLease();
    const lease = await posDb.acquireSyncLease(worker, t0 + 4_000);
    const item = await enqueue('fence_4');
    const claimed = await posDb.claimCommand(item, worker, lease.token);
    assert.ok(claimed);
    const applied = await posDb.applyCommandOutcome(
      claimed!,
      worker,
      lease.token,
      (current) => ({ ...current, status: 'SYNCED', acknowledgedAt: t0 })
    );
    assert.equal(applied, true);
    assert.equal((await posDb.syncQueue.get(item.id))?.status, 'SYNCED');

    // Acknowledging is what releases the claim, so the row is retryable by
    // whichever worker holds the lease next.
    const acked = await posDb.markCommandAcknowledged(item, {}, {
      ownerId: worker,
      fence: lease.token,
    });
    assert.equal(acked, true);
    const stored = await posDb.syncQueue.get(item.id);
    assert.equal(stored?.status, 'SYNCED');
    assert.equal(stored?.leaseFence, undefined, 'the fence is released with the claim');
    assert.equal(stored?.leaseOwner, undefined);
  });

  await t.test('a late response from a replaced worker is discarded', async () => {
    await resetLease();
    const first = await posDb.acquireSyncLease(worker, t0 + 5_000);
    const item = await enqueue('fence_5');
    strandedCommandId = item.id;
    const claimed = await posDb.claimCommand(item, worker, first.token);
    assert.ok(claimed);

    // The worker's lease expires and a rival takes over.
    const takeover = await posDb.acquireSyncLease(rival, t0 + 5_000 + DEFAULT_LEASE_MS + 1);
    assert.equal(takeover.acquired, true);
    assert.equal(takeover.token > first.token, true);

    // The original worker wakes up with its response in hand.
    const applied = await posDb.applyCommandOutcome(claimed!, worker, first.token, (current) => ({
      ...current,
      status: 'SYNCED',
      acknowledgedAt: t0,
    }));
    assert.equal(applied, false, 'the stale write is refused');
    assert.equal(
      (await posDb.syncQueue.get(item.id))?.status,
      'SYNCING',
      'the record is left for the new owner to resolve'
    );
  });

  await t.test('the new owner can finish what the stale worker started', async () => {
    await posDb.recoverInFlightCommands({ tenantId }, t0 + 5_000 + DEFAULT_LEASE_MS + 2);
    const recovered = await posDb.syncQueue.get(strandedCommandId);
    assert.equal(recovered?.status, 'PENDING');
    assert.equal(recovered?.leaseFence, undefined, 'the dead worker’s fence is cleared');
  });
});

test('Gap 3 — startup recovery does not disturb a live tab', async (t) => {
  const tenantId = 'tenant_live_tab';
  const holder = 'live_worker';
  const other = 'arriving_worker';

  await t.test('in-flight work under a live lease survives another tab’s startup', async () => {
    await resetLease();
    const lease = await posDb.acquireSyncLease(holder, Date.now());
    assert.equal(lease.acquired, true);

    const item = await posDb.enqueueSync(
      'AcceptOrder',
      'ORDER',
      { orderId: 'order_live' },
      { tenantId, entityId: 'order_live' }
    );
    const claimed = await posDb.claimCommand(item, holder, lease.token);
    assert.ok(claimed);

    // A second tab boots and runs the same recovery the service runs on mount.
    const service = new OrderSyncService({
      getIdToken: async () => 'test-token',
      workerId: other,
      leaseMs: DEFAULT_LEASE_MS,
      setInterval: () => 0,
      clearInterval: () => undefined,
    });
    try {
      const status = await service.initialize({ tenantId }).then(() => service.getLeaseStatus());
      assert.equal(status.held, false, 'the live tab keeps the lease');
      assert.equal(status.fence, lease.token);
    } finally {
      service.dispose();
    }

    assert.equal(
      (await posDb.syncQueue.get(item.id))?.status,
      'SYNCING',
      'the in-flight command was not reset, so it cannot be sent twice'
    );
  });

  await t.test('a crashed tab’s lease expires and its work is recovered', async () => {
    const crashedAt = Date.now();
    await resetLease();
    const lease = await posDb.acquireSyncLease('crashed_worker', crashedAt);
    const item = await posDb.enqueueSync(
      'AcceptOrder',
      'ORDER',
      { orderId: 'order_crashed' },
      { tenantId, entityId: 'order_crashed' }
    );
    await posDb.claimCommand(item, 'crashed_worker', lease.token);

    // Well after the lease would have expired.
    await posDb.recoverInFlightCommands({ tenantId }, crashedAt + DEFAULT_LEASE_MS + 1);
    assert.equal((await posDb.syncQueue.get(item.id))?.status, 'PENDING');
  });

  await t.test('a fenced service stops flushing instead of racing the new owner', async () => {
    const tenantId = 'tenant_fenced_service';
    await posDb.enqueueSync(
      'AcceptOrder',
      'ORDER',
      { orderId: 'order_fenced' },
      { tenantId, entityId: 'order_fenced' }
    );

    const originalFetch = globalThis.fetch;
    let sent = 0;
    globalThis.fetch = (async () => {
      sent += 1;
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    await resetLease();
    const service = new OrderSyncService({
      getIdToken: async () => 'test-token',
      workerId: 'fenced_service_worker',
      leaseMs: DEFAULT_LEASE_MS,
      setInterval: () => 0,
      clearInterval: () => undefined,
    });
    try {
      await service.initialize({ tenantId });
      assert.equal(service.getLeaseStatus().held, true);

      // Another tab takes the lease after expiry.
      const stolen = await posDb.acquireSyncLease('thief', Date.now() + DEFAULT_LEASE_MS + 1);
      assert.equal(stolen.acquired, true);

      await service.flushSyncQueue();
      assert.equal(sent, 0, 'a fenced worker dispatches nothing');
      assert.equal(service.getLeaseStatus().held, false);
      assert.equal(service.getLeaseStatus().lost, true);
    } finally {
      globalThis.fetch = originalFetch;
      service.dispose();
    }
  });
});