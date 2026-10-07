import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { getMarketplaceApiClient } from '@/marketplace-api';
import { useAuth } from '@/shared/providers/AuthProvider';
import { trackingQueryKeys } from './trackingQueryKeys';
import { normalizeTrackingStatus } from '../utils/trackingSteps';
import { getFirebaseFirestore } from '@/firebase/init';
import {
  collection,
  query as firestoreQuery,
  where,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

const TERMINAL_TRACKING_STATUSES = new Set(['DELIVERED', 'CANCELLED', 'REJECTED']);

function isTerminalTrackingStatus(status?: string): boolean {
  if (!status) return false;
  const normalized = normalizeTrackingStatus(status);
  return TERMINAL_TRACKING_STATUSES.has(normalized);
}

function readGuestTokenFromStorage(orderId: string): string | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = sessionStorage.getItem(`guest_tracking_${orderId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    if (parsed.expiresAt && Date.now() > Date.parse(parsed.expiresAt)) {
      sessionStorage.removeItem(`guest_tracking_${orderId}`);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export function useOrderTracking(orderId: string, guestPhone?: string) {
  const { sessionUser } = useAuth();
  const queryClient = useQueryClient();
  const guestMode = Boolean(guestPhone && guestPhone.replace(/\D/g, '').length >= 4);
  const authUid = sessionUser?.uid ?? null;

  const guestToken = readGuestTokenFromStorage(orderId);
  const wasAuthenticatedRef = useRef<string | null>(authUid);

  useEffect(() => {
    const wasUid = wasAuthenticatedRef.current;
    wasAuthenticatedRef.current = authUid;

    if (wasUid && wasUid !== authUid && orderId) {
      queryClient.removeQueries({
        queryKey: trackingQueryKeys.order(orderId, 'auth', guestPhone),
      });
    }
  }, [authUid, orderId, guestPhone, queryClient]);

  const query = useQuery({
    queryKey: trackingQueryKeys.order(orderId, guestMode ? 'guest' : 'auth', guestPhone),
    enabled: Boolean(orderId) && Boolean(authUid || guestMode),
    queryFn: async () => {
      if (!orderId) throw new Error('Order ID required');
      const client = getMarketplaceApiClient();
      return guestMode
        ? client.getGuestTracking(orderId, guestPhone!, guestToken ?? undefined)
        : client.getTracking(orderId);
    },
    refetchInterval: (query) =>
      isTerminalTrackingStatus(query.state.data?.status) ? false : 5_000,
    staleTime: 2_000,
  });

  useEffect(() => {
    if (!authUid || guestMode || !orderId) return;
    const db = getFirebaseFirestore();
    if (!db) return;

    const q = firestoreQuery(
      collection(db, 'orders'),
      where('__name__', '==', orderId)
    );
    let unsubscribe: Unsubscribe | null = null;
    try {
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (snapshot.docs.length > 0) {
            queryClient.invalidateQueries({
              queryKey: trackingQueryKeys.order(orderId, 'auth', guestPhone),
            });
          }
        },
        (error) => {
          if (error?.code === 'permission-denied') {
            queryClient.removeQueries({
              queryKey: trackingQueryKeys.order(orderId, 'auth', guestPhone),
            });
          }
          console.error('[useOrderTracking] Firestore listener error:', error);
        }
      );
    } catch (err) {
      console.error('[useOrderTracking] Failed to start Firestore listener:', err);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [authUid, guestMode, orderId, guestPhone, queryClient]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    isSuccess: query.isSuccess,
    refetch: query.refetch,
    isTerminalState: (data: Record<string, unknown>) => {
      const status = String(data.status ?? '').toUpperCase();
      return ['COMPLETED', 'CANCELLED'].includes(status);
    },
    isStale: false,
    lastFetchedAt: 0,
    currentVersion: 0,
    forceRefresh: () => {
      queryClient.invalidateQueries({
        queryKey: trackingQueryKeys.order(orderId, guestMode ? 'guest' : 'auth', guestPhone),
      });
    },
  };
}
