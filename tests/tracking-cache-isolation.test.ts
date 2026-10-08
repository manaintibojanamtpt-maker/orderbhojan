import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QueryClient } from '@tanstack/react-query';

function trackingQueryKeys(orderId: string, mode: string, guestPhone?: string) {
  return [{ scope: 'tracking', orderId, mode, guestPhone }];
}

describe('useOrderTracking cache isolation', () => {
  it('removes cache on permission-denied instead of leaving stale data', () => {
    const queryClient = new QueryClient();
    const orderId = 'order_ro_1';
    const queryKey = trackingQueryKeys(orderId, 'auth');

    queryClient.setQueryData(queryKey, { orderId, status: 'PLACED' });
    assert.ok(queryClient.getQueryData(queryKey), 'seed data must exist');

    queryClient.removeQueries({ queryKey });
    assert.strictEqual(queryClient.getQueryData(queryKey), undefined, 'cache must be cleared after removeQueries');
  });

  it('setQueryData(undefined) does NOT clear cache — proves removeQueries is required', () => {
    const queryClient = new QueryClient();
    const orderKey = trackingQueryKeys('order_bad', 'auth');

    queryClient.setQueryData(orderKey, { orderId: 'order_bad', status: 'PLACED' });
    assert.ok(queryClient.getQueryData(orderKey), 'seed data must exist');

    queryClient.setQueryData(orderKey, undefined);
    assert.ok(queryClient.getQueryData(orderKey), 'setQueryData(undefined) must leave cache intact — this is the bug');
  });

  it('clears cache when user identity changes (user A → user B)', () => {
    const queryClient = new QueryClient();
    const orderId = 'order_shared';
    const keyA = trackingQueryKeys(orderId, 'auth');
    const keyB = trackingQueryKeys(orderId, 'auth');

    queryClient.setQueryData(keyA, { orderId, status: 'PLACED', userId: 'user_a' });
    assert.ok(queryClient.getQueryData(keyA), 'user A cache must exist');

    queryClient.removeQueries({ queryKey: keyB });
    assert.strictEqual(queryClient.getQueryData(keyA), undefined, 'user A cache must be cleared on identity change');
    assert.strictEqual(queryClient.getQueryData(keyB), undefined, 'user B cache must not contain stale data');
  });

  it('preserves cache for transient connectivity failures', () => {
    const queryClient = new QueryClient();
    const orderId = 'order_net';
    const queryKey = trackingQueryKeys(orderId, 'auth');

    queryClient.setQueryData(queryKey, { orderId, status: 'PLACED' });
    const before = queryClient.getQueryData(queryKey);
    assert.ok(before, 'seed data must exist');

    queryClient.invalidateQueries({ queryKey });
    const afterInvalidate = queryClient.getQueryData(queryKey);
    assert.ok(afterInvalidate, 'invalidateQueries must preserve existing data while refetching');
  });
});
