/**
 * Supervisor authorization for sensitive POS actions (reopening a closed
 * business day, resolving an unverified pricing review).
 *
 * Authorization is delegated to the server. This module holds no credential and
 * compares no hardcoded PIN.
 *
 * The contract has two halves and the client must respect both. The server
 * returns a *grant* — bound to the signed-in actor, this tenant, and the one
 * operation it was issued for — not a boolean. The grant is short lived and
 * single use, so it is returned to the caller to be spent immediately and is
 * never cached: a terminal that kept one would let a supervisor who walked away
 * keep authorizing approvals.
 *
 * Every failure path returns null. An unreachable endpoint, an expired session,
 * a locked-out tenant and a wrong code are all the same thing to the caller: the
 * action does not proceed.
 */

import { getFirebaseIdToken } from '@/firebase/init';

/** Operations the server will issue a grant for. Kept in step with the server. */
export const SUPERVISOR_OPERATIONS = [
  'REOPEN_BUSINESS_DAY',
  'RESOLVE_PRICING_REVIEW',
] as const;

export type SupervisorOperation = (typeof SUPERVISOR_OPERATIONS)[number];

export interface SupervisorGrant {
  token: string;
  operation: SupervisorOperation;
  tenantId: string;
  actorUid: string;
  /** ISO timestamp. */
  expiresAt: string;
}

export interface VerifiedSupervisor {
  verifiedBy: string;
  method: 'supervisor-pin' | 'admin-session';
  restaurantId: string;
  /** Spend this against the authorized action; it is single use. */
  grant: SupervisorGrant;
}

/**
 * Ask the server to verify a staff-entered supervisor code.
 *
 * Requires an authenticated session: the server derives the actor from the ID
 * token and refuses anyone who is not a member of `restaurantId`, so this
 * cannot be used to obtain an approval from outside the tenant.
 */
export const verifySupervisorCode = async (
  restaurantId: string,
  code: string,
  operation: SupervisorOperation = 'REOPEN_BUSINESS_DAY'
): Promise<VerifiedSupervisor | null> => {
  const trimmed = code.trim();
  if (!trimmed) return null;
  if (!restaurantId) return null;

  try {
    const token = await getFirebaseIdToken();
    if (!token) return null;

    const response = await fetch(
      `/api/v1/tenants/${encodeURIComponent(restaurantId)}/pos/verify-supervisor`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: trimmed, operation }),
      }
    );
    if (!response.ok) return null;

    const body = (await response.json().catch(() => ({}))) as {
      verified?: boolean;
      supervisorId?: string;
      grant?: SupervisorGrant;
    };
    if (body.verified !== true) return null;

    // A "verified" response without a usable grant is treated as a failure.
    // The boolean alone is not authority; the grant is.
    const grant = body.grant;
    if (
      !grant ||
      typeof grant.token !== 'string' ||
      !grant.token ||
      grant.tenantId !== restaurantId ||
      grant.operation !== operation
    ) {
      return null;
    }

    return {
      verifiedBy: body.supervisorId ?? grant.actorUid,
      method: 'supervisor-pin',
      restaurantId,
      grant,
    };
  } catch {
    // Fail closed: an unreachable authorization service must not unlock the action.
    return null;
  }
};

/**
 * Spend a grant on the operation it was issued for.
 *
 * The grant is bound to actor, tenant and operation, so this can only succeed
 * for the action the supervisor actually approved. A false result means the
 * approval is spent, expired, or was never valid — and the action must not
 * proceed on the strength of a grant the server would not honour anyway.
 */
export const redeemSupervisorGrant = async (
  restaurantId: string,
  grant: SupervisorGrant
): Promise<boolean> => {
  try {
    const token = await getFirebaseIdToken();
    if (!token) return false;

    const response = await fetch(
      `/api/v1/tenants/${encodeURIComponent(restaurantId)}/pos/supervisor-grants/redeem`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ token: grant.token, operation: grant.operation }),
      }
    );
    if (!response.ok) return false;
    const body = (await response.json().catch(() => ({}))) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
};