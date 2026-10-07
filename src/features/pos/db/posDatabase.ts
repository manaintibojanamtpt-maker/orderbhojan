import Dexie, { type Table } from 'dexie';
import type {
  PosOrder,
  PosMenuItem,
  Kot,
  PosPaymentRecord,
  SyncQueueItem,
  AuditLogEntry,
  BusinessDayState,
  PosAuditAction,
  PosEntityType,
  PosOperation,
} from '../domain/pos.types';
import {
  DEFAULT_LEASE_MS,
  SYNC_LEASE_NAME,
  evaluateLeaseAcquisition,
  evaluateLeaseRenewal,
  isCommandRecoverable,
  isLeaseFenceCurrent,
  type SyncLeaseRecord,
} from '../services/posSyncLease';

export interface RecordPaymentResult {
  success: boolean;
  order?: PosOrder;
  alreadyPaid?: boolean;
  message?: string;
}

/**
 * Acknowledged queue records are retained for this long so a device that was
 * offline can prove what the server confirmed. Only *acknowledged* work is ever
 * eligible for removal — unsynced payments and KOTs are never discarded.
 */
const ACKNOWLEDGED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Highest declared schema version. Tests and diagnostics compare against this
 * instead of a literal so adding an additive version does not break assertions
 * that only care that the upgrade path ran.
 */
export const CURRENT_SCHEMA_VERSION = 4;

export interface QueueScope {
  tenantId: string;
  deviceId?: string;
}

export class PosDatabase extends Dexie {
  orders!: Table<PosOrder, string>;
  menu!: Table<PosMenuItem, string>;
  kots!: Table<Kot, string>;
  payments!: Table<PosPaymentRecord, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  auditLogs!: Table<AuditLogEntry, string>;
  businessDayState!: Table<BusinessDayState, string>;
  backups!: Table<{ id: string; createdAt: string; data: Record<string, unknown> }, string>;
  /** Durable flush ownership with a fencing token. See services/posSyncLease. */
  syncLeases!: Table<SyncLeaseRecord, string>;

  private sequenceCounter = 0;

  constructor() {
    super('OrderBhojanPosDb');

    // v1/v2 are the historical schemas; they are declared so Dexie can migrate
    // real devices forward. Their contents are never dropped.
    this.version(1).stores({
      orders: 'id, onlineOrderId, restaurantId, orderSource, orderStatus, paymentStatus',
      menu: 'id, restaurantId, category, isAvailable',
      kots: 'id, orderId, kotNumber, restaurantId, status, createdAt',
      payments: 'id, orderId, restaurantId, method, status, recordedAt',
      syncQueue: 'id, action, entity, status, createdAt',
    });

    this.version(2).stores({
      orders: 'id, onlineOrderId, restaurantId, orderSource, orderStatus, paymentStatus',
      menu: 'id, restaurantId, category, isAvailable',
      kots: 'id, orderId, kotNumber, restaurantId, status, createdAt',
      payments: 'id, orderId, restaurantId, method, status, recordedAt',
      syncQueue: 'id, action, entity, entityType, entityId, status, createdAt',
      auditLogs: 'id, timestamp, action, entity, entityId',
      businessDayState: 'date, restaurantId, isClosed',
      backups: 'id, createdAt',
    });

    /**
     * v3 — Phase A/B durable command queue.
     *
     * Additive only: every v2 field is retained and new indexes are appended, so
     * an upgrade never loses an unsynced payment or KOT. New columns are backfilled
     * from legacy `action`/`entity`/`data` in `upgradeToV3`.
     */
    this.version(3)
      .stores({
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
      })
      .upgrade(async (tx) => {
        await tx
          .table<SyncQueueItem>('syncQueue')
          .toCollection()
          .modify((item: SyncQueueItem) => {
            // Legacy records keep their data; we only add the derived fields the
            // new flusher needs. `status` is preserved verbatim so an in-flight
            // SYNCING record from a crashed session can be recovered.
            if (item.payload === undefined && item.data !== undefined) {
              item.payload = item.data;
            }
            if (item.entityType === undefined) {
              item.entityType =
                item.entity === 'kots' ? 'KOT' : item.entity === 'payments' ? 'PAYMENT' : 'ORDER';
            }
            if (item.entityId === undefined) {
              const data = item.payload ?? item.data ?? {};
              item.entityId = String(data.orderId ?? data.id ?? '');
            }
            if (item.operation === undefined) {
              item.operation = item.action === 'UPDATE_STATUS' ? 'UPDATE' : 'CREATE';
            }
            item.clientSequence = item.clientSequence ?? 0;
            item.orderSequence = item.orderSequence ?? item.clientSequence;
            if (item.retryCount === undefined) item.retryCount = 0;
            if (item.createdAt === undefined) item.createdAt = new Date(0).toISOString();

            /**
             * Retention is driven by `acknowledgedAt`, which v2 never wrote. A
             * SYNCED row was only ever marked after a successful response, so the
             * enqueue time is a safe floor and lets retention actually reclaim
             * legacy rows instead of growing without bound.
             */
            if (item.status === 'SYNCED' && typeof item.acknowledgedAt !== 'number') {
              const parsed = Date.parse(item.createdAt);
              item.acknowledgedAt = Number.isNaN(parsed) ? Date.now() : parsed;
            }

            /**
             * Every queue read, retry gate and recovery path is tenant-scoped, so a
             * migrated row without a tenant would sit in IndexedDB forever,
             * invisible and never dispatched. Recover the tenant from the legacy
             * payload when possible; when it is genuinely absent, surface the row
             * as blocked rather than silently stranding recorded money.
             */
            if (!item.tenantId) {
              const data = (item.payload ?? item.data ?? {}) as Record<string, unknown>;
              const derived = data.restaurantId ?? data.tenantId;
              if (typeof derived === 'string' && derived) {
                item.tenantId = derived;
              } else if (item.status !== 'SYNCED') {
                item.status = 'BLOCKED';
                item.failureCode = 'TENANT_REQUIRED';
                item.failureDetail =
                  'Queued before tenant scoping existed. Select the restaurant to release this item.';
                item.lastError = item.failureDetail;
              }
            }
          });
      });

    /**
     * v4 — durable sync lease with fencing.
     *
     * Additive only. `syncLeases` is a new table and `leaseFence` / `leaseOwner`
     * are new columns; nothing existing is dropped or rewritten, so a device
     * mid-queue upgrades without losing an unsynced payment or KOT.
     */
    this.version(4)
      .stores({
        orders:
          'id, onlineOrderId, restaurantId, orderSource, orderStatus, paymentStatus, canonicalOrderStatus',
        menu: 'id, restaurantId, category, isAvailable',
        kots: 'id, orderId, kotNumber, restaurantId, status, createdAt',
        payments: 'id, orderId, restaurantId, method, status, recordedAt',
        syncQueue:
          'id, tenantId, deviceId, clientSequence, orderSequence, status, nextAttemptAt, acknowledgedAt, leaseFence, createdAt, [tenantId+status], [tenantId+orderSequence]',
        auditLogs: 'id, timestamp, action, entity, entityId',
        businessDayState: 'date, restaurantId, isClosed',
        backups: 'id, createdAt',
        syncLeases: 'id, ownerId, fencingToken, expiresAt',
      });
  }

  // -------------------------------------------------------------------------
  // Durable sync lease
  // -------------------------------------------------------------------------

  /**
   * Take the flush lease, or report who holds it.
   *
   * Read and write happen in one Dexie transaction so two tabs racing to take an
   * expired lease cannot both win: the second observes the first's record and
   * takes the *next* fencing token instead of reusing the same one.
   */
  async acquireSyncLease(
    ownerId: string,
    nowMs = Date.now(),
    leaseMs = DEFAULT_LEASE_MS
  ): Promise<{ acquired: boolean; token: number; takeover: boolean; heldBy?: string }> {
    let outcome: { acquired: boolean; token: number; takeover: boolean; heldBy?: string } = {
      acquired: false,
      token: 0,
      takeover: false,
    };

    await this.transaction('rw', this.syncLeases, async () => {
      const existing = (await this.syncLeases.get(SYNC_LEASE_NAME)) as SyncLeaseRecord | undefined;
      const decision = evaluateLeaseAcquisition(
        existing ? { ...existing } : undefined,
        ownerId,
        nowMs
      );
      if (!decision.acquired) {
        outcome = {
          acquired: false,
          token: decision.token,
          takeover: false,
          heldBy: decision.ownerId,
        };
        return;
      }
      const record: SyncLeaseRecord = {
        id: SYNC_LEASE_NAME,
        ownerId,
        fencingToken: decision.token,
        // Refresh `acquiredAt` only on a genuine change of owner so the record
        // still shows when this worker started its tenure.
        acquiredAt: decision.takeover || !existing ? nowMs : (existing.acquiredAt ?? nowMs),
        renewedAt: nowMs,
        expiresAt: nowMs + leaseMs,
        leaseMs,
      };
      await this.syncLeases.put(record);
      outcome = { acquired: true, token: decision.token, takeover: decision.takeover };
    });

    return outcome;
  }

  /**
   * Extend the lease. Returns false when this worker is no longer the owner,
   * which is the signal to stop flushing immediately.
   */
  async renewSyncLease(
    ownerId: string,
    token: number,
    nowMs = Date.now(),
    leaseMs = DEFAULT_LEASE_MS
  ): Promise<boolean> {
    let renewed = false;
    await this.transaction('rw', this.syncLeases, async () => {
      const existing = (await this.syncLeases.get(SYNC_LEASE_NAME)) as SyncLeaseRecord | undefined;
      const decision = evaluateLeaseRenewal(
        existing ? { ...existing } : undefined,
        ownerId,
        token,
        nowMs,
        leaseMs
      );
      if (!decision.renewed || !existing) return;
      await this.syncLeases.put({
        ...existing,
        renewedAt: nowMs,
        expiresAt: decision.expiresAt,
        leaseMs,
      });
      renewed = true;
    });
    return renewed;
  }

  /**
   * Give the lease up so another tab can take over without waiting for expiry.
   * Only the current owner's token may release it.
   */
  async releaseSyncLease(ownerId: string, token: number): Promise<boolean> {
    let released = false;
    await this.transaction('rw', this.syncLeases, async () => {
      const existing = (await this.syncLeases.get(SYNC_LEASE_NAME)) as SyncLeaseRecord | undefined;
      if (!existing || !isLeaseFenceCurrent(existing, ownerId, token)) return;
      // Expire rather than delete: the fencing token must keep increasing so a
      // paused worker can still detect that it has been displaced.
      await this.syncLeases.put({ ...existing, expiresAt: 0 });
      released = true;
    });
    return released;
  }

  async readSyncLease(): Promise<SyncLeaseRecord | undefined> {
    return (await this.syncLeases.get(SYNC_LEASE_NAME)) as SyncLeaseRecord | undefined;
  }

  /**
   * Highest fencing token this device has ever issued. Used to decide which
   * in-flight commands belong to a dead worker.
   */
  async highestLeaseFence(): Promise<number> {
    const record = await this.readSyncLease();
    return record?.fencingToken ?? 0;
  }

  /**
   * Recover commands interrupted mid-flight.
   *
   * A browser tab killed during a request leaves records in SYNCING; those must
   * return to PENDING or the queue silently stalls forever. The fence is what
   * makes this safe in the presence of other live tabs: a command claimed at a
   * token behind the current one, or at the current token whose lease has since
   * expired, belongs to a worker that is gone. A command at the current token
   * under a live lease belongs to another tab that is still running, and
   * resetting it would send the same command twice.
   */
  async recoverInFlightCommands(scope?: QueueScope, nowMs = Date.now()): Promise<number> {
    const lease = await this.readSyncLease();
    const currentFence = lease?.fencingToken ?? 0;
    const syncing = await this.syncQueue.where('status').equals('SYNCING').toArray();
    const candidates = scope?.tenantId
      ? syncing.filter((item) => item.tenantId === scope.tenantId)
      : syncing;

    const items = candidates.filter((item) =>
      isCommandRecoverable(item.leaseFence, currentFence, nowMs, lease?.expiresAt)
    );

    for (const item of items) {
      item.status = 'PENDING';
      item.lastError = 'Recovered after interrupted sync';
      // Drop the dead worker's fence so the next worker can claim it cleanly.
      delete item.leaseFence;
      delete item.leaseOwner;
      await this.syncQueue.put(item);
    }
    return items.length;
  }

  /**
   * Claim a command for dispatch.
   *
   * Fails when the command is no longer PENDING, when this worker's fence has
   * been superseded by the record's own fence, or — the important case — when
   * this worker no longer holds the lease at all. Without that last check a
   * fenced worker could still start brand new work after being replaced.
   *
   * The claim and the fence are written together so a stale worker can never win
   * a race to mark a command SYNCING and then have its outcome discarded.
   */
  async claimCommand(
    item: SyncQueueItem,
    ownerId: string,
    fence: number
  ): Promise<SyncQueueItem | undefined> {
    let claimed: SyncQueueItem | undefined;
    await this.transaction('rw', [this.syncQueue, this.syncLeases], async () => {
      const lease = await this.syncLeases.get(SYNC_LEASE_NAME);
      if (!isLeaseFenceCurrent(lease as SyncLeaseRecord | undefined, ownerId, fence)) return;
      const fresh = await this.syncQueue.get(item.id);
      if (!fresh || fresh.status !== 'PENDING') return;
      if (typeof fresh.leaseFence === 'number' && fresh.leaseFence > fence) return;
      const next: SyncQueueItem = {
        ...fresh,
        status: 'SYNCING',
        lastAttemptAt: new Date().toISOString(),
        leaseFence: fence,
        leaseOwner: ownerId,
      };
      await this.syncQueue.put(next);
      claimed = next;
    });
    return claimed;
  }

  /**
   * True when this worker still owns the flush lease at the token it claimed
   * with. Every post-await write checks this so a late response from a replaced
   * worker is dropped instead of overwriting the current owner's outcome.
   */
  async holdsLease(ownerId: string, fence: number, nowMs = Date.now()): Promise<boolean> {
    const lease = await this.readSyncLease();
    if (!isLeaseFenceCurrent(lease ?? undefined, ownerId, fence)) return false;
    // An expired lease is no longer ours to act on even if nobody has taken it.
    return (lease?.expiresAt ?? 0) > nowMs;
  }

  /**
   * Apply an outcome to a command only while this worker still holds the fence.
   * Returns false when the write was skipped as stale.
   */
  async applyCommandOutcome(
    item: SyncQueueItem,
    ownerId: string,
    fence: number,
    mutate: (current: SyncQueueItem) => SyncQueueItem | undefined
  ): Promise<boolean> {
    if (!(await this.holdsLease(ownerId, fence))) return false;
    let applied = false;
    await this.transaction('rw', [this.syncQueue, this.syncLeases], async () => {
      // Re-check inside the transaction: the lease can change between the check
      // above and the write below.
      const lease = await this.syncLeases.get(SYNC_LEASE_NAME);
      if (!isLeaseFenceCurrent(lease as SyncLeaseRecord | undefined, ownerId, fence)) return;
      const fresh = await this.syncQueue.get(item.id);
      if (!fresh) return;
      if (fresh.leaseFence !== undefined && fresh.leaseFence !== fence) return;
      const next = mutate(fresh);
      if (!next) return;
      await this.syncQueue.put(next);
      applied = true;
    });
    return applied;
  }

  /**
   * Queue a walk-in bill as an authoritative `CreateOrder` command.
   *
   * The order id is minted once, here, and becomes the server's document id. That
   * is the durable client→server identity: it is stored in IndexedDB, used as the
   * `Idempotency-Key` of the creation command, and reused by every later command
   * for this order. Nothing about the bill's *money* is trusted by the server —
   * only its items and customer are sent — but the id is what makes a retry
   * impossible to confuse with a different order.
   *
   * Every subsequent walk-in command (KOT, payment, completion) is queued against
   * this same id and ordered after it by `nextOrderSequence`, so the order exists
   * on the server before anything tries to act on it.
   */
  async createWalkInOrder(order: PosOrder, scope?: Partial<QueueScope>): Promise<SyncQueueItem> {
    if (scope?.tenantId && order.restaurantId && order.restaurantId !== scope.tenantId) {
      throw new Error(
        `Refusing to queue order ${order.id} for tenant ${order.restaurantId}: the POS is scoped to ${scope.tenantId}.`
      );
    }

    await this.orders.put({
      ...order,
      synced: false,
      localVersion: (order.localVersion ?? order.confirmedVersion ?? 1) + 1,
    });

    await this.logAudit('ORDER_CREATED', 'orders', order.id, {
      source: order.orderSource,
      total: order.pricing?.total,
    });

    return this.enqueueSync(
      'CreateOrder',
      'ORDER',
      {
        // Carried in the payload as well so the planner keys the command on the
        // same identity the route uses.
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        paymentMethod: order.paymentMethod,
        customer: order.customer,
        items: order.items.map((item) => ({
          itemId: item.itemId,
          name: item.name,
          unitPrice: item.price,
          quantity: item.quantity,
          ...(item.notes ? { notes: item.notes } : {}),
        })),
        discountPercent: 0,
        gstPercent: 0,
      },
      { operation: 'CREATE', entityId: order.id, ...scope }
    );
  }

  async nextSequence(tenantId: string): Promise<number> {
    this.sequenceCounter += 1;
    // Sequence is only used for local ordering and correlation; a monotonic
    // counter scoped to this device is sufficient and needs no server round-trip.
    void tenantId;
    return this.sequenceCounter;
  }

  /** Per-order monotonic counter for dependency ordering within one device. */
  async nextOrderSequence(tenantId: string, orderId: string): Promise<number> {
    const existing = await this.syncQueue
      .where('[tenantId+orderSequence]')
      .between([tenantId, Dexie.minKey], [tenantId, Dexie.maxKey])
      .filter((item) => item.entityId === orderId || item.payload?.orderId === orderId)
      .toArray();
    const highest = existing.reduce((max, item) => Math.max(max, item.orderSequence ?? 0), 0);
    return highest + 1;
  }

  async upsertOnlineOrder(order: PosOrder): Promise<{ created: boolean; order: PosOrder }> {
    if (order.onlineOrderId) {
      const existing = await this.orders.where('onlineOrderId').equals(order.onlineOrderId).first();
      if (existing) {
        // Never let a Firestore snapshot regress locally confirmed state.
        const merged: PosOrder = {
          ...existing,
          ...order,
          id: existing.id,
          kotPrinted: existing.kotPrinted ?? order.kotPrinted,
          billPrinted: existing.billPrinted ?? order.billPrinted,
          confirmedVersion: Math.max(existing.confirmedVersion ?? 1, order.confirmedVersion ?? 1),
        };
        await this.orders.put(merged);
        return { created: false, order: merged };
      }
    }
    await this.orders.put(order);
    await this.logAudit('ORDER_CREATED', 'orders', order.id, {
      source: order.orderSource,
      onlineOrderId: order.onlineOrderId,
      total: order.pricing.total,
    });
    return { created: true, order };
  }

  async getOrders(restaurantId: string): Promise<PosOrder[]> {
    const records = await this.orders.where('restaurantId').equals(restaurantId).toArray();
    return records.sort((a, b) => {
      const timeA = new Date(a.timestamps?.createdAt || 0).getTime();
      const timeB = new Date(b.timestamps?.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }

  async updateOrderStatus(
    orderId: string,
    status: PosOrder['orderStatus'],
    extra?: { rejectionReason?: string },
    scope?: Partial<QueueScope>
  ): Promise<PosOrder | undefined> {
    const order = await this.orders.get(orderId);
    if (!order) return undefined;

    const now = new Date().toISOString();
    const updatedTimestamps = { ...order.timestamps };
    if (status === 'ACCEPTED' || status === 'PREPARING') {
      if (!updatedTimestamps.acceptedAt) updatedTimestamps.acceptedAt = now;
    }
    if (status === 'PREPARING' && !updatedTimestamps.preparingAt) updatedTimestamps.preparingAt = now;
    if (status === 'READY') updatedTimestamps.readyAt = now;
    if (status === 'COMPLETED') updatedTimestamps.completedAt = now;
    if (status === 'REJECTED') updatedTimestamps.rejectedAt = now;

    const updated: PosOrder = {
      ...order,
      orderStatus: status,
      timestamps: updatedTimestamps,
      ...(extra?.rejectionReason ? { rejectionReason: extra.rejectionReason } : {}),
      // Optimistic local state only; `confirmedStatus` still reflects the server.
      synced: false,
      localVersion: (order.localVersion ?? order.confirmedVersion ?? 1) + 1,
    };

    await this.orders.put(updated);

    if (status === 'ACCEPTED') {
      await this.logAudit('ORDER_ACCEPTED', 'orders', orderId, { orderStatus: status });
    } else if (status === 'REJECTED') {
      await this.logAudit('ORDER_REJECTED', 'orders', orderId, { reason: extra?.rejectionReason });
    } else if (status === 'CANCELLED') {
      await this.logAudit('ORDER_CANCELLED', 'orders', orderId, { reason: extra?.rejectionReason });
    }

    await this.enqueueSync(
      'UpdateOrderStatus',
      'ORDER',
      {
        orderId: order.onlineOrderId ?? order.id,
        orderStatus: status,
        ...(extra?.rejectionReason ? { rejectionReason: extra.rejectionReason } : {}),
      },
      { operation: 'UPDATE', entityId: orderId, ...scope }
    );

    return updated;
  }

  /**
   * Record a staff-collected payment locally and queue the authoritative
   * RecordPayment command. Gateway payments must never reach this path.
   */
  async recordPayment(
    orderId: string,
    method: PosOrder['paymentMethod'],
    amount: number,
    reference?: string,
    scope?: Partial<QueueScope>
  ): Promise<RecordPaymentResult> {
    const order = await this.orders.get(orderId);
    if (!order) return { success: false, message: 'Order not found' };

    if (order.paymentStatus === 'RECORDED' || order.paymentStatus === 'VERIFIED') {
      return {
        success: false,
        alreadyPaid: true,
        message: 'Payment already recorded.',
        order,
      };
    }

    const now = new Date().toISOString();
    const commandId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const updated: PosOrder = {
      ...order,
      paymentMethod: method,
      paymentStatus: 'RECORDED',
      synced: false,
    };
    await this.orders.put(updated);

    const paymentRecord: PosPaymentRecord = {
      id: commandId,
      orderId,
      restaurantId: order.restaurantId,
      amount,
      method,
      status: 'RECORDED',
      recordedAt: now,
      reference,
      synced: false,
      commandId,
    };
    await this.payments.put(paymentRecord);

    await this.logAudit('PAYMENT_RECORDED', 'orders', orderId, { method, amount, reference });

    // A single RecordPayment command carries the payment; the legacy second
    // UPDATE_STATUS command is gone because the command API owns payment state.
    await this.enqueueSync(
      'RecordPayment',
      'PAYMENT',
      {
        orderId: order.onlineOrderId ?? order.id,
        method,
        amount,
        ...(reference ? { reference } : {}),
      },
      { operation: 'CREATE', entityId: orderId, ...scope }
    );

    return { success: true, order: updated, message: 'Payment recorded. Awaiting server confirmation.' };
  }

  async getNextKotNumber(restaurantId: string): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const kotsToday = await this.kots
      .where('restaurantId')
      .equals(restaurantId)
      .filter((k) => k.createdAt.startsWith(today))
      .toArray();
    return kotsToday.length + 1;
  }

  async createKot(order: PosOrder, scope?: Partial<QueueScope>): Promise<Kot> {
    const kotNumber = await this.getNextKotNumber(order.restaurantId);
    const kotId = `kot_${Date.now()}_${kotNumber}`;
    const kot: Kot = {
      id: kotId,
      kotNumber,
      orderId: order.id,
      onlineOrderId: order.onlineOrderId,
      restaurantId: order.restaurantId,
      orderType: order.orderType,
      tableNo: order.customer?.tableNo,
      items: order.items.map((i) => ({
        itemId: i.itemId,
        name: i.name,
        quantity: i.quantity,
        notes: i.notes,
      })),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      notes: order.items.filter((i) => i.notes).map((i) => `${i.name}: ${i.notes}`).join(' | ') || undefined,
      synced: false,
    };

    await this.kots.put(kot);
    await this.enqueueSync(
      'CreateKot',
      'KOT',
      { orderId: order.onlineOrderId ?? order.id, kotNumber, items: kot.items },
      { operation: 'CREATE', entityId: order.id, ...scope }
    );
    return kot;
  }

  /**
   * Queue a durable command. The returned `id` is reused verbatim as the
   * Idempotency-Key on the wire, so a retry can never duplicate the effect.
   */
  async enqueueSync(
    action: string,
    entityType: PosEntityType,
    payload: Record<string, unknown>,
    options: {
      operation?: PosOperation;
      entityId?: string;
      tenantId?: string;
      deviceId?: string;
      expectedVersion?: number;
    } = {}
  ): Promise<SyncQueueItem> {
    const tenantId = options.tenantId ?? String(payload.tenantId ?? payload.restaurantId ?? '');
    const orderId = String(payload.orderId ?? '');
    const id = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const clientSequence = await this.nextSequence(tenantId);
    const orderSequence = orderId ? await this.nextOrderSequence(tenantId, orderId) : clientSequence;

    const item: SyncQueueItem = {
      id,
      tenantId,
      deviceId: options.deviceId,
      clientSequence,
      orderSequence,
      correlationId: `pos_${id}`,
      expectedVersion: options.expectedVersion,
      entityType,
      entityId: options.entityId ?? orderId,
      operation: options.operation ?? 'UPDATE',
      payload,
      action: action as SyncQueueItem['action'],
      entity:
        entityType === 'KOT' ? 'kots' : entityType === 'PAYMENT' ? 'payments' : 'orders',
      data: payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'PENDING',
    };
    await this.syncQueue.put(item);
    return item;
  }

  /**
   * Every command for one tenant that has not reached a durable terminal state.
   *
   * `planFlushOrder` needs the *whole* picture, not just the sendable items: a
   * command that is PENDING behind one that is FAILED, BLOCKED or in flight in
   * another tab must be held, and that is only knowable if the other states are
   * visible. `SYNCED` rows are excluded because they have settled.
   */
  async getUnsettledCommands(tenantId: string): Promise<SyncQueueItem[]> {
    const items = await this.syncQueue.where('tenantId').equals(tenantId).toArray();
    return items
      .filter((item) => item.status !== 'SYNCED')
      .sort(
        (a, b) =>
          (a.orderSequence ?? 0) - (b.orderSequence ?? 0) || a.createdAt.localeCompare(b.createdAt)
      );
  }

  /**
   * Pending work for one tenant, oldest first, respecting backoff gates.
   *
   * Kept for callers that only need "what could be sent right now"; the flusher
   * uses {@link getUnsettledCommands} so it can gate on unresolved predecessors.
   */
  async getDispatchableCommands(
    tenantId: string,
    nowMs = Date.now()
  ): Promise<SyncQueueItem[]> {
    const pending = (await this.syncQueue.where('tenantId').equals(tenantId).toArray()).filter(
      (item) => item.status === 'PENDING'
    );
    return pending
      .filter((item) => !item.nextAttemptAt || item.nextAttemptAt <= nowMs)
      .sort((a, b) => (a.orderSequence ?? 0) - (b.orderSequence ?? 0));
  }

  async getBlockedCommands(tenantId: string): Promise<SyncQueueItem[]> {
    const items = await this.syncQueue.where('tenantId').equals(tenantId).toArray();
    return items
      .filter((item) => item.status === 'FAILED' || item.status === 'BLOCKED')
      .sort((a, b) => a.orderSequence! - b.orderSequence!);
  }

  async markCommandAcknowledged(
    item: SyncQueueItem,
    ack: Record<string, unknown>,
    lease?: { ownerId: string; fence: number }
  ): Promise<boolean> {
    const apply = async (): Promise<boolean> => {
      if (!lease) {
        item.status = 'SYNCED';
        item.acknowledgedAt = Date.now();
        item.nextAttemptAt = undefined;
        item.lastError = undefined;
        item.failureCode = undefined;
        item.failureDetail = undefined;
        delete item.leaseFence;
        delete item.leaseOwner;
        await this.syncQueue.put(item);
        return true;
      }
      return this.applyCommandOutcome(item, lease.ownerId, lease.fence, (current) => ({
        ...current,
        status: 'SYNCED',
        acknowledgedAt: Date.now(),
        nextAttemptAt: undefined,
        lastError: undefined,
        errorMessage: undefined,
        failureCode: undefined,
        failureDetail: undefined,
        leaseFence: undefined,
        leaseOwner: undefined,
      }));
    };

    const applied = await apply();
    if (!applied) return false;

    const orderId = String(item.payload?.orderId ?? '');
    if (!orderId) return true;
    const localOrder = await this.orders
      .where('onlineOrderId')
      .equals(orderId)
      .first()
      .catch(() => undefined);
    if (!localOrder) return true;
    /**
     * Only a fence holder may promote local state to "confirmed". A late
     * response from a replaced worker would otherwise overwrite a newer
     * acknowledgement with an older version.
     */
    if (lease && !(await this.holdsLease(lease.ownerId, lease.fence))) return true;
    await this.orders.put({
      ...localOrder,
      synced: true,
      confirmedVersion: Number(ack.version ?? localOrder.confirmedVersion ?? 1),
      confirmedStatus: String(ack.orderStatus ?? localOrder.confirmedStatus ?? ''),
      orderStatus: (String(ack.orderStatus ?? localOrder.orderStatus) as PosOrder['orderStatus']),
      paymentStatus: String(ack.paymentStatus ?? localOrder.paymentStatus) as PosOrder['paymentStatus'],
    });
    return true;
  }

  async markCommandRetry(
    item: SyncQueueItem,
    detail: string,
    code: string,
    nextAttemptAtMs: number,
    lease?: { ownerId: string; fence: number }
  ): Promise<boolean> {
    const mutate = (current: SyncQueueItem): SyncQueueItem => ({
      ...current,
      status: 'PENDING',
      retryCount: (current.retryCount ?? 0) + 1,
      lastAttemptAt: new Date().toISOString(),
      nextAttemptAt: nextAttemptAtMs,
      lastError: detail,
      errorMessage: detail,
      failureCode: code,
      failureDetail: detail,
      leaseFence: undefined,
      leaseOwner: undefined,
    });
    if (!lease) {
      await this.syncQueue.put(mutate(item));
      return true;
    }
    return this.applyCommandOutcome(item, lease.ownerId, lease.fence, mutate);
  }

  async markCommandBlocked(
    item: SyncQueueItem,
    detail: string,
    code: string,
    lease?: { ownerId: string; fence: number }
  ): Promise<boolean> {
    const mutate = (current: SyncQueueItem): SyncQueueItem => ({
      ...current,
      status: code === 'AUTH_REQUIRED' ? 'BLOCKED' : 'FAILED',
      lastError: detail,
      errorMessage: detail,
      failureCode: code,
      failureDetail: detail,
      leaseFence: undefined,
      leaseOwner: undefined,
    });
    if (!lease) {
      await this.syncQueue.put(mutate(item));
      return true;
    }
    return this.applyCommandOutcome(item, lease.ownerId, lease.fence, mutate);
  }

  /**
   * Release auth-blocked commands so a re-authenticated staff member can retry
   * them. No data is lost; the same command ids and idempotency keys are reused.
   */
  async releaseAuthBlockedCommands(tenantId: string): Promise<number> {
    const blocked = (await this.syncQueue.where('tenantId').equals(tenantId).toArray()).filter(
      (item) => item.status === 'BLOCKED'
    );
    for (const item of blocked) {
      item.status = 'PENDING';
      item.nextAttemptAt = undefined;
      item.failureCode = undefined;
      item.failureDetail = undefined;
      item.lastError = undefined;
      await this.syncQueue.put(item);
    }
    return blocked.length;
  }

  async getQueueDepth(tenantId?: string): Promise<{ pending: number; inFlight: number; blocked: number }> {
    const items = tenantId
      ? (await this.syncQueue.where('tenantId').equals(tenantId).toArray())
      : await this.syncQueue.toArray();
    return {
      pending: items.filter((i) => i.status === 'PENDING').length,
      inFlight: items.filter((i) => i.status === 'SYNCING').length,
      blocked: items.filter((i) => i.status === 'FAILED' || i.status === 'BLOCKED').length,
    };
  }

  /** Remove only acknowledged work older than the retention window. */
  async purgeAcknowledgedCommands(tenantId: string, nowMs = Date.now()): Promise<number> {
    const cutoff = nowMs - ACKNOWLEDGED_RETENTION_MS;
    const acknowledged = await this.syncQueue.where('status').equals('SYNCED').toArray();
    const removable = acknowledged.filter(
      (item) =>
        item.tenantId === tenantId &&
        typeof item.acknowledgedAt === 'number' &&
        item.acknowledgedAt < cutoff
    );
    await this.syncQueue.bulkDelete(removable.map((item) => item.id));
    return removable.length;
  }

  async cacheMenuItems(items: PosMenuItem[]): Promise<void> {
    if (!items.length) return;
    await this.menu.bulkPut(items);
  }

  async setItemAvailability(itemId: string, isAvailable: boolean): Promise<PosMenuItem | undefined> {
    const item = await this.menu.get(itemId);
    if (!item) return undefined;
    const updated: PosMenuItem = { ...item, isAvailable };
    await this.menu.put(updated);
    await this.logAudit(
      isAvailable ? 'ITEM_ENABLED' : 'ITEM_DISABLED',
      'menu',
      itemId,
      { name: item.name, isAvailable }
    );
    return updated;
  }

  async logAudit(
    action: PosAuditAction,
    entity: string,
    entityId: string,
    details: Record<string, unknown> = {},
    staffId?: string
  ): Promise<AuditLogEntry> {
    const entry: AuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      action,
      entity,
      entityId,
      staffId,
      details,
    };
    await this.auditLogs.put(entry);
    return entry;
  }

  async getAuditLogs(limit = 100): Promise<AuditLogEntry[]> {
    const logs = await this.auditLogs.toArray();
    return logs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async getBusinessDayState(restaurantId: string, dateStr?: string): Promise<BusinessDayState> {
    const targetDate = dateStr || new Date().toISOString().slice(0, 10);
    const existing = await this.businessDayState.get(targetDate);
    if (existing) return existing;
    const defaultState: BusinessDayState = { date: targetDate, restaurantId, isClosed: false, openingFloat: 0 };
    await this.businessDayState.put(defaultState);
    return defaultState;
  }

  async closeBusinessDay(
    restaurantId: string,
    openingFloat: number,
    actualClosingCash: number,
    closedBy = 'Staff'
  ): Promise<BusinessDayState> {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const state: BusinessDayState = {
      date: today,
      restaurantId,
      isClosed: true,
      closedAt: now,
      closedBy,
      openingFloat,
      actualClosingCash,
    };
    await this.businessDayState.put(state);
    await this.logAudit('DAY_CLOSED', 'businessDay', today, {
      openingFloat,
      actualClosingCash,
      closedBy,
    });
    return state;
  }

  /**
   * Reopen a closed business day.
   *
   * Authorization is delegated to the caller, which must supply a credential
   * already verified against the server (an admin capability or a tenant
   * supervisor PIN). A credential is never hardcoded in the client.
   */
  async reopenBusinessDay(
    restaurantId: string,
    credential: { verifiedBy: string; method: 'admin-session' | 'supervisor-pin' },
    reason: string,
    reopenedBy = 'Admin',
    targetDate?: string
  ): Promise<{ success: boolean; message: string; state?: BusinessDayState }> {
    if (!credential?.verifiedBy) {
      return { success: false, message: 'Reopen requires an authenticated supervisor credential.' };
    }
    if (!reason || reason.trim().length < 3) {
      return { success: false, message: 'Reopen reason is required' };
    }

    const dateKey = targetDate || new Date().toISOString().slice(0, 10);
    const existing = await this.businessDayState.get(dateKey);
    const updated: BusinessDayState = {
      ...(existing || { date: dateKey, restaurantId, openingFloat: 0 }),
      isClosed: false,
      reopenedAt: new Date().toISOString(),
      reopenedBy,
      reopenReason: reason.trim(),
    };

    await this.businessDayState.put(updated);
    await this.logAudit('DAY_REOPENED', 'businessDay', dateKey, {
      reason: reason.trim(),
      reopenedBy,
      reopenedAt: updated.reopenedAt,
      // Audited so a hardcoded-credential regression is detectable in the trail.
      authorizationMethod: credential.method,
      authorizedBy: credential.verifiedBy,
    });

    return { success: true, message: 'Business day reopened successfully', state: updated };
  }
}

export const posDb = new PosDatabase();