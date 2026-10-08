import { useCallback, useEffect, useRef, useState } from 'react';
import { getMarketplaceApiClient } from '@/marketplace-api';
import { getFirebaseAuth } from '@/firebase';
import { withRequestDeadline, waitForSignal } from '@/lib/requestDeadline';
import {
  beginCheckoutAttempt, readCheckoutAttempt, recordCheckoutOrder, withCheckoutLock,
  finishCheckoutAttempt, type CheckoutRecovery, type CheckoutAttemptReference,
} from '../infrastructure/checkoutAttempt';

export function useCheckoutAttempt(uid: string | undefined) {
  const [pending, setPending] = useState<CheckoutAttemptReference | null>(null);
  const [recovery, setRecovery] = useState<CheckoutRecovery | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [owner, setOwner] = useState(uid);
  const controller = useRef<AbortController | null>(null);
  const currentUid = useRef(uid);
  useEffect(() => { currentUid.current = uid; }, [uid]);

  const check = useCallback(async () => {
    if (!uid || controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setChecking(true);
    try {
      const saved = readCheckoutAttempt(uid);
      setPending(saved);
      if (!saved) return;
      const status = await getMarketplaceApiClient().recoverCheckoutAttempt(saved.id, abort.signal);
      if (!['pending', 'confirmed', 'failed', 'expired', 'ambiguous'].includes(status.state)) throw new Error('Order status is unknown');
      if (!abort.signal.aborted && currentUid.current === uid) { setRecovery(status); setMessage(null); }
    } catch (error) {
      if (!abort.signal.aborted && currentUid.current === uid) {
        setRecovery({ state: 'ambiguous' });
        setMessage(error instanceof Error ? error.message : 'Order status is unavailable.');
      }
    } finally {
      if (controller.current === abort) { controller.current = null; setChecking(false); }
    }
  }, [uid]);

  useEffect(() => {
    setOwner(uid);
    setPending(null); setRecovery(null); setMessage(null);
    void check();
    const resume = () => { if (document.visibilityState === 'visible') void check(); };
    const changed = () => { void check(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('storage', changed);
    return () => {
      controller.current?.abort(); controller.current = null;
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('storage', changed);
    };
  }, [check]);

  const place = useCallback(async (payload: Record<string, unknown>, amount: number, quoteUpdatedAt: number) => {
    if (!uid) throw new Error('Sign in before ordering');
    return withCheckoutLock(uid, async () => {
      // Recheck after waiting for a different tab, before persisting or sending anything.
      if (getFirebaseAuth()?.currentUser?.uid !== uid) throw new Error('Account changed. Sign in again.');
      const capability = await getMarketplaceApiClient().checkoutCapabilities();
      if (capability.contract !== 'customer-checkout-v1') throw new Error('Safe checkout is not available on this server yet. Please try later.');
      if (getFirebaseAuth()?.currentUser?.uid !== uid) throw new Error('Account changed. Sign in again.');
      const attempt = await beginCheckoutAttempt(uid, payload, amount, new Date(quoteUpdatedAt + 5 * 60_000).toISOString());
      setPending(attempt); setRecovery(null);
      try {
        const result = await withRequestDeadline(30_000, undefined, async signal => {
          const user = getFirebaseAuth()?.currentUser;
          if (user?.uid !== uid) throw new Error('Account changed');
          const authToken = await waitForSignal(() => user.getIdToken(), signal);
          if (getFirebaseAuth()?.currentUser?.uid !== uid) throw new Error('Account changed');
          return getMarketplaceApiClient().checkoutPlace({ ...payload, clientAttemptId: attempt.id, expectedAmountPaise: amount, quoteExpiresAt: attempt.quoteExpiresAt }, { authToken, signal });
        });
        const id = result.orderId ?? result.draftId;
        if (id) recordCheckoutOrder(uid, attempt.id, id);
        if (getFirebaseAuth()?.currentUser?.uid !== uid) throw new Error('Account changed. The previous order is preserved for that account.');
        return result;
      } catch (error) {
        // Even timeout/404 is not proof of non-commit. Keep the reference for recovery.
        if (currentUid.current === uid) setRecovery({ state: 'ambiguous' });
        throw error;
      }
    });
  }, [uid]);

  const acknowledge = useCallback(() => {
    if (!uid || !pending || !recovery) return;
    finishCheckoutAttempt(uid, pending.id, recovery);
    setPending(null); setRecovery(null); setMessage(null);
  }, [uid, pending, recovery]);
  return { pending: owner === uid ? pending : null, recovery: owner === uid ? recovery : null, message: owner === uid ? message : null, checking, check, place, acknowledge };
}
