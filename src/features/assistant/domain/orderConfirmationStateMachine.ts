/**
 * Financial & Order Safety State Machine
 *
 * Implements strict financial boundaries for voice commerce:
 * IDLE → CART_READY → CHECKOUT_REVIEW_ANNOUNCED → AWAITING_EXPLICIT_ORDER_CONFIRMATION → SUBMITTING_ORDER → ORDER_PLACED
 *
 * Requirements:
 * - Hands-free interaction does NOT mean silent purchase authorization.
 * - Never transition to SUBMITTING_ORDER unless the assistant has already navigated
 *   to checkout, read out final items/quantities, saved delivery destination, and exact total (₹X),
 *   and is currently in AWAITING_EXPLICIT_ORDER_CONFIRMATION.
 * - Require explicit, unambiguous customer consent (e.g. "Yes, place the order", "Confirm order").
 * - Reject vague or ambiguous replies such as "okay", "hmm", "maybe", "sounds good".
 * - If an address, item, price, or availability changes, invalidate confirmation and require re-confirmation.
 * - Enforce idempotency keys so duplicate transcripts cannot create duplicate orders.
 */

export type OrderConfirmationState =
  | 'IDLE'
  | 'CART_READY'
  | 'CHECKOUT_REVIEW_ANNOUNCED'
  | 'AWAITING_EXPLICIT_ORDER_CONFIRMATION'
  | 'SUBMITTING_ORDER'
  | 'ORDER_PLACED';

export interface OrderReviewSnapshot {
  readonly restaurantId: string;
  readonly restaurantName: string;
  readonly lineCount: number;
  readonly totalAmount: number;
  readonly deliveryAddress: string;
  readonly itemsSummary: string;
  readonly announcedAt: number;
}

export interface VoiceOrderMachineSession {
  readonly state: OrderConfirmationState;
  readonly reviewSnapshot: OrderReviewSnapshot | null;
  readonly idempotencyKey: string | null;
  readonly lastError: string | null;
}

const EXPLICIT_CONFIRMATION_PATTERNS = [
  /^(yes|yeah|yep)?[,\s]*(please\s*)?(place|confirm|submit)\s*(the|my|this)?\s*order$/i,
  /^place\s*(the|my|this)?\s*order$/i,
  /^confirm\s*(the|my|this)?\s*order$/i,
  /^(yes|yeah)[\s,]+(confirm|place)\b/i,
  // Telugu vernacular
  /ఆర్డర్\s*(కన్ఫర్మ్|ప్లేస్)\s*చేయండి/i,
  /order\s*(confirm|place)\s*cheyyandi/i,
  /avunu\s*order\s*cheyyandi/i,
  // Hindi vernacular
  /ऑर्डर\s*(कन्फर्म|प्लेस)\s*करो/i,
  /order\s*(confirm|place)\s*karo/i,
  /haan\s*order\s*kar\s*do/i,
];

const AMBIGUOUS_PATTERNS = [
  /^(ok|okay|k|hmm|maybe|sounds good|cool|fine|alright|proceed|continue|chaltha|dekhenge|\s)+$/i,
  /^(i think so|probably|go ahead|yes|yep|yeah)$/i,
];

/**
 * Checks if utterance is an explicit spoken confirmation to place the order.
 */
export function isExplicitOrderConfirmation(utterance: string): boolean {
  const clean = utterance.trim().toLowerCase();
  if (!clean) return false;
  return EXPLICIT_CONFIRMATION_PATTERNS.some((pattern) => pattern.test(clean));
}

/**
 * Detects whether an utterance is ambiguous / non-committal.
 */
export function isAmbiguousOrderConfirmation(utterance: string): boolean {
  const clean = utterance.trim().toLowerCase();
  if (!clean) return false;
  // If it's already an explicit confirmation, it's not ambiguous
  if (isExplicitOrderConfirmation(clean)) return false;
  return AMBIGUOUS_PATTERNS.some((pattern) => pattern.test(clean));
}

export function generateVoiceOrderIdempotencyKey(
  restaurantId: string,
  totalAmount: number,
  timestamp: number = Date.now(),
): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `ob_voice_ord_${restaurantId.slice(0, 10)}_${totalAmount}_${timestamp}_${rand}`;
}

export class OrderConfirmationStateMachine {
  private _state: OrderConfirmationState = 'IDLE';
  private _reviewSnapshot: OrderReviewSnapshot | null = null;
  private _idempotencyKey: string | null = null;
  private _lastError: string | null = null;

  get state(): OrderConfirmationState {
    return this._state;
  }

  get reviewSnapshot(): OrderReviewSnapshot | null {
    return this._reviewSnapshot;
  }

  get idempotencyKey(): string | null {
    return this._idempotencyKey;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  /**
   * Signal that cart is ready with items.
   */
  setCartReady(): void {
    if (this._state === 'SUBMITTING_ORDER' || this._state === 'ORDER_PLACED') return;
    this._state = 'CART_READY';
  }

  /**
   * Transition to CHECKOUT_REVIEW_ANNOUNCED when assistant navigates to checkout
   * and reads back items, address, and total amount.
   */
  announceCheckoutReview(snapshot: OrderReviewSnapshot): void {
    if (snapshot.totalAmount <= 0 || snapshot.lineCount <= 0) {
      throw new Error('Cannot announce checkout review for empty or zero-total cart');
    }
    this._reviewSnapshot = Object.freeze({ ...snapshot });
    this._state = 'CHECKOUT_REVIEW_ANNOUNCED';
    this._idempotencyKey = generateVoiceOrderIdempotencyKey(
      snapshot.restaurantId,
      snapshot.totalAmount,
      snapshot.announcedAt,
    );
  }

  /**
   * Transition to AWAITING_EXPLICIT_ORDER_CONFIRMATION when assistant prompts
   * "Shall I place the order?"
   */
  promptForConfirmation(): void {
    if (this._state !== 'CHECKOUT_REVIEW_ANNOUNCED') {
      throw new Error(
        `Cannot prompt for confirmation from state ${this._state}. Must announce checkout review first.`,
      );
    }
    this._state = 'AWAITING_EXPLICIT_ORDER_CONFIRMATION';
  }

  /**
   * Validates if cart snapshot has changed since review was announced.
   * If changed, invalidates confirmation and reverts to CART_READY.
   */
  validateCheckoutConsistency(currentTotal: number, currentLineCount: number): boolean {
    if (!this._reviewSnapshot) return true;
    if (
      this._reviewSnapshot.totalAmount !== currentTotal ||
      this._reviewSnapshot.lineCount !== currentLineCount
    ) {
      this.invalidateConfirmation('Cart items or pricing changed during checkout review');
      return false;
    }
    return true;
  }

  /**
   * Invalidate confirmation if address, items, price, or availability change.
   */
  invalidateConfirmation(reason: string): void {
    this._state = 'CART_READY';
    this._reviewSnapshot = null;
    this._idempotencyKey = null;
    this._lastError = reason;
  }

  /**
   * Attempt transition to SUBMITTING_ORDER with customer spoken utterance.
   * Rejects ambiguous or non-explicit inputs.
   */
  handleSpokenConfirmation(utterance: string): {
    readonly success: boolean;
    readonly nextState: OrderConfirmationState;
    readonly replyPrompt?: string;
  } {
    if (this._state !== 'AWAITING_EXPLICIT_ORDER_CONFIRMATION') {
      return {
        success: false,
        nextState: this._state,
        replyPrompt: 'Your order is not currently awaiting confirmation.',
      };
    }

    if (isAmbiguousOrderConfirmation(utterance)) {
      return {
        success: false,
        nextState: 'AWAITING_EXPLICIT_ORDER_CONFIRMATION',
        replyPrompt:
          "To avoid an accidental order, please say 'Yes, place the order' to confirm, or 'Cancel' to review your cart.",
      };
    }

    if (!isExplicitOrderConfirmation(utterance)) {
      return {
        success: false,
        nextState: 'AWAITING_EXPLICIT_ORDER_CONFIRMATION',
        replyPrompt:
          "I didn't catch that. Say 'Yes, place the order' to confirm your order of ₹" +
          (this._reviewSnapshot?.totalAmount ?? 0) +
          ', or say cancel.',
      };
    }

    // Explicit confirmation verified!
    this._state = 'SUBMITTING_ORDER';
    return {
      success: true,
      nextState: 'SUBMITTING_ORDER',
    };
  }

  /**
   * Mark order placed successfully by backend.
   */
  markOrderPlaced(): void {
    if (this._state !== 'SUBMITTING_ORDER') {
      throw new Error(`Cannot mark order placed from state ${this._state}`);
    }
    this._state = 'ORDER_PLACED';
  }

  /**
   * Reset state machine to IDLE (e.g. user dismissed or placed order).
   */
  reset(): void {
    this._state = 'IDLE';
    this._reviewSnapshot = null;
    this._idempotencyKey = null;
    this._lastError = null;
  }
}
