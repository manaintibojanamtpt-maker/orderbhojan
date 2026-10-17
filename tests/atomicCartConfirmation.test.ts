import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  useCartStore,
  _resetAppliedProposalIdsForTesting,
  cartItemCount,
} from '../src/features/cart/store/cartStore';
import { applyConfirmedCartPlan } from '../src/features/cart/domain/applyConfirmedCartPlan';
import type { CartPlanValidationResult } from '../src/features/assistant/domain/cartPlanContract';

function createMockValidation(
  actions: readonly any[],
  conversationId = 'conv_123',
): CartPlanValidationResult {
  return {
    schemaVersion: '5.0',
    conversationId,
    channel: 'voice_ordering',
    status: 'validated',
    valid: true,
    clarificationQuestions: [],
    issues: [],
    proposedActions: actions.map((a) => ({
      ...a,
      requiresConfirmation: true,
      executable: false,
    })),
    executable: false,
    sideEffects: [],
    mutatedState: false,
  };
}

describe('Atomic Cart Confirmation and Stale-Plan Protection', () => {
  beforeEach(() => {
    _resetAppliedProposalIdsForTesting();
    useCartStore.setState({
      lines: [],
      restaurantSlug: 'swathi-tiffin',
      revision: 1,
      userSessionId: 'sess_alice',
      visible: false,
    });
  });

  it('atomically executes split-unit cart plan preserving exactly three total units', () => {
    // Initial state: 3 regular Masala Dosas
    useCartStore.setState({
      lines: [
        {
          lineId: 'dosa_plain',
          foodId: 'dosa_plain',
          name: 'Masala Dosa',
          price: 80,
          quantity: 3,
          restaurantSlug: 'swathi-tiffin',
          restaurantId: 'rest_swathi',
        },
      ],
      restaurantSlug: 'swathi-tiffin',
      revision: 1,
      userSessionId: 'sess_alice',
      visible: true,
    });

    assert.equal(cartItemCount(useCartStore.getState().lines), 3);

    // Split-unit proposal: update regular dosa to 2, add 1 dosa without onion
    const proposalId = 'prop_split_1';
    const validation = createMockValidation([
      {
        type: 'cart_update_plan',
        payload: { lineId: 'dosa_plain', quantity: 2 },
      },
      {
        type: 'cart_add_plan',
        payload: {
          foodId: 'dosa_plain',
          name: 'Masala Dosa',
          price: 80,
          quantity: 1,
          instructions: 'without onion',
        },
      },
    ]);

    const result = applyConfirmedCartPlan({
      userConfirmed: true,
      validation,
      deps: { commitAtomicBatchPlan: useCartStore.getState().commitAtomicBatchPlan },
      planContext: {
        proposalId,
        restaurantId: 'rest_swathi',
        restaurantSlug: 'swathi-tiffin',
        userSessionId: 'sess_alice',
        expectedCartRevision: 1,
        expiresAt: Date.now() + 60000,
      },
    });

    assert.equal(result.mutatedState, true);
    assert.equal(result.appliedCount, 2);

    const updatedLines = useCartStore.getState().lines;
    assert.equal(updatedLines.length, 2);
    assert.equal(cartItemCount(updatedLines), 3, 'Total units must remain exactly 3');

    const regular = updatedLines.find((l) => l.lineId === 'dosa_plain');
    const custom = updatedLines.find((l) => l.instructions === 'without onion');
    assert.equal(regular?.quantity, 2);
    assert.equal(custom?.quantity, 1);
    assert.equal(useCartStore.getState().revision, 2);
  });

  it('aborts atomically without modifying original cart if any action in the batch fails', () => {
    // Initial state: 3 regular Masala Dosas
    useCartStore.setState({
      lines: [
        {
          lineId: 'dosa_plain',
          foodId: 'dosa_plain',
          name: 'Masala Dosa',
          price: 80,
          quantity: 3,
          restaurantSlug: 'swathi-tiffin',
          restaurantId: 'rest_swathi',
        },
      ],
      restaurantSlug: 'swathi-tiffin',
      revision: 1,
      userSessionId: 'sess_alice',
      visible: true,
    });

    // Action 1 is valid, but Action 2 has invalid price (-1)
    const validation = createMockValidation([
      {
        type: 'cart_update_plan',
        payload: { lineId: 'dosa_plain', quantity: 2 },
      },
      {
        type: 'cart_add_plan',
        payload: {
          foodId: 'dosa_plain',
          name: 'Masala Dosa',
          price: -1, // Invalid!
          quantity: 1,
          instructions: 'without onion',
        },
      },
    ]);

    const result = applyConfirmedCartPlan({
      userConfirmed: true,
      validation,
      deps: { commitAtomicBatchPlan: useCartStore.getState().commitAtomicBatchPlan },
      planContext: {
        proposalId: 'prop_fail_midway',
        restaurantId: 'rest_swathi',
        expectedCartRevision: 1,
      },
    });

    assert.equal(result.mutatedState, false);
    assert.equal(result.appliedCount, 0);
    assert.equal(result.reason, 'VALIDATION_FAILED');

    // Cart must NOT have been partially updated to quantity 2!
    const lines = useCartStore.getState().lines;
    assert.equal(lines.length, 1);
    assert.equal(lines[0].quantity, 3, 'Original quantity 3 must be preserved');
    assert.equal(useCartStore.getState().revision, 1, 'Revision must remain unchanged');
  });

  it('rejects repeated confirmation of the same proposal (replay protection)', () => {
    useCartStore.setState({
      lines: [],
      restaurantSlug: 'swathi-tiffin',
      revision: 1,
      userSessionId: 'sess_alice',
      visible: true,
    });

    const validation = createMockValidation([
      {
        type: 'cart_add_plan',
        payload: { foodId: 'idli_1', name: 'Idli', price: 40, quantity: 2 },
      },
    ]);

    // First confirmation: success
    const res1 = applyConfirmedCartPlan({
      userConfirmed: true,
      validation,
      deps: { commitAtomicBatchPlan: useCartStore.getState().commitAtomicBatchPlan },
      planContext: {
        proposalId: 'prop_once_only',
        restaurantId: 'rest_swathi',
        expectedCartRevision: 1,
      },
    });
    assert.equal(res1.mutatedState, true);
    assert.equal(cartItemCount(useCartStore.getState().lines), 2);

    // Second confirmation with same proposal ID: rejected
    const res2 = applyConfirmedCartPlan({
      userConfirmed: true,
      validation,
      deps: { commitAtomicBatchPlan: useCartStore.getState().commitAtomicBatchPlan },
      planContext: {
        proposalId: 'prop_once_only',
        restaurantId: 'rest_swathi',
        expectedCartRevision: 2,
      },
    });
    assert.equal(res2.mutatedState, false);
    assert.equal(res2.reason, 'PROPOSAL_REPLAYED');
    assert.equal(cartItemCount(useCartStore.getState().lines), 2, 'Must not double-add');
  });

  it('rejects stale proposal when cart was modified in the meantime (revision mismatch)', () => {
    useCartStore.setState({
      lines: [
        {
          lineId: 'dosa_plain',
          foodId: 'dosa_plain',
          name: 'Masala Dosa',
          price: 80,
          quantity: 2,
          restaurantSlug: 'swathi-tiffin',
          restaurantId: 'rest_swathi',
        },
      ],
      restaurantSlug: 'swathi-tiffin',
      revision: 1,
      userSessionId: 'sess_alice',
      visible: true,
    });

    // In the meantime, user manually adds an item to cart in UI -> revision becomes 2
    useCartStore.getState().addItem({ foodId: 'vada_1', name: 'Medu Vada', price: 50 }, 1);
    assert.equal(useCartStore.getState().revision, 2);

    // Now an old proposal arrives that was created against revision 1
    const validation = createMockValidation([
      {
        type: 'cart_update_plan',
        payload: { lineId: 'dosa_plain', quantity: 3 },
      },
    ]);

    const result = applyConfirmedCartPlan({
      userConfirmed: true,
      validation,
      deps: { commitAtomicBatchPlan: useCartStore.getState().commitAtomicBatchPlan },
      planContext: {
        proposalId: 'prop_stale',
        restaurantId: 'rest_swathi',
        expectedCartRevision: 1, // Stale!
      },
    });

    assert.equal(result.mutatedState, false);
    assert.equal(result.reason, 'CART_REVISION_MISMATCH');
    // Existing cart contents preserved
    assert.equal(useCartStore.getState().lines.length, 2);
  });

  it('rejects proposal when restaurant does not match active cart restaurant', () => {
    useCartStore.setState({
      lines: [
        {
          lineId: 'biryani_1',
          foodId: 'biryani_1',
          name: 'Chicken Biryani',
          price: 250,
          quantity: 1,
          restaurantSlug: 'paradise',
          restaurantId: 'rest_paradise',
        },
      ],
      restaurantSlug: 'paradise',
      revision: 1,
      userSessionId: 'sess_alice',
      visible: true,
    });

    const validation = createMockValidation([
      {
        type: 'cart_add_plan',
        payload: { foodId: 'dosa_1', name: 'Dosa', price: 60, quantity: 1 },
      },
    ]);

    const result = applyConfirmedCartPlan({
      userConfirmed: true,
      validation,
      deps: { commitAtomicBatchPlan: useCartStore.getState().commitAtomicBatchPlan },
      planContext: {
        proposalId: 'prop_wrong_rest',
        restaurantId: 'rest_bawarchi', // Wrong restaurant!
        expectedCartRevision: 1,
      },
    });

    assert.equal(result.mutatedState, false);
    assert.equal(result.reason, 'RESTAURANT_MISMATCH');
    assert.equal(useCartStore.getState().lines[0].foodId, 'biryani_1');
  });

  it('rejects proposal when account or session identity has changed', () => {
    useCartStore.setState({
      lines: [],
      restaurantSlug: 'swathi-tiffin',
      revision: 1,
      userSessionId: 'sess_alice',
      visible: false,
    });

    const validation = createMockValidation([
      {
        type: 'cart_add_plan',
        payload: { foodId: 'dosa_1', name: 'Dosa', price: 60, quantity: 1 },
      },
    ]);

    const result = applyConfirmedCartPlan({
      userConfirmed: true,
      validation,
      deps: { commitAtomicBatchPlan: useCartStore.getState().commitAtomicBatchPlan },
      planContext: {
        proposalId: 'prop_diff_user',
        restaurantId: 'rest_swathi',
        userSessionId: 'sess_bob', // Different user!
        expectedCartRevision: 1,
      },
    });

    assert.equal(result.mutatedState, false);
    assert.equal(result.reason, 'SESSION_MISMATCH');
    assert.equal(useCartStore.getState().lines.length, 0);
  });

  it('rejects proposal that has expired', () => {
    useCartStore.setState({
      lines: [],
      restaurantSlug: 'swathi-tiffin',
      revision: 1,
      userSessionId: 'sess_alice',
      visible: false,
    });

    const validation = createMockValidation([
      {
        type: 'cart_add_plan',
        payload: { foodId: 'dosa_1', name: 'Dosa', price: 60, quantity: 1 },
      },
    ]);

    const result = applyConfirmedCartPlan({
      userConfirmed: true,
      validation,
      deps: { commitAtomicBatchPlan: useCartStore.getState().commitAtomicBatchPlan },
      planContext: {
        proposalId: 'prop_expired',
        restaurantId: 'rest_swathi',
        expectedCartRevision: 1,
        expiresAt: Date.now() - 5000, // Expired 5 seconds ago
      },
    });

    assert.equal(result.mutatedState, false);
    assert.equal(result.reason, 'PROPOSAL_EXPIRED');
    assert.equal(useCartStore.getState().lines.length, 0);
  });

  it('preserves existing cart contents and other dishes across split-unit updates', () => {
    useCartStore.setState({
      lines: [
        {
          lineId: 'coffee_1',
          foodId: 'coffee_1',
          name: 'Filter Coffee',
          price: 30,
          quantity: 2,
          restaurantSlug: 'swathi-tiffin',
          restaurantId: 'rest_swathi',
        },
        {
          lineId: 'dosa_plain',
          foodId: 'dosa_plain',
          name: 'Masala Dosa',
          price: 80,
          quantity: 3,
          restaurantSlug: 'swathi-tiffin',
          restaurantId: 'rest_swathi',
        },
      ],
      restaurantSlug: 'swathi-tiffin',
      revision: 3,
      userSessionId: 'sess_alice',
      visible: true,
    });

    const validation = createMockValidation([
      {
        type: 'cart_update_plan',
        payload: { lineId: 'dosa_plain', quantity: 2 },
      },
      {
        type: 'cart_add_plan',
        payload: {
          foodId: 'dosa_plain',
          name: 'Masala Dosa',
          price: 80,
          quantity: 1,
          instructions: 'no onion',
        },
      },
    ]);

    const result = applyConfirmedCartPlan({
      userConfirmed: true,
      validation,
      deps: { commitAtomicBatchPlan: useCartStore.getState().commitAtomicBatchPlan },
      planContext: {
        proposalId: 'prop_preserve_other',
        restaurantId: 'rest_swathi',
        expectedCartRevision: 3,
      },
    });

    assert.equal(result.mutatedState, true);
    const lines = useCartStore.getState().lines;
    assert.equal(lines.length, 3);

    // Coffee preserved completely
    const coffee = lines.find((l) => l.lineId === 'coffee_1');
    assert.equal(coffee?.quantity, 2);

    // Dosas are split 2 + 1
    const regularDosa = lines.find((l) => l.lineId === 'dosa_plain');
    const customDosa = lines.find((l) => l.instructions === 'no onion');
    assert.equal(regularDosa?.quantity, 2);
    assert.equal(customDosa?.quantity, 1);
    assert.equal(cartItemCount(lines), 5, 'Total units: 2 coffees + 3 dosas = 5');
  });
});
