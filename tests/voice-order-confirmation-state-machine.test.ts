import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OrderConfirmationStateMachine,
  isExplicitOrderConfirmation,
  isAmbiguousOrderConfirmation,
  generateVoiceOrderIdempotencyKey,
} from '../src/features/assistant/domain/orderConfirmationStateMachine';

describe('Order Confirmation State Machine & Financial Boundary Tests', () => {
  it('correctly classifies explicit vs ambiguous confirmations', () => {
    // Explicit confirmations in English, Telugu, Hindi
    assert.equal(isExplicitOrderConfirmation('Yes, place the order'), true);
    assert.equal(isExplicitOrderConfirmation('Place the order'), true);
    assert.equal(isExplicitOrderConfirmation('Confirm order'), true);
    assert.equal(isExplicitOrderConfirmation('place my order'), true);
    assert.equal(isExplicitOrderConfirmation('order confirm cheyyandi'), true);
    assert.equal(isExplicitOrderConfirmation('haan order kar do'), true);

    // Ambiguous confirmations must NOT be treated as explicit
    assert.equal(isExplicitOrderConfirmation('okay'), false);
    assert.equal(isExplicitOrderConfirmation('hmm'), false);
    assert.equal(isExplicitOrderConfirmation('maybe'), false);
    assert.equal(isExplicitOrderConfirmation('sounds good'), false);
    assert.equal(isExplicitOrderConfirmation('proceed'), false);
    assert.equal(isExplicitOrderConfirmation('cool'), false);

    // Detected as ambiguous
    assert.equal(isAmbiguousOrderConfirmation('okay'), true);
    assert.equal(isAmbiguousOrderConfirmation('hmm'), true);
    assert.equal(isAmbiguousOrderConfirmation('sounds good'), true);
    assert.equal(isAmbiguousOrderConfirmation('maybe'), true);
  });

  it('enforces transition pipeline: IDLE -> CART_READY -> CHECKOUT_REVIEW_ANNOUNCED -> AWAITING -> SUBMITTING -> PLACED', () => {
    const machine = new OrderConfirmationStateMachine();
    assert.equal(machine.state, 'IDLE');

    machine.setCartReady();
    assert.equal(machine.state, 'CART_READY');

    machine.announceCheckoutReview({
      restaurantId: 'rest_inti_123',
      restaurantName: 'Inti Bhojanam',
      lineCount: 2,
      totalAmount: 540,
      deliveryAddress: 'Flat 402, Green Meadows',
      itemsSummary: '2 Chicken Biryani, 3 Butter Naan',
      announcedAt: Date.now(),
    });
    assert.equal(machine.state, 'CHECKOUT_REVIEW_ANNOUNCED');
    assert.ok(machine.idempotencyKey?.startsWith('ob_voice_ord_rest_inti_'));

    machine.promptForConfirmation();
    assert.equal(machine.state, 'AWAITING_EXPLICIT_ORDER_CONFIRMATION');

    // Ambiguous input is rejected and preserves state
    const ambiguousResult = machine.handleSpokenConfirmation('hmm maybe');
    assert.equal(ambiguousResult.success, false);
    assert.equal(machine.state, 'AWAITING_EXPLICIT_ORDER_CONFIRMATION');
    assert.ok(ambiguousResult.replyPrompt?.includes("say 'Yes, place the order'"));

    // Explicit confirmation succeeds
    const confirmResult = machine.handleSpokenConfirmation('Yes, place the order');
    assert.equal(confirmResult.success, true);
    assert.equal(machine.state, 'SUBMITTING_ORDER');

    machine.markOrderPlaced();
    assert.equal(machine.state, 'ORDER_PLACED');
  });

  it('invalidates confirmation if cart total or items change during checkout review', () => {
    const machine = new OrderConfirmationStateMachine();
    machine.setCartReady();
    machine.announceCheckoutReview({
      restaurantId: 'rest_inti_123',
      restaurantName: 'Inti Bhojanam',
      lineCount: 2,
      totalAmount: 540,
      deliveryAddress: 'Flat 402, Green Meadows',
      itemsSummary: '2 Chicken Biryani, 3 Butter Naan',
      announcedAt: Date.now(),
    });
    machine.promptForConfirmation();

    // Price changed in background from 540 to 600
    const consistent = machine.validateCheckoutConsistency(600, 2);
    assert.equal(consistent, false);
    assert.equal(machine.state, 'CART_READY');
    assert.equal(machine.reviewSnapshot, null);
  });

  it('generates unique idempotency keys per order attempt', () => {
    const key1 = generateVoiceOrderIdempotencyKey('rest_1', 350, 1000);
    const key2 = generateVoiceOrderIdempotencyKey('rest_1', 350, 1000);
    assert.notEqual(key1, key2, 'Keys must be unique to avoid duplicate order collisions');
  });
});
