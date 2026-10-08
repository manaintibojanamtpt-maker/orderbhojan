import {
  collection,
  query,
  where,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/firebase/init';
import { posDb, type QueueScope } from '../db/posDatabase';
import type { PosOrder, PosOrderStatus, SyncQueueItem } from '../domain/pos.types';
import {
  classifyCommandResponse,
  computeBackoffMs,
  planFlushOrder,
  planQueuedCommand,
  summarizeQueue,
  MAX_AUTOMATIC_RETRIES,
  type FlushPlan,
  type PosOrderChain,
  type PosQueuedCommand,
  type QueueHealth,
} from './posCommandPlanner';
import {
  DEFAULT_LEASE_MS,
  RENEW_INTERVAL_MS,
  createLeaseOwnerId,
} from './posSyncLease';

export type NewOrderCallback = (order: PosOrder) => void;
export type QueueHealthCallback = (health: QueueHealth) => void;
export type ReauthRequiredCallback = (detail: string) => void;

export interface OrderSyncServiceOptions {
  /** Supplies a fresh Firebase ID token for the command API. */
  getIdToken: () => Promise<string | null>;
  /** Base URL of the BhojanOS API. Defaults to same-origin. */
  apiBaseUrl?: string;
  now?: () => number;
  random?: () => number;
  /** Lease duration. Defaults to {@link DEFAULT_LEASE_MS}. */
  leaseMs?: number;
  /** Override the per-tab worker identity. Tests use this for determinism. */
  workerId?: string;
  /** Schedules the lease renewal heartbeat. Tests inject a no-op. */
  setInterval?: (handler: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

const toQueuedCommand = (item: SyncQueueItem): PosQueuedCommand => ({
  id: item.id,
  tenantId: item.tenantId ?? '',
  orderId: String(item.payload?.orderId ?? item.entityId ?? ''),
  deviceId: item.deviceId,
  clientSequence: item.clientSequence ?? 0,
  orderSequence: item.orderSequence ?? item.clientSequence ?? 0,
  action: String(item.action ?? '') as PosQueuedCommand['action'],
  payload: item.payload ?? item.data ?? {},
  expectedVersion: item.expectedVersion,
  correlationId: item.correlationId,
  state: item.status,
});

/** Outcome of dispatching one command, used to walk an order chain. */
type SettleOutcome = 'acknowledged' | 'retry' | 'blocked' | 'skipped';

export class OrderSyncService {
  private unsubscribeFirestore: Unsubscribe | null = null;
  private newOrderCallbacks = new Set<NewOrderCallback>();
  private healthCallbacks = new Set<QueueHealthCallback>();
  private reauthCallbacks = new Set<ReauthRequiredCallback>();
  private isSyncingQueue = false;
  private scope: QueueScope = { tenantId: '' };
  private listenersBound = false;
  private awaitingAuth = false;
  private offlineHandler: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;
  private bootstrapPromise: Promise<void> | null = null;

  /**
   * Durable flush ownership. `fence` is the token that decides which writes this
   * worker is still allowed to make; `leaseHeld` goes false the moment another
   * tab takes over, and the flusher stops rather than racing it.
   */
  private readonly workerId: string;
  private fence = 0;
  private leaseHeld = false;
  private renewHandle: unknown = null;
  private leaseLost = false;

  constructor(private readonly options: OrderSyncServiceOptions) {
    this.workerId =
      options.workerId ?? createLeaseOwnerId(options.random ?? Math.random, options.now ?? Date.now);
  }

  get workerIdentity(): string {
    return this.workerId;
  }

  get fencingToken(): number {
    return this.fence;
  }

  /**
   * Bind the service to a tenant/device, take the durable flush lease and recover
   * interrupted work. Idempotent: safe to call on every POS mount.
   */
  async initialize(scope: QueueScope): Promise<void> {
    this.scope = scope;
    this.bindConnectivityListeners();
    this.bootstrapPromise = (async () => {
      await this.acquireLease();
      /**
       * Recovery runs *after* acquisition so it can see the current fence.
       * Records still in flight at the current fence under a live lease belong to
       * another tab and are deliberately left alone; anything behind the fence is
       * a dead worker and is released back to PENDING.
       */
      await posDb.recoverInFlightCommands(scope, this.now());
      if (scope.tenantId) {
        await this.releaseAuthBlocked();
        await posDb.purgeAcknowledgedCommands(scope.tenantId, this.now());
      }
      await this.emitHealth();
    })();
    await this.bootstrapPromise;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private random(): number {
    return this.options.random ? this.options.random() : Math.random();
  }

  private leaseMs(): number {
    return this.options.leaseMs ?? DEFAULT_LEASE_MS;
  }

  private takeLease(): void {
    if (this.renewHandle !== null) return;
    const setTimer = this.options.setInterval ?? ((handler, ms) => setInterval(handler, ms));
    this.renewHandle = setTimer(() => {
      void this.renewLease();
    }, this.options.leaseMs ? Math.max(1, Math.floor(this.options.leaseMs / 3)) : RENEW_INTERVAL_MS);
  }

  private dropLeaseTimer(): void {
    if (this.renewHandle === null) return;
    const clearTimer = this.options.clearInterval ?? ((handle: unknown) => clearInterval(handle as never));
    clearTimer(this.renewHandle);
    this.renewHandle = null;
  }

  private async acquireLease(): Promise<void> {
    const attempt = await posDb.acquireSyncLease(this.workerId, this.now(), this.leaseMs());
    if (!attempt.acquired) {
      // Another live tab owns the flush. This tab still serves the UI and queues
      // work durably; it simply does not dispatch.
      this.leaseHeld = false;
      this.fence = attempt.token;
      return;
    }
    this.fence = attempt.token;
    this.leaseHeld = true;
    this.leaseLost = false;
    this.takeLease();
    if (attempt.takeover) {
      await posDb.logAudit('AUTH_REAUTH', 'syncLease', this.workerId, {
        reason: 'lease_takeover',
        fencingToken: attempt.token,
      });
    }
  }

  /**
   * Extend the lease. A failure means this worker was replaced: it stops flushing
   * and drops its timer so it cannot fight the new owner.
   */
  private async renewLease(): Promise<boolean> {
    if (!this.leaseHeld) return false;
    const renewed = await posDb.renewSyncLease(this.workerId, this.fence, this.now(), this.leaseMs());
    if (!renewed) {
      this.leaseHeld = false;
      this.leaseLost = true;
      this.dropLeaseTimer();
      await posDb.logAudit('SYNC_BLOCKED', 'syncLease', this.workerId, {
        reason: 'lease_lost',
        fencingToken: this.fence,
      });
      await this.emitHealth();
      return false;
    }
    return true;
  }

  private bindConnectivityListeners(): void {
    if (this.listenersBound || typeof window === 'undefined') return;
    this.listenersBound = true;
    this.onlineHandler = () => {
      void this.flushSyncQueue();
    };
    this.offlineHandler = () => {
      void this.emitHealth();
    };
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  dispose(): void {
    this.stopListening();
    if (typeof window !== 'undefined') {
      if (this.onlineHandler) window.removeEventListener('online', this.onlineHandler);
      if (this.offlineHandler) window.removeEventListener('offline', this.offlineHandler);
    }
    this.listenersBound = false;
    this.dropLeaseTimer();
    this.newOrderCallbacks.clear();
    this.healthCallbacks.clear();
    this.reauthCallbacks.clear();
  }

  /**
   * Release the lease on a clean unmount so another tab can flush immediately
   * instead of waiting for expiry.
   */
  async shutdown(): Promise<void> {
    if (!this.leaseHeld) return;
    await posDb.releaseSyncLease(this.workerId, this.fence);
    this.leaseHeld = false;
    this.dropLeaseTimer();
  }

  /** Diagnostics for the POS status bar and for tests. */
  getLeaseStatus(): { workerId: string; fence: number; held: boolean; lost: boolean } {
    return { workerId: this.workerId, fence: this.fence, held: this.leaseHeld, lost: this.leaseLost };
  }

  startListening(restaurantId: string): void {
    this.stopListening();
    const db = getFirebaseFirestore();
    if (!db) {
      console.warn('[OrderSyncService] Firestore not initialised; POS is running offline-only.');
      return;
    }
    try {
      // Bounded to live orders so a long-lived terminal does not accumulate the
      // entire order history in memory.
      const q = query(
        collection(db, 'orders'),
        where('tenantId', '==', restaurantId),
        where('orderStatus', 'in', ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'])
      );
      this.unsubscribeFirestore = onSnapshot(
        q,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'removed') return;
            const data = change.doc.data();
            const posOrder = this.mapFirestoreToPosOrder(change.doc.id, data);
            void posDb.upsertOnlineOrder(posOrder).then(({ created, order }) => {
              if (created && order.orderSource === 'ORDERBHOJAN') {
                this.notifyNewOrder(order);
              }
            });
          });
        },
        (error) => {
          console.error('[OrderSyncService] Firestore snapshot error:', error);
        }
      );
    } catch (err) {
      console.error('[OrderSyncService] Failed to start Firestore listener:', err);
    }
  }

  stopListening(): void {
    if (this.unsubscribeFirestore) {
      this.unsubscribeFirestore();
      this.unsubscribeFirestore = null;
    }
  }

  onNewOrder(cb: NewOrderCallback): () => void {
    this.newOrderCallbacks.add(cb);
    return () => this.newOrderCallbacks.delete(cb);
  }

  onQueueHealth(cb: QueueHealthCallback): () => void {
    this.healthCallbacks.add(cb);
    void this.emitHealth().then((health) => cb(health));
    return () => this.healthCallbacks.delete(cb);
  }

  /** Invoked when the server reports the session is no longer valid. */
  onReauthRequired(cb: ReauthRequiredCallback): () => void {
    this.reauthCallbacks.add(cb);
    return () => this.reauthCallbacks.delete(cb);
  }

  private notifyNewOrder(order: PosOrder): void {
    this.newOrderCallbacks.forEach((cb) => {
      try {
        cb(order);
      } catch (err) {
        console.error('[OrderSyncService] new order callback failed', err);
      }
    });
  }

  private notifyReauthRequired(detail: string): void {
    this.reauthCallbacks.forEach((cb) => {
      try {
        cb(detail);
      } catch (err) {
        console.error('[OrderSyncService] reauth callback failed', err);
      }
    });
  }

  isOnline(): boolean {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  }

  private async buildHealth(): Promise<QueueHealth> {
    const tenantId = this.scope.tenantId;
    const items = tenantId
      ? await posDb.syncQueue.where('tenantId').equals(tenantId).toArray()
      : await posDb.syncQueue.toArray();
    return summarizeQueue(
      items.map((item) => ({ createdAt: item.createdAt, state: item.status })),
      this.now(),
      !this.isOnline(),
      this.awaitingAuth
    );
  }

  async emitHealth(): Promise<QueueHealth> {
    const health = await this.buildHealth();
    this.healthCallbacks.forEach((cb) => {
      try {
        cb(health);
      } catch {
        /* observer errors must not break the flush loop */
      }
    });
    return health;
  }

  async getPendingSyncCount(): Promise<number> {
    const depth = await posDb.getQueueDepth(this.scope.tenantId || undefined);
    return depth.pending + depth.inFlight;
  }

  async getQueueHealth(): Promise<QueueHealth> {
    return this.buildHealth();
  }

  async getBlockedCommands(): Promise<SyncQueueItem[]> {
    if (!this.scope.tenantId) return [];
    return posDb.getBlockedCommands(this.scope.tenantId);
  }

  /** Re-run auth-blocked commands after a successful re-authentication. */
  async releaseAuthBlocked(): Promise<number> {
    if (!this.scope.tenantId) return 0;
    this.awaitingAuth = false;
    const released = await posDb.releaseAuthBlockedCommands(this.scope.tenantId);
    if (released > 0) {
      await posDb.logAudit('AUTH_REAUTH', 'syncQueue', this.scope.tenantId, { released });
    }
    await this.emitHealth();
    return released;
  }

  /**
   * Send one queued command to the command API.
   *
   * Returns how the command settled so the caller can decide whether the next
   * command for the same order may go.
   */
  private async dispatchCommand(
    item: SyncQueueItem,
    lease: { ownerId: string; fence: number }
  ): Promise<SettleOutcome> {
    const plan = planQueuedCommand(toQueuedCommand(item));
    if (!plan.ok) {
      await posDb.markCommandBlocked(item, plan.detail, plan.reason, lease);
      await posDb.logAudit('SYNC_BLOCKED', 'syncQueue', item.id, {
        reason: plan.reason,
        detail: plan.detail,
      });
      return 'blocked';
    }

    const token = await this.options.getIdToken();
    if (!token) {
      // No token is an auth problem, not a transport problem: hold the command
      // without consuming a retry so staff can sign back in.
      await posDb.markCommandBlocked(
        item,
        'Not signed in. Sign in to sync queued work.',
        'AUTH_REQUIRED',
        lease
      );
      this.awaitingAuth = true;
      this.notifyReauthRequired('Sign in to sync queued POS commands.');
      await posDb.logAudit('SYNC_AUTH_REQUIRED', 'syncQueue', item.id, {});
      return 'blocked';
    }

    const base = this.options.apiBaseUrl ?? '';
    const url = `${base}/api/v1/tenants/${encodeURIComponent(plan.command.tenantId)}/orders/${encodeURIComponent(
      plan.command.orderId
    )}/commands`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Stable per queue record: a retry can never duplicate the effect.
          'Idempotency-Key': item.id,
          Authorization: `Bearer ${token}`,
          'X-Correlation-Id': plan.command.correlationId,
        },
        body: JSON.stringify(plan.command),
      });
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : 'Network failure';
      const backoff = computeBackoffMs(item.retryCount ?? 0, { random: this.random });
      if (backoff.exhausted) {
        await posDb.markCommandBlocked(
          item,
          `Could not reach the server after ${MAX_AUTOMATIC_RETRIES} attempts (${detail}).`,
          'CONNECTION',
          lease
        );
        await posDb.logAudit('SYNC_FAILED', 'syncQueue', item.id, {
          detail,
          retryCount: item.retryCount,
        });
        return 'blocked';
      }
      await posDb.markCommandRetry(item, detail, 'CONNECTION', this.now() + backoff.delayMs, lease);
      return 'retry';
    }

    /**
     * The request has been in flight long enough for this worker to be fenced.
     * Dropping the response is safe and correct: the server already committed
     * under an idempotency key, so the winning worker — or a later retry — will
     * replay the same outcome. Writing it from a fenced worker would risk
     * overwriting a newer acknowledgement with an older one.
     */
    if (!(await posDb.holdsLease(lease.ownerId, lease.fence, this.now()))) {
      this.leaseHeld = false;
      this.leaseLost = true;
      this.dropLeaseTimer();
      await posDb.logAudit('SYNC_BLOCKED', 'syncQueue', item.id, {
        reason: 'fenced',
        detail: 'Response discarded: this terminal lost the flush lease while the request was in flight.',
      });
      return 'skipped';
    }

    const body = await response.json().catch(() => ({}));
    const classification = classifyCommandResponse(response.status, body);

    if (classification.outcome === 'acknowledged') {
      const ack = body as Record<string, unknown>;
      await posDb.markCommandAcknowledged(item, ack, lease);
      if ((item.retryCount ?? 0) > 0) {
        await posDb.logAudit('SYNC_RESOLVED', 'syncQueue', item.id, {
          resolvedAfterRetries: item.retryCount,
        });
      }
      return 'acknowledged';
    }

    const reason = classification.reason ?? 'SERVER';
    const detail = classification.detail ?? `HTTP ${response.status}`;

    if (classification.outcome === 'auth') {
      await posDb.markCommandBlocked(item, detail, 'AUTH_REQUIRED', lease);
      this.awaitingAuth = true;
      this.notifyReauthRequired(detail);
      await posDb.logAudit('SYNC_AUTH_REQUIRED', 'syncQueue', item.id, { status: response.status });
      return 'blocked';
    }

    if (classification.outcome === 'retryable') {
      const serverRetryable = (body as { error?: { retryable?: boolean } })?.error?.retryable;
      const backoff = computeBackoffMs(item.retryCount ?? 0, { random: this.random });
      const conflictVersion = (body as { error?: { currentVersion?: number } })?.error?.currentVersion;

      /**
       * CONCURRENCY_CONFLICT is not a transport retry. It is the server reporting
       * that the order moved since this command was built, and the fix is to
       * rebuild the precondition — never to drop it.
       *
       * Dropping `expectedVersion` would apply the command against whatever state
       * happened to exist, which is exactly the lost-update the check exists to
       * prevent. Keeping the *same* `commandId` while replacing
       * `expectedVersion` with the server's `currentVersion` is safe because the
       * server pins no receipt for a concurrency conflict: the retry is the same
       * intent with a corrected precondition, not a key reused for other work.
       */
      if (typeof conflictVersion === 'number') {
        const applied = await this.reviseExpectedVersion(item, conflictVersion, detail, lease);
        return applied ? 'retry' : 'blocked';
      }

      if (reason === 'CONFLICT') {
        // A conflict the server could not describe with a version cannot be
        // resolved by guessing a precondition. Surface it instead.
        await posDb.markCommandBlocked(item, detail, reason, lease);
        await posDb.logAudit('SYNC_BLOCKED', 'syncQueue', item.id, { reason, detail });
        return 'blocked';
      }

      if (backoff.exhausted || serverRetryable === false) {
        await posDb.markCommandBlocked(
          item,
          `Failed after ${MAX_AUTOMATIC_RETRIES} attempts: ${detail}`,
          reason,
          lease
        );
        await posDb.logAudit('SYNC_FAILED', 'syncQueue', item.id, {
          detail,
          retryCount: item.retryCount,
        });
        return 'blocked';
      }
      await posDb.markCommandRetry(item, detail, reason, this.now() + backoff.delayMs, lease);
      return 'retry';
    }

    // blocked: an actionable permanent failure the operator must see.
    await posDb.markCommandBlocked(item, detail, reason, lease);
    await posDb.logAudit('SYNC_BLOCKED', 'syncQueue', item.id, { reason, detail });
    return 'blocked';
  }

  /**
   * Replace a command's optimistic precondition with the version the server
   * reported, keeping the same `commandId`.
   *
   * Recorded as a revision so an operator can tell a corrected retry from an
   * unrelated re-send when reading the audit trail.
   */
  private async reviseExpectedVersion(
    item: SyncQueueItem,
    currentVersion: number,
    detail: string,
    lease: { ownerId: string; fence: number }
  ): Promise<boolean> {
    const previous = item.expectedVersion;
    const revision = (item.expectedVersionRevision ?? 0) + 1;
    const backoff = computeBackoffMs(item.retryCount ?? 0, { random: this.random });
    if (backoff.exhausted) {
      await posDb.markCommandBlocked(
        item,
        `Order kept changing on another device after ${revision} revision(s): ${detail}`,
        'CONFLICT',
        lease
      );
      return false;
    }
    const applied = await posDb.applyCommandOutcome(item, lease.ownerId, lease.fence, (current) => ({
        ...current,
        status: 'PENDING',
        expectedVersion: currentVersion,
        expectedVersionRevision: revision,
        retryCount: (current.retryCount ?? 0) + 1,
        lastAttemptAt: new Date().toISOString(),
        nextAttemptAt: this.now() + backoff.delayMs,
        lastError: detail,
        errorMessage: detail,
        failureCode: 'CONFLICT',
        failureDetail: detail,
        leaseFence: undefined,
        leaseOwner: undefined,
      })
    );
    if (!applied) return false;
    await posDb.logAudit('SYNC_RESOLVED', 'syncQueue', item.id, {
      reason: 'expected_version_revised',
      from: previous,
      to: currentVersion,
      revision,
    });
    return true;
  }

  /**
   * Flush pending commands in dependency order.
   *
   * Ordering matters twice over:
   *  - a payment or KOT queued after an accept must not overtake it, or the
   *    server rejects it as an invalid transition;
   *  - commands for one order each bump `orders.version`, so they are applied one
   *    at a time, walking each order's chain until it stops making progress.
   *
   * Ownership is the durable Dexie lease, not an in-memory flag: a second tab
   * sees a live lease and queues work without dispatching, and this tab stops
   * the moment it is fenced.
   */
  async flushSyncQueue(): Promise<FlushPlan> {
    const emptyPlan: FlushPlan = { runnable: [], deferred: [], blocked: [], chains: [] };
    if (!this.scope.tenantId) return emptyPlan;
    if (this.isSyncingQueue || !this.isOnline()) {
      await this.emitHealth();
      return emptyPlan;
    }
    if (this.awaitingAuth) {
      await this.emitHealth();
      return emptyPlan;
    }
    if (!this.leaseHeld) {
      // Not ours to dispatch. Re-attempt acquisition in case the previous owner
      // released cleanly or its lease expired since the last flush.
      await this.acquireLease();
      if (!this.leaseHeld) {
        await this.emitHealth();
        return emptyPlan;
      }
    }
    return this.performFlush();
  }

  private async performFlush(): Promise<FlushPlan> {
    this.isSyncingQueue = true;
    const lease = { ownerId: this.workerId, fence: this.fence };
    try {
      if (this.bootstrapPromise) {
        await this.bootstrapPromise.catch(() => undefined);
        this.bootstrapPromise = null;
      }

      // The whole unsettled queue, not just the sendable slice: gating needs to
      // see a predecessor that is FAILED, BLOCKED or in flight elsewhere.
      const unsettled = await posDb.getUnsettledCommands(this.scope.tenantId);
      const plan = planFlushOrder(unsettled.map(toQueuedCommand));

      for (const blocked of plan.blocked) {
        const item = unsettled.find((candidate) => candidate.id === blocked.item.id);
        if (!item) continue;
        await posDb.markCommandBlocked(item, blocked.detail, blocked.reason, lease);
        await posDb.logAudit('SYNC_BLOCKED', 'syncQueue', item.id, {
          reason: blocked.reason,
          detail: blocked.detail,
        });
      }

      const runnableIds = new Set(plan.runnable.map((item) => item.id));

      /**
       * Walk each order's chain from the front.
       *
       * The plan releases only the head of each order, so the *first* item must
       * be in `runnableIds`. After it settles successfully the chain may continue
       * to the next command, because by then that command's predecessor is
       * genuinely resolved rather than merely ahead of it in the queue. The walk
       * stops at the first item that does not settle, so nothing ever overtakes
       * an unresolved predecessor. Other orders are unaffected — a stuck order
       * never blocks the rest of the queue.
       */
      for (const chain of plan.chains) {
        if (!this.isOnline()) break;
        await this.dispatchChain(chain, unsettled, runnableIds, lease);
      }

      await this.emitHealth();
      return plan;
    } finally {
      this.isSyncingQueue = false;
    }
  }

  private async dispatchChain(
    chain: PosOrderChain,
    unsettled: SyncQueueItem[],
    runnableIds: Set<string>,
    lease: { ownerId: string; fence: number }
  ): Promise<void> {
    let released = 0;

    for (const queued of chain.items) {
      if (!this.isOnline()) return;
      if (!(await posDb.holdsLease(lease.ownerId, lease.fence, this.now()))) {
        this.leaseHeld = false;
        this.leaseLost = true;
        this.dropLeaseTimer();
        return;
      }

      if (released === 0) {
        // The plan's gate decides whether this order starts flushing at all.
        if (!runnableIds.has(queued.id)) return;
      }

      // From here on the live row is the authority: a later chain item may only
      // run once the one before it is no longer PENDING in flight.
      const source =
        unsettled.find((candidate) => candidate.id === queued.id) ??
        (await posDb.syncQueue.get(queued.id));
      if (!source) return;
      if (source.status !== 'PENDING') return;
      if (source.nextAttemptAt && source.nextAttemptAt > this.now()) return;

      // Claim atomically with the fence, so a replaced worker cannot start one.
      const claimed = await posDb.claimCommand(source, lease.ownerId, lease.fence);
      if (!claimed) return;

      let outcome: SettleOutcome;
      try {
        outcome = await this.dispatchCommand(claimed, lease);
      } catch (error: unknown) {
        // dispatchCommand handles its own outcomes; anything reaching here is a
        // bug and must be visible rather than leaving the item in-flight.
        const detail = error instanceof Error ? error.message : String(error);
        await posDb.markCommandBlocked(claimed, detail, 'SERVER', lease);
        await posDb.logAudit('SYNC_FAILED', 'syncQueue', claimed.id, { detail, unexpected: true });
        outcome = 'blocked';
      }

      if (outcome !== 'acknowledged') return;
      released += 1;
    }
  }

  mapFirestoreToPosOrder(id: string, data: Record<string, unknown>): PosOrder {
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const items = rawItems.map((item: Record<string, unknown>) => {
      const unitPrice = Number(item.price ?? item.unitPrice ?? 0);
      const quantity = Math.max(1, Number(item.quantity ?? 1));
      return {
        itemId: String(item.itemId ?? item.menuItemId ?? ''),
        name: String(item.name ?? 'Item'),
        price: unitPrice,
        quantity,
        lineTotal: Number(item.lineTotal ?? unitPrice * quantity),
        notes: item.notes ? String(item.notes) : undefined,
      };
    });

    const pricing = (data.pricing as Record<string, unknown>) ?? {};
    const subtotal = Number(data.subtotal ?? pricing.subtotal ?? 0);
    const taxes = Number(data.gstAmount ?? pricing.taxes ?? 0);
    const deliveryFee = Number(data.deliveryFee ?? pricing.deliveryFee ?? 0);
    const packingFee = Number(data.packingFee ?? pricing.packingFee ?? 0);
    const discount = Number(data.discountAmount ?? pricing.discount ?? 0);
    const total = Number(data.totalAmount ?? data.total ?? pricing.total ?? 0);

    const rawStatus = String(data.orderStatus || data.status || 'PLACED').toUpperCase();
    const orderStatus: PosOrderStatus =
      rawStatus === 'PLACED' || rawStatus === 'NEW' || rawStatus === 'PENDING'
        ? 'NEW'
        : rawStatus === 'ACCEPTED' || rawStatus === 'CONFIRMED'
          ? 'ACCEPTED'
          : rawStatus === 'PREPARING'
            ? 'PREPARING'
            : rawStatus === 'READY'
              ? 'READY'
              : rawStatus === 'COMPLETED' || rawStatus === 'DELIVERED'
                ? 'COMPLETED'
                : rawStatus === 'CANCELLED'
                  ? 'CANCELLED'
                  : rawStatus === 'REJECTED'
                    ? 'REJECTED'
                    : 'NEW';

    const customerData = (data.customer as Record<string, unknown>) ?? {};
    const deliveryAddr = (data.deliveryAddress as Record<string, unknown>) ?? {};
    const customer = {
      name: String(customerData.name ?? data.customerName ?? 'Guest'),
      phone: String(customerData.phone ?? data.phone ?? ''),
      address: String(customerData.address ?? deliveryAddr.addressLine1 ?? data.address ?? ''),
      tableNo: customerData.tableNo ? String(customerData.tableNo) : undefined,
    };

    const paymentMethodRaw = String(data.paymentMethod || 'COD').toUpperCase();
    const paymentMethod = (
      ['UPI', 'COD', 'RAZORPAY', 'CASH', 'CARD'].includes(paymentMethodRaw)
        ? paymentMethodRaw
        : 'OTHER'
    ) as PosOrder['paymentMethod'];

    const paymentStatusRaw = String(data.paymentStatus || 'pending').toUpperCase();
    const paymentStatus = (
      ['PAID', 'RECORDED', 'VERIFIED', 'FAILED', 'REFUNDED', 'EXPIRED'].includes(paymentStatusRaw)
        ? paymentStatusRaw
        : 'PENDING'
    ) as PosOrder['paymentStatus'];

    const createdAt =
      data.createdAt && typeof (data.createdAt as { toDate?: () => Date }).toDate === 'function'
        ? (data.createdAt as { toDate: () => Date }).toDate().toISOString()
        : String(data.createdAt ?? new Date().toISOString());

    const timestamps = (data.timestamps as Record<string, unknown>) ?? {};

    return {
      id,
      onlineOrderId: id,
      restaurantId: String(data.tenantId ?? data.restaurantId ?? ''),
      orderNumber: typeof data.orderNumber === 'number' ? data.orderNumber : undefined,
      orderSource: (data.orderSource as PosOrder['orderSource']) ?? 'ORDERBHOJAN',
      orderType:
        String(data.orderType ?? '').toUpperCase() === 'PICKUP'
          ? 'PICKUP'
          : String(data.orderType ?? '').toUpperCase() === 'DINE_IN'
            ? 'DINE_IN'
            : 'DELIVERY',
      orderStatus,
      paymentMethod,
      paymentStatus,
      customer,
      items,
      pricing: { subtotal, taxes, deliveryFee, packingFee, discount, total },
      timestamps: {
        createdAt,
        acceptedAt: timestamps.acceptedAt ? String(timestamps.acceptedAt) : undefined,
        preparingAt: timestamps.preparingAt ? String(timestamps.preparingAt) : undefined,
        readyAt: timestamps.readyAt ? String(timestamps.readyAt) : undefined,
        completedAt: timestamps.completedAt ? String(timestamps.completedAt) : undefined,
        rejectedAt: timestamps.rejectedAt ? String(timestamps.rejectedAt) : undefined,
      },
      canonicalOrderStatus: rawStatus,
      rejectionReason: data.rejectionReason ? String(data.rejectionReason) : undefined,
      confirmedVersion: Number(data.version ?? 1) || 1,
      confirmedStatus: rawStatus,
      synced: true,
    };
  }
}

let singleton: OrderSyncService | null = null;

/** Lazily construct the service with the Firebase auth token provider. */
export const getOrderSyncService = (
  getIdToken: () => Promise<string | null>,
  apiBaseUrl?: string
): OrderSyncService => {
  if (!singleton) {
    singleton = new OrderSyncService({
      getIdToken,
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
    });
  }
  return singleton;
};

export const resetOrderSyncServiceForTests = (): void => {
  singleton?.dispose();
  singleton = null;
};