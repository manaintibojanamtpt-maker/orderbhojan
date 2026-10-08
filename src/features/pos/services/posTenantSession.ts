/**
 * Resolves which tenant this terminal may act on, and refuses to guess.
 *
 * What replaced the hardcoded constant
 * ------------------------------------
 * The POS shell used to bind itself to one tenant id written into the source.
 * Two things were wrong with that. It ignored who was signed in, so any
 * authenticated member of any restaurant would be looking at, and able to write
 * into, one specific restaurant's data. And because it was a constant, changing
 * tenants meant editing code.
 *
 * The rules this module enforces
 * ------------------------------
 *  - No authentication, no tenant. A caller without a verified session gets
 *    `locked_out`, never a default.
 *  - No network, no tenant either. When the authorized list cannot be fetched,
 *    the terminal keeps whatever it already had and refuses to *switch*. A
 *    queued offline order must not be stranded because a wifi blip hid the
 *    picker — but a new selection must never be made blind.
 *  - Switching re-verifies. A tenant is only bound after the server confirms
 *    the caller belongs to it, so a tampered or stale cached id cannot be used
 *    to select a restaurant.
 *  - Only tenants the server listed may be selected. The list is the authority;
 *    this module holds no hardcoded id to fall back on.
 */

import { getFirebaseIdToken } from '@/firebase/init';

export interface AuthorizedPosTenant {
  tenantId: string;
  role: string;
  name: string | null;
}

export type PosTenantState =
  | { status: 'loading' }
  | { status: 'locked_out'; reason: 'unauthenticated' | 'no_tenants' | 'error'; message: string }
  | {
      status: 'ready';
      tenants: AuthorizedPosTenant[];
      activeTenantId: string;
      activeRole: string;
    };

const TENANTS_ENDPOINT = '/api/v1/pos/tenants';
const AUTHORIZED_ENDPOINT = (tenantId: string) =>
  `/api/v1/pos/tenants/${encodeURIComponent(tenantId)}/authorized`;

/**
 * Remember the last authorized tenant per account.
 *
 * This is a convenience, not an authority: a remembered id is re-verified
 * against the server before it is bound. Storing it per uid means signing in on
 * a shared till as a different person does not inherit the previous person's
 * restaurant.
 */
const STORAGE_KEY = 'bhojan_pos_active_tenant';

const readRememberedTenant = (uid: string): string | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const stored = parsed?.[uid];
    return typeof stored === 'string' && stored.trim() ? stored.trim() : null;
  } catch {
    return null;
  }
};

const rememberTenant = (uid: string, tenantId: string): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (!parsed || typeof parsed !== 'object') return;
    parsed[uid] = tenantId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // A storage failure only costs the convenience of remembering, never access.
  }
};

export interface PosTenantSessionDeps {
  /** Verified ID token for the signed-in account, or null when signed out. */
  getToken: () => Promise<string | null>;
  /** Performs the authorized request. Injected so tests can drive it directly. */
  request: (url: string, init: RequestInit) => Promise<Response | null>;
}

const defaultDeps: PosTenantSessionDeps = {
  getToken: () => getFirebaseIdToken(),
  request: async (url, init) => {
    try {
      return await fetch(url, init);
    } catch {
      return null;
    }
  },
};

export interface LoadPosTenantsResult {
  status: 'ready' | 'locked_out';
  uid?: string;
  tenants?: AuthorizedPosTenant[];
  /** Present when locked out, so the UI can say something specific. */
  reason?: 'unauthenticated' | 'no_tenants' | 'error';
  message?: string;
  /** The tenant to bind, or null when there is nothing to bind. */
  tenantId: string | null;
  role: string | null;
}

const fetchJson = async <T>(
  deps: PosTenantSessionDeps,
  url: string,
  init: RequestInit
): Promise<T | null> => {
  const token = await deps.getToken();
  if (!token) return null;
  const response = await deps.request(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response || !response.ok) return null;
  return (await response.json().catch(() => null)) as T | null;
};

/**
 * Load the authorized tenant list and choose which one to bind.
 *
 * Returns `tenantId: null` in every locked-out case. Callers must not substitute
 * a default in that case; a POS with no tenant is inert, which is the point.
 */
export const loadAuthorizedPosTenantsWith = async (
  deps: PosTenantSessionDeps = defaultDeps
): Promise<LoadPosTenantsResult> => {
  let body: {
    success?: boolean;
    uid?: string;
    tenants?: Array<{ tenantId?: string; role?: string; name?: string | null }>;
  } | null;

  try {
    body = await fetchJson<typeof body>(deps, TENANTS_ENDPOINT, { method: 'GET' });
  } catch {
    return {
      status: 'locked_out',
      reason: 'error',
      message: 'Could not reach the server to confirm which restaurant this terminal may use.',
      tenantId: null,
      role: null,
    };
  }

  if (!body?.success) {
    return {
      status: 'locked_out',
      reason: 'unauthenticated',
      message: 'Sign in to use the POS.',
      tenantId: null,
      role: null,
    };
  }

  const uid = typeof body.uid === 'string' ? body.uid : '';
  const tenants: AuthorizedPosTenant[] = (body.tenants ?? [])
    .map((entry) => ({
      tenantId: String(entry.tenantId ?? '').trim(),
      role: String(entry.role ?? '').trim().toLowerCase(),
      name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : null,
    }))
    // Defensive: a malformed entry must not become an empty tenant id.
    .filter((entry) => entry.tenantId.length > 0 && entry.role.length > 0);

  if (tenants.length === 0) {
    return {
      status: 'locked_out',
      reason: 'no_tenants',
      message:
        'This account is not a member of any restaurant that can run a POS. Ask an owner to assign you a role.',
      tenantId: null,
      role: null,
    };
  }

  // Prefer the remembered tenant, but only if the server still authorizes it.
  const remembered = uid ? readRememberedTenant(uid) : null;
  const preferred = tenants.find((entry) => entry.tenantId === remembered) ?? tenants[0];

  return {
    status: 'ready',
    uid,
    tenants,
    tenantId: preferred?.tenantId ?? null,
    role: preferred?.role ?? null,
  };
};

export const loadAuthorizedPosTenants = (): Promise<LoadPosTenantsResult> =>
  loadAuthorizedPosTenantsWith(defaultDeps);

/**
 * Confirm a specific tenant may be bound before switching to it.
 *
 * The caller passes a tenant that appeared in `loadAuthorizedPosTenants`. This
 * re-checks it, so a tenant id that was cached, tampered with, or left over from
 * a previous sign-in cannot be bound on trust. Returns false rather than throwing
 * on any failure: an unverified switch is a refusal, not an error to retry.
 */
export const confirmTenantAuthorizedWith = async (
  deps: PosTenantSessionDeps,
  tenantId: string
): Promise<boolean> => {
  const trimmed = tenantId.trim();
  if (!trimmed) return false;
  try {
    const body = await fetchJson<{ authorized?: boolean }>(
      deps,
      AUTHORIZED_ENDPOINT(trimmed),
      { method: 'GET' }
    );
    return body?.authorized === true;
  } catch {
    return false;
  }
};

export const confirmTenantAuthorized = (tenantId: string): Promise<boolean> =>
  confirmTenantAuthorizedWith(defaultDeps, tenantId);

/** Persist the active tenant for this account. Call only after it is confirmed. */
export const rememberActiveTenant = (uid: string, tenantId: string): void => {
  if (!uid || !tenantId) return;
  rememberTenant(uid, tenantId);
};

/** Exposed for tests: the memory used by {@link readRememberedTenant}. */
export const __rememberedTenantStore = {
  read: readRememberedTenant,
  write: rememberTenant,
};