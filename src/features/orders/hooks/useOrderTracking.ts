import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMarketplaceApiClient } from '@/marketplace-api';
import { useAuth } from '@/shared/providers/AuthProvider';

export interface OrderTrackingConfig {
  maxPollIntervalMs?: number;
  minPollIntervalMs?: number;
  missedUpdateThresholdMs?: number;
  reconnectTimeoutMs?: number;
  stopOnTerminalState?: boolean;
}

export function useOrderTracking(
  orderId: string | undefined
) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['orders', 'detail', orderId],
    enabled: !!orderId && isAuthenticated,
    queryFn: async () => {
      if (!orderId) throw new Error('Order ID required');
      const order = await getMarketplaceApiClient().getOrder(orderId);
      return order;
    },
    staleTime: 5_000,
    refetchInterval: (data) => {
      if (!data) return 5_000;
      const status = String((data as unknown as Record<string, unknown>).status ?? '').toUpperCase();
      if (['COMPLETED', 'CANCELLED'].includes(status)) {
        return 30_000;
      }
      return 5_000;
    },
    retry: (failureCount) => failureCount < 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
    gcTime: 1000 * 60 * 10,
  });

  const refreshOrder = () => {
    queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] });
  };

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isSuccess: query.isSuccess,
    refetch: query.refetch,
    refreshOrder,
    isTerminalState: (data: Record<string, unknown>) => {
      const status = String(data.status ?? '').toUpperCase();
      return ['COMPLETED', 'CANCELLED'].includes(status);
    },
    isStale: false,
    lastFetchedAt: 0,
    currentVersion: 0,
    forceRefresh: () => { queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] }); },
  };
}

export { ordersQueryKeys } from './ordersQueryKeys';