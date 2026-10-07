/**
 * Binds the POS shell to a tenant the signed-in user is actually authorized for.
 *
 * The contract this hook upholds:
 *
 *  - It never invents a tenant. Until the server has answered with at least one
 *    authorized membership, there is no active tenant and the shell renders
 *    nothing that can trade.
 *  - A failed refresh is not a switch. If the tenant list cannot be fetched, the
 *    currently bound tenant is kept, so an offline terminal keeps draining its
 *    queued orders; only the ability to *change* tenant is withdrawn.
 *  - Every switch is confirmed server-side before it takes effect, and the
 *    confirmation must name the same tenant and account that are now active.
 *
 * The hook holds no tenant id of its own. Everything it exposes came from
 * `/api/v1/pos/tenants`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  confirmTenantAuthorized,
  loadAuthorizedPosTenants,
  rememberActiveTenant,
  type AuthorizedPosTenant,
} from '../services/posTenantSession';

export type PosTenantStatus =
  | 'loading'
  | 'locked_out'
  | 'ready'
  | 'switching'
  | 'error';

export interface PosTenantSession {
  status: PosTenantStatus;
  /** Null whenever no tenant is authorized. Never a fallback value. */
  tenantId: string | null;
  tenantName: string;
  role: string | null;
  tenants: AuthorizedPosTenant[];
  /** Populated when locked out or when a refresh failed, for display. */
  message: string | null;
  /** Re-fetch the authorized list. Safe to call on demand. */
  refresh: () => Promise<void>;
  /**
   * Switch to another authorized tenant. Refuses unless the server confirms the
   * caller still belongs to it.
   */
  switchTenant: (tenantId: string) => Promise<boolean>;
}

export const useAuthorizedPosTenant = (): PosTenantSession => {
  const [status, setStatus] = useState<PosTenantStatus>('loading');
  const [tenants, setTenants] = useState<AuthorizedPosTenant[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uid, setUid] = useState<string>('');
  /**
   * Guards against a slow refresh resolving after a newer one and overwriting a
   * tenant that has since been switched. Without it, a request made while the
   * user was on tenant A could bind them back to A after they moved to B.
   */
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setStatus((previous) => (previous === 'ready' ? previous : 'loading'));

    const result = await loadAuthorizedPosTenants();
    if (!mounted.current || current !== generation.current) return;

    if (result.status === 'locked_out') {
      /**
       * Only a confirmed "no memberships" clears the bound tenant. A transient
       * failure keeps it, because a terminal that dropped its tenant mid-service
       * would strand queued orders with no way to retry the flush.
       */
      if (result.reason === 'error' && tenantId) {
        setStatus('ready');
        setMessage(result.message ?? null);
        return;
      }
      setStatus('locked_out');
      setTenants([]);
      setTenantId(null);
      setRole(null);
      setUid('');
      setMessage(result.message ?? 'Sign in to use the POS.');
      return;
    }

    const authorized = result.tenants ?? [];
    const chosen = authorized.find((entry) => entry.tenantId === result.tenantId);
    setTenants(authorized);
    setTenantId(result.tenantId);
    setRole(result.role);
    setUid(result.uid ?? '');
    setStatus('ready');
    setMessage(null);
    if (chosen) rememberActiveTenant(result.uid ?? '', chosen.tenantId);
  }, [tenantId]);

  useEffect(() => {
    void load();
    // Intentionally runs once on mount: `load` is re-created when the bound
    // tenant changes, and re-running on that would fight a deliberate switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchTenant = useCallback(
    async (nextTenantId: string): Promise<boolean> => {
      const trimmed = nextTenantId.trim();
      if (!trimmed) return false;
      // Only something the server listed is selectable.
      if (!tenants.some((entry) => entry.tenantId === trimmed)) return false;

      setStatus('switching');
      // Invalidate any in-flight load so it cannot rebind the old tenant.
      generation.current += 1;

      const confirmed = await confirmTenantAuthorized(trimmed);
      if (!mounted.current) return false;
      if (!confirmed) {
        setStatus('ready');
        setMessage('That restaurant is no longer available to this account.');
        return false;
      }

      const entry = tenants.find((item) => item.tenantId === trimmed);
      setTenantId(trimmed);
      setRole(entry?.role ?? null);
      setStatus('ready');
      setMessage(null);
      rememberActiveTenant(uid, trimmed);
      return true;
    },
    [tenants, uid]
  );

  const active = tenants.find((entry) => entry.tenantId === tenantId);
  // Fall back to the tenant id rather than a display name constant: an unnamed
  // tenant must still be identifiable, and the id is what the server uses.
  const tenantName = active?.name ?? active?.tenantId ?? '';

  return {
    status,
    tenantId,
    tenantName,
    role,
    tenants,
    message,
    refresh: load,
    switchTenant,
  };
};