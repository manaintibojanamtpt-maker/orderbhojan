/**
 * Phase A — Durable POS sync lease.
 *
 * A POS terminal runs in a browser that may hold several tabs, and a tab can be
 * killed mid-request by an OS memory reclaim without any cleanup running. A
 * plain in-memory flag cannot survive that, and neither can `navigator.locks` on
 * its own — it says nothing about work that was already in flight when its holder
 * died.
 *
 * So the flush ownership record lives in Dexie, next to the queue it protects:
 *
 *  - **Durable** — a restarted tab reads the lease back and can take it over.
 *  - **Fenced** — every acquisition takes the next `fencingToken`. The token is
 *    stamped onto each command it claims, so a slow worker that wakes up after
 *    losing the lease can detect that its writes are stale instead of
 *    overwriting the new owner's state.
 *  - **Self-expiring** — an abandoned lease becomes takeable when `expiresAt`
 *    passes, so a crash cannot wedge the queue permanently.
 *
 * Pure module: no Dexie, no DOM, so the acquisition/renewal/fencing rules are
 * unit testable directly.
 */

/** Lease name. One flush owner per terminal, across all tenants. */
export const SYNC_LEASE_NAME = 'bhojanos_pos_sync';

/**
 * How long a lease stays valid without a renewal. Long enough to survive a slow
 * request, short enough that a crashed terminal is taken over promptly.
 */
export const DEFAULT_LEASE_MS = 30_000;

/** Renewal cadence: three chances per lease before it can expire. */
export const RENEW_INTERVAL_MS = 10_000;

export interface SyncLeaseSnapshot {
  /** Tab/worker identity that currently owns the lease. */
  ownerId?: string;
  /** Monotonic across every acquisition on this device. */
  fencingToken: number;
  /** Epoch ms after which the lease may be taken over. */
  expiresAt: number;
  acquiredAt?: number;
  renewedAt?: number;
  leaseMs?: number;
}

export interface SyncLeaseRecord extends SyncLeaseSnapshot {
  id: string;
  ownerId: string;
  fencingToken: number;
  expiresAt: number;
  acquiredAt: number;
  renewedAt: number;
  leaseMs: number;
}

export type LeaseAcquisition =
  /** Held free or expired: the caller now owns it at `token`. */
  | { acquired: true; token: number; takeover: boolean }
  /** A live lease belongs to somebody else; the caller must not flush. */
  | { acquired: false; reason: 'HELD_BY_OTHER'; token: number; ownerId: string; expiresAt: number };

/**
 * Decide whether `ownerId` may take the lease.
 *
 * A lease is takeable when it is unheld, already expired (crash takeover), or
 * already ours. Re-acquiring our own live lease is a no-op that keeps the token,
 * which is what makes `initialize()` idempotent across repeated mounts.
 */
export const evaluateLeaseAcquisition = (
  snapshot: SyncLeaseSnapshot | undefined,
  ownerId: string,
  nowMs: number
): LeaseAcquisition => {
  const currentToken = snapshot?.fencingToken ?? 0;
  const free = !snapshot || !snapshot.ownerId;
  const expired = typeof snapshot?.expiresAt === 'number' && snapshot.expiresAt <= nowMs;

  if (free || expired) {
    return {
      acquired: true,
      token: currentToken + 1,
      // "Takeover" means we are displacing a previous owner, which is the case an
      // operator needs to see in the audit trail.
      takeover: Boolean(snapshot?.ownerId),
    };
  }

  if (snapshot.ownerId === ownerId) {
    // Our own live lease. Keep the token so in-flight commands stay fenced to it.
    return { acquired: true, token: currentToken, takeover: false };
  }

  return {
    acquired: false,
    reason: 'HELD_BY_OTHER',
    token: currentToken,
    ownerId: snapshot.ownerId ?? 'unknown',
    expiresAt: snapshot.expiresAt,
  };
};

export type LeaseRenewal =
  | { renewed: true; expiresAt: number; token: number }
  | {
      renewed: false;
      /** `FENCED` means another worker took over and bumped the token. */
      reason: 'NOT_OWNER' | 'FENCED' | 'EXPIRED';
      token: number;
    };

/**
 * Decide whether `ownerId` may extend the lease it believes it holds.
 *
 * The token check is the important one: a worker that was paused (background tab
 * throttling, a long GC) must discover on renewal that it has been replaced, and
 * stop writing, rather than quietly reclaiming the lease it no longer owns.
 */
export const evaluateLeaseRenewal = (
  snapshot: SyncLeaseSnapshot | undefined,
  ownerId: string,
  token: number,
  nowMs: number,
  leaseMs = DEFAULT_LEASE_MS
): LeaseRenewal => {
  if (!snapshot || !snapshot.ownerId) {
    return { renewed: false, reason: 'NOT_OWNER', token: 0 };
  }
  if (snapshot.ownerId !== ownerId) {
    return { renewed: false, reason: 'NOT_OWNER', token: snapshot.fencingToken };
  }
  if (snapshot.fencingToken !== token) {
    return { renewed: false, reason: 'FENCED', token: snapshot.fencingToken };
  }
  if (snapshot.expiresAt <= nowMs) {
    // Expired without being renewed: another worker is entitled to take it, so
    // this worker must not extend it back to life.
    return { renewed: false, reason: 'EXPIRED', token: snapshot.fencingToken };
  }
  return { renewed: true, expiresAt: nowMs + leaseMs, token };
};

/**
 * Whether `ownerId`/`token` may still mutate shared queue state.
 *
 * Called after every await that could have been interleaved with a takeover —
 * chiefly the network response — so a late reply from a fenced worker is dropped
 * instead of overwriting the new owner's outcome.
 */
export const isLeaseFenceCurrent = (
  snapshot: SyncLeaseSnapshot | undefined,
  ownerId: string,
  token: number
): boolean =>
  Boolean(
    snapshot &&
      snapshot.ownerId === ownerId &&
      snapshot.fencingToken === token &&
      snapshot.expiresAt > 0
  );

/**
 * Whether an in-flight command may be recovered after a restart.
 *
 * `currentFence` is the highest token any worker has ever taken on this device.
 * A command claimed at a *lower* token belongs to a worker that is gone or has
 * been fenced, so it is safe to reset. A command at the current token may still
 * be in flight in another live tab, and resetting it would cause a double send.
 */
export const isCommandRecoverable = (
  commandFence: number | undefined,
  currentFence: number,
  nowMs: number,
  leaseExpiresAt?: number
): boolean => {
  if (typeof commandFence !== 'number') {
    // A pre-lease record: nothing can vouch for it, so it is recovered.
    return true;
  }
  if (commandFence < currentFence) return true;
  // Same fence, but the lease that authorised it has expired: its worker died.
  if (typeof leaseExpiresAt === 'number' && leaseExpiresAt <= nowMs) return true;
  return false;
};

/** Per-tab worker identity. Stable for the life of the tab, unique across tabs. */
export const createLeaseOwnerId = (
  random: () => number = Math.random,
  now: () => number = Date.now
): string => `pos_worker_${Math.floor(random() * 1e9).toString(36)}_${now().toString(36)}`;