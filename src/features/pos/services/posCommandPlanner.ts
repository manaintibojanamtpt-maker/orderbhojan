/**
 * Phase A / B — Offline POS command planning.
 *
 * Pure logic that turns a durable sync-queue record into a server command
 * envelope, orders dependent commands, and classifies HTTP outcomes.
 *
 * Kept free of Dexie, Firebase and DOM so it can be unit tested directly.
 */

import type { OrderCommandType } from './posCommandContract';

/** Local queue states. `SYNCED` means durably acknowledged by the server. */
export type PosQueueState = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'BLOCKED';

/** Why a queued item cannot be delivered, surfaced to staff verbatim. */
export type PosFailureReason =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNSUPPORTED'
  | 'INVALID'
  | 'CONNECTION'
  | 'SERVER';

export interface PosQueuedCommand {
  id: string;
  tenantId: string;
  orderId: string;
  deviceId?: string;
  clientSequence: number;
  /** Order-local sequence; commands for one order must execute in this order. */
  orderSequence: number;
  action: PosQueueAction;
  payload: Record<string, unknown>;
  expectedVersion?: number;
  correlationId?: string;
  /**
   * Durable local state. Dependency gating needs it: a command may only run
   * when every earlier command for the same order has settled successfully.
   */
  state?: PosQueueState;
}

export type PosQueueAction =
  | 'CreateOrder'
  | 'AcceptOrder'
  | 'RejectOrder'
  | 'MarkPreparing'
  | 'MarkReady'
  | 'UpdateOrderStatus'
  | 'RecordPayment'
  | 'CreateKot';

/**
 * Legacy action spellings recorded by older POS builds. Mapped explicitly so a
 * queued record from a previous app version is replayed as the same intent.
 *
 * Legacy `CREATE_ORDER` maps to `CreateOrder` — the command that actually opens a
 * bill — and never to `UpdateOrderStatus`. Replaying an order creation as a
 * status change would target an order row the server does not have, and the
 * server would answer ORDER_NOT_FOUND; the queued record would then look like a
 * dead letter when in fact the order simply had never been created.
 */
const LEGACY_ACTION_MAP: Readonly<Record<string, PosQueueAction>> = {
  CREATE_ORDER: 'CreateOrder',
  UPDATE_STATUS: 'UpdateOrderStatus',
  ACCEPT_ORDER: 'AcceptOrder',
  REJECT_ORDER: 'RejectOrder',
  MARK_PREPARING: 'MarkPreparing',
  MARK_READY: 'MarkReady',
  RECORD_PAYMENT: 'RecordPayment',
  CREATE_KOT: 'CreateKot',
};

export const SUPPORTED_POS_ACTIONS: readonly PosQueueAction[] = [
  'CreateOrder',
  'AcceptOrder',
  'RejectOrder',
  'MarkPreparing',
  'MarkReady',
  'UpdateOrderStatus',
  'RecordPayment',
  'CreateKot',
] as const;

/** Legacy lifecycle spellings the POS is allowed to send, mapped to canonical. */
const POS_STATUS_TO_COMMAND: Readonly<Record<string, PosQueueAction>> = {
  ACCEPTED: 'AcceptOrder',
  CONFIRMED: 'AcceptOrder',
  REJECTED: 'RejectOrder',
  PREPARING: 'MarkPreparing',
  IN_KITCHEN: 'MarkPreparing',
  READY: 'MarkReady',
};

export interface PlanSuccess {
  ok: true;
  command: {
    commandId: string;
    type: OrderCommandType;
    tenantId: string;
    orderId: string;
    deviceId?: string;
    clientSequence: number;
    clientTime: string;
    expectedVersion?: number;
    correlationId: string;
    payload: Record<string, unknown>;
  };
}

export interface PlanFailure {
  ok: false;
  reason: PosFailureReason;
  detail: string;
}

export type PlanResult = PlanSuccess | PlanFailure;

/**
 * Derive the command for a queued record.
 *
 * Never guesses: an unrecognised action or a status-less update becomes a
 * visible permanent failure instead of a silently-accepted no-op.
 */
export const planQueuedCommand = (item: PosQueuedCommand): PlanResult => {
  const correlationId = item.correlationId ?? `pos_${item.id}`;

  if (!item.tenantId) {
    return {
      ok: false,
      reason: 'INVALID',
      detail: 'Queued command has no tenant. It cannot be attributed and will not be sent.',
    };
  }
  if (!item.orderId) {
    return {
      ok: false,
      reason: 'INVALID',
      detail: 'Queued command has no order id.',
    };
  }

  const mapped = LEGACY_ACTION_MAP[item.action] ?? item.action;
  if (!SUPPORTED_POS_ACTIONS.includes(mapped)) {
    return {
      ok: false,
      reason: 'UNSUPPORTED',
      detail: `Action '${item.action}' is not supported by the order command API. It must be resolved by staff; nothing was sent to the server.`,
    };
  }

  let type = mapped;
  let payload: Record<string, unknown> = { ...item.payload };

  if (mapped === 'CreateOrder') {
    const rawItems = payload.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return {
        ok: false,
        reason: 'INVALID',
        detail:
          'This queued order creation has no items, so there is nothing to bill. It was not sent and has not been discarded.',
      };
    }
    const rawCustomer = (payload.customer ?? {}) as Record<string, unknown>;
    const rawOrderType = String(payload.orderType ?? 'DINE_IN').trim().toUpperCase();
    if (!['DINE_IN', 'PICKUP', 'DELIVERY'].includes(rawOrderType)) {
      return {
        ok: false,
        reason: 'INVALID',
        detail: `Queued order type '${rawOrderType}' is not one of DINE_IN, PICKUP, DELIVERY. It was not sent.`,
      };
    }
    const rawMethod = String(payload.paymentMethod ?? 'CASH').trim().toUpperCase();

    /**
     * Only the *description* of the sale travels. The server recomputes the
     * subtotal, discount, tax and total, so a client total is never sent and can
     * never decide what the customer owes.
     */
    payload = {
      orderId: item.orderId,
      items: rawItems,
      customer: {
        name: String(rawCustomer.name ?? payload.customerName ?? ''),
        phone: String(rawCustomer.phone ?? payload.phone ?? ''),
        ...(rawCustomer.tableNo ? { tableNo: String(rawCustomer.tableNo) } : {}),
        ...(rawCustomer.address ?? payload.address
          ? { address: String(rawCustomer.address ?? payload.address) }
          : {}),
      },
      orderType: rawOrderType,
      paymentMethod: rawMethod === 'UPI' ? 'UPI_MANUAL' : rawMethod === 'COD' ? 'CASH' : rawMethod,
      ...(payload.orderNumber !== undefined ? { orderNumber: Number(payload.orderNumber) } : {}),
      discountPercent: Number(payload.discountPercent ?? 0),
      gstPercent: Number(payload.gstPercent ?? 0),
    };
  }

  if (mapped === 'UpdateOrderStatus') {
    const rawStatus = String(
      payload.orderStatus ?? payload.status ?? payload.newStatus ?? ''
    )
      .trim()
      .toUpperCase();
    if (!rawStatus) {
      return {
        ok: false,
        reason: 'UNSUPPORTED',
        detail:
          "UpdateOrderStatus was queued without a target status, so there is nothing to apply. Nothing was sent to the server.",
      };
    }
    type = POS_STATUS_TO_COMMAND[rawStatus] ?? 'UpdateOrderStatus';
    // Normalise the payload to the canonical command shape and drop fields the
    // command API would reject (notably paymentStatus).
    const nextPayload: Record<string, unknown> = { orderStatus: rawStatus };
    if (payload.rejectionReason) nextPayload.rejectionReason = payload.rejectionReason;
    if (rawStatus === 'CANCELLED' || rawStatus === 'REJECTED') {
      if (!nextPayload.rejectionReason) {
        nextPayload.rejectionReason = payload.reason ?? 'Recorded offline on POS';
      }
    }
    payload = nextPayload;
  }

  if (mapped === 'RecordPayment') {
    const method = String(payload.method ?? payload.paymentMethod ?? 'CASH')
      .trim()
      .toUpperCase();
    // UPI in the POS means a human verified a manual UPI collection.
    const canonicalMethod = method === 'UPI' ? 'UPI_MANUAL' : method;
    const nextPayload: Record<string, unknown> = { method: canonicalMethod };
    if (payload.amount !== undefined) nextPayload.amount = Number(payload.amount);
    if (payload.reference) nextPayload.reference = String(payload.reference);
    payload = nextPayload;
  }

  if (mapped === 'CreateKot') {
    const nextPayload: Record<string, unknown> = {};
    if (Array.isArray(payload.items)) nextPayload.items = payload.items;
    if (payload.kotNumber !== undefined) nextPayload.kotNumber = Number(payload.kotNumber);
    payload = nextPayload;
  }

  return {
    ok: true,
    command: {
      commandId: item.id,
      type: type as OrderCommandType,
      tenantId: item.tenantId,
      orderId: item.orderId,
      deviceId: item.deviceId,
      clientSequence: item.clientSequence,
      clientTime: new Date().toISOString(),
      // A new order has no prior version, so a precondition would be unsatisfiable.
      expectedVersion: mapped === 'CreateOrder' ? undefined : item.expectedVersion,
      correlationId,
      payload,
    },
  };
};

export interface FlushOrderingOptions {
  /**
   * Maximum commands per order released in one pass. Defaults to 1: commands
   * for the same order each bump `orders.version`, so they must be applied one
   * at a time and in sequence. Raise it only for commands that are proven
   * independent of each other.
   */
  perOrderBudget?: number;
}

/** Why a command for one order is not being sent this pass. */
export type PosDeferReason =
  /** An earlier command for the same order has not settled yet. */
  | 'PREDECESSOR_UNRESOLVED'
  /** Per-order budget for this pass is used up. */
  | 'PER_ORDER_BUDGET';

export interface PosDeferredCommand {
  item: PosQueuedCommand;
  reason: PosDeferReason;
  /** Id of the command holding this one back, when there is one. */
  blockedBy?: string;
  detail: string;
}

export interface PosOrderChain {
  orderKey: string;
  tenantId: string;
  orderId: string;
  /**
   * Ordered commands for this order. The flusher walks the chain from the front
   * and stops at the first command that does not settle successfully, so a
   * dependent command can never overtake an unresolved predecessor.
   */
  items: PosQueuedCommand[];
}

export interface FlushPlan {
  /** Heads released for this pass, one per order, in safe dependency order. */
  runnable: PosQueuedCommand[];
  /** Commands held back, with the reason and the command holding them. */
  deferred: PosDeferredCommand[];
  /** Items that can never be sent and need operator attention. */
  blocked: Array<{ item: PosQueuedCommand; reason: PosFailureReason; detail: string }>;
  /** Per-order ordered chains for the flusher to walk. */
  chains: PosOrderChain[];
}

const orderKeyOf = (item: PosQueuedCommand): string => `${item.tenantId}::${item.orderId}`;

/**
 * Order the queue by dependency, not by arrival.
 *
 * Two rules, and the second is the one that used to be missing:
 *
 *  1. Within one order, commands run in `orderSequence` order.
 *  2. A command runs only when **every** earlier command for the same order has
 *     already settled. A predecessor that is still PENDING, in SYNCING in
 *     another tab, FAILED, or BLOCKED is *unresolved*, and anything queued
 *     behind it is held.
 *
 * Rule 2 is why a `MarkReady` queued behind a failed `AcceptOrder` does not go
 * out: the server would reject it as an invalid transition from PLACED, turning
 * one real problem into a cascade of misleading failures. Gating is per order,
 * so an unrelated order flushes normally.
 *
 * Ordering uses the *local* sequence, not wall clock, because a device may be
 * offline for hours and clocks are not trustworthy.
 */
export const planFlushOrder = (
  items: PosQueuedCommand[],
  options: FlushOrderingOptions = {}
): FlushPlan => {
  const perOrderBudget = Math.max(1, options.perOrderBudget ?? 1);
  const runnable: PosQueuedCommand[] = [];
  const deferred: PosDeferredCommand[] = [];
  const blocked: FlushPlan['blocked'] = [];
  const chains: PosOrderChain[] = [];

  const byOrder = new Map<string, PosQueuedCommand[]>();
  for (const item of items) {
    const key = orderKeyOf(item);
    const list = byOrder.get(key) ?? [];
    list.push(item);
    byOrder.set(key, list);
  }

  // Deterministic order across orders so a large tenant does not starve others.
  const orderKeys = [...byOrder.keys()].sort();
  for (const key of orderKeys) {
    const list = (byOrder.get(key) ?? []).slice().sort((a, b) => {
      if (a.orderSequence !== b.orderSequence) return a.orderSequence - b.orderSequence;
      if (a.clientSequence !== b.clientSequence) return a.clientSequence - b.clientSequence;
      return a.id.localeCompare(b.id);
    });

    const chain: PosOrderChain = {
      orderKey: key,
      tenantId: list[0]?.tenantId ?? '',
      orderId: list[0]?.orderId ?? '',
      items: [],
    };

    let released = 0;
    // `blocking` is the first predecessor that has not settled. Once set, every
    // later command for this order is deferred — the gate does not reopen until
    // the blocking command itself is resolved.
    let blocking: { id: string; state: PosQueueState | undefined } | null = null;

    for (const item of list) {
      const plan = planQueuedCommand(item);

      if (blocking) {
        deferred.push({
          item,
          reason: 'PREDECESSOR_UNRESOLVED',
          blockedBy: blocking.id,
          detail: `Held until '${blocking.id}' for this order is resolved. Sending it first could apply it against the wrong order state.`,
        });
        // Keep it in the chain so the flusher can pick it up once the gate opens.
        chain.items.push(item);
        continue;
      }

      if (!plan.ok) {
        blocked.push({ item, reason: plan.reason, detail: plan.detail });
        // The chain stops here. The blocked head is unresolved until an operator
        // resolves it, so nothing queued behind it may overtake it.
        blocking = { id: item.id, state: item.state ?? 'BLOCKED' };
        continue;
      }

      const state = item.state ?? 'PENDING';
      if (state !== 'PENDING') {
        // SYNCING elsewhere, or already FAILED/BLOCKED from a previous pass.
        deferred.push({
          item,
          reason: 'PREDECESSOR_UNRESOLVED',
          blockedBy: item.id,
          detail:
            state === 'SYNCING'
              ? 'Already in flight; another worker owns this command.'
              : `Waiting for '${item.id}' (${state}) to be resolved by staff.`,
        });
        blocking = { id: item.id, state };
        chain.items.push(item);
        continue;
      }

      if (released >= perOrderBudget) {
        deferred.push({
          item,
          reason: 'PER_ORDER_BUDGET',
          blockedBy: item.id,
          detail: 'Held for the next flush pass to keep commands for one order sequential.',
        });
        // Kept in the chain: the flusher walks it from the front and stops here,
        // which is exactly the gate we want.
        chain.items.push(item);
        continue;
      }

      runnable.push(item);
      chain.items.push(item);
      released += 1;
    }

    if (chain.items.length > 0) chains.push(chain);
  }

  return { runnable, deferred, blocked, chains };
};

/**
 * Classify an HTTP outcome from the command API.
 *
 * The distinction that matters for an offline device: an expired session must
 * pause the queue for re-authentication, it must not burn retries and it must
 * not be reported as a business failure.
 */
export const classifyCommandResponse = (status: number, body: unknown): {
  outcome: 'acknowledged' | 'retryable' | 'auth' | 'blocked';
  reason?: PosFailureReason;
  detail?: string;
  httpStatus: number;
} => {
  const errorBody = (body ?? {}) as {
    error?: { code?: string; message?: string };
  };
  const serverCode = errorBody.error?.code;
  const serverMessage = errorBody.error?.message;

  if (status >= 200 && status < 300) {
    return { outcome: 'acknowledged', httpStatus: status };
  }

  if (status === 401) {
    return {
      outcome: 'auth',
      reason: 'AUTH_REQUIRED',
      detail: serverMessage ?? 'Session expired. Sign in to resume syncing queued work.',
      httpStatus: status,
    };
  }

  if (status === 403) {
    return {
      outcome: 'blocked',
      reason: 'FORBIDDEN',
      detail: serverMessage ?? 'This account is no longer allowed to change this order.',
      httpStatus: status,
    };
  }

  if (status === 404) {
    return {
      outcome: 'blocked',
      reason: 'NOT_FOUND',
      detail: serverMessage ?? 'The server no longer has this order.',
      httpStatus: status,
    };
  }

  if (status === 409) {
    // A concurrency conflict is safe to retry: re-read and re-apply.
    if (serverCode === 'CONCURRENCY_CONFLICT') {
      return {
        outcome: 'retryable',
        reason: 'CONFLICT',
        detail: serverMessage ?? 'Order changed on another device. Retrying with fresh state.',
        httpStatus: status,
      };
    }
    return {
      outcome: 'blocked',
      reason: 'CONFLICT',
      detail: serverMessage ?? 'The server rejected this command as a conflict.',
      httpStatus: status,
    };
  }

  if (status === 400 || status === 422) {
    const invalid = serverCode === 'UNSUPPORTED_COMMAND';
    return {
      outcome: 'blocked',
      reason: invalid ? 'UNSUPPORTED' : 'INVALID',
      detail:
        serverMessage ??
        (invalid
          ? 'The server does not support this command.'
          : 'The server rejected this command as invalid.'),
      httpStatus: status,
    };
  }

  if (status === 429 || status >= 500) {
    return {
      outcome: 'retryable',
      reason: status === 429 ? 'SERVER' : 'SERVER',
      detail: serverMessage ?? `Server responded ${status}. Will retry.`,
      httpStatus: status,
    };
  }

  return {
    outcome: 'retryable',
    reason: 'SERVER',
    detail: `Unexpected response ${status}.`,
    httpStatus: status,
  };
};

export interface BackoffDecision {
  delayMs: number;
  exhausted: boolean;
}

export const MAX_AUTOMATIC_RETRIES = 8;
export const BASE_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 5 * 60_000;

/**
 * Exponential backoff with jitter, bounded. Full jitter in the upper half keeps
 * a fleet of POS terminals from retrying in lockstep after an outage.
 */
export const computeBackoffMs = (
  retryCount: number,
  options: { maxRetries?: number; random?: () => number } = {}
): BackoffDecision => {
  const maxRetries = options.maxRetries ?? MAX_AUTOMATIC_RETRIES;
  const random = options.random ?? Math.random;
  if (retryCount >= maxRetries) return { delayMs: 0, exhausted: true };
  const exponential = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** retryCount);
  return { delayMs: Math.round(exponential * (0.5 + 0.5 * random())), exhausted: false };
};

/** Queue depth / age summary for the POS status bar. */
export interface QueueHealth {
  pending: number;
  inFlight: number;
  blocked: number;
  oldestPendingAgeMs: number;
  offline: boolean;
  awaitingAuth: boolean;
}

export const summarizeQueue = (
  items: Array<{ createdAt: string; state: PosQueueState }>,
  nowMs: number,
  offline: boolean,
  awaitingAuth: boolean
): QueueHealth => {
  let pending = 0;
  let inFlight = 0;
  let blocked = 0;
  let oldestPendingAgeMs = 0;
  for (const item of items) {
    if (item.state === 'PENDING') {
      pending += 1;
      const age = nowMs - Date.parse(item.createdAt);
      if (Number.isFinite(age) && age > oldestPendingAgeMs) oldestPendingAgeMs = age;
    } else if (item.state === 'SYNCING') {
      inFlight += 1;
    } else if (item.state === 'FAILED' || item.state === 'BLOCKED') {
      blocked += 1;
    }
  }
  return { pending, inFlight, blocked, oldestPendingAgeMs, offline, awaitingAuth };
};