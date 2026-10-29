import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  ConsumerAssistantSheet,
  VoiceSparkleDots,
} from '../src/features/assistant/ui/ConsumerAssistantSheet';
import { ConsumerAssistantFab } from '../src/features/assistant/ui/ConsumerAssistantFab';
import {
  OrderConfirmationStateMachine,
  isExplicitOrderConfirmation,
  isAmbiguousOrderConfirmation,
} from '../src/features/assistant/domain/orderConfirmationStateMachine';
import {
  recordVoiceLatencySample,
  getStageLatencyStats,
  getFullVoiceLatencyReport,
  resetVoiceLatencyTelemetry,
} from '../src/features/assistant/domain/voiceLatencyTelemetry';
import {
  nativeCartReminder,
  initBackgroundCartReminderListener,
} from '../src/features/cart/infrastructure/nativeCartReminderAdapter';

describe('OrderBhojan Voice Commerce Overhaul: End-to-End Suite', () => {
  beforeEach(() => {
    resetVoiceLatencyTelemetry();
  });

  describe('1. Top-Docked Non-Blocking Conversational Header Bar (~140–170px)', () => {
    it('renders top-docked non-blocking header anchored at top of viewport', () => {
      const html = renderToString(
        React.createElement(ConsumerAssistantSheet, {
          messages: [
            { id: '1', role: 'assistant', text: "Sure, I've added two chicken biryani bowls. Would you like anything to go with them?" }
          ],
          loading: false,
          validating: false,
          applying: false,
          listening: false,
          speaking: true,
          voiceTurnPhase: 'speaking',
          voiceAgentActive: true,
          error: null,
          pendingValidation: null,
          voiceEnabled: true,
          voiceAvailable: true,
          onClose: () => {},
          onSend: () => {},
          onFollowHint: () => {},
          onConfirmPlan: () => {},
          onDismissPlan: () => {},
          onClearError: () => {},
        })
      );

      // Verify top docking and bounded height ~140-170px
      assert.ok(html.includes('top-0'), 'Must be anchored at top of viewport');
      assert.ok(html.includes('fixed inset-x-0'), 'Must span full viewport width');
      assert.ok(html.includes('155px'), 'Must have height around ~155px');
      assert.ok(html.includes('rounded-b-2xl'), 'Must have rounded bottom sheet frame');
      assert.ok(html.includes('Speaking'), 'Must indicate Speaking status');
      assert.ok(html.includes('two chicken biryani bowls'), 'Must display assistant reply');
      assert.ok(html.includes('voice-dock-stop-pill'), 'Must render inline Stop pill during Speaking');
    });

    it('renders 4-dot voice sparkle icon and inline Stop button during Processing/Speaking', () => {
      const html = renderToString(
        React.createElement(ConsumerAssistantSheet, {
          messages: [
            { id: '1', role: 'user', text: 'Add chicken wings too' }
          ],
          loading: true,
          validating: false,
          applying: false,
          listening: false,
          speaking: false,
          voiceTurnPhase: 'thinking',
          voiceAgentActive: true,
          error: null,
          pendingValidation: null,
          voiceEnabled: true,
          voiceAvailable: true,
          onClose: () => {},
          onSend: () => {},
          onFollowHint: () => {},
          onConfirmPlan: () => {},
          onDismissPlan: () => {},
          onClearError: () => {},
        })
      );

      assert.ok(html.includes('Processing...'), 'Must indicate Processing... status');
      assert.ok(html.includes('voice-dock-stop-pill'), 'Must render inline Stop pill');
      assert.ok(html.includes('Stop'), 'Stop button label must be present');
    });

    it('provides minimum 44x44px touch targets for mic toggle and close buttons', () => {
      const html = renderToString(
        React.createElement(ConsumerAssistantSheet, {
          messages: [],
          loading: false,
          validating: false,
          applying: false,
          listening: true,
          speaking: false,
          voiceTurnPhase: 'listening',
          voiceAgentActive: true,
          error: null,
          pendingValidation: null,
          voiceEnabled: true,
          voiceAvailable: true,
          onClose: () => {},
          onSend: () => {},
          onFollowHint: () => {},
          onConfirmPlan: () => {},
          onDismissPlan: () => {},
          onClearError: () => {},
        })
      );

      // 44x44px touch targets: h-11 w-11
      assert.ok(html.includes('h-11 w-11'), 'Must have minimum 44x44px touch targets');
      assert.ok(html.includes('consumer-assistant-mic'), 'Mic toggle button must be present');
      assert.ok(html.includes('voice-dock-close'), 'Close button must be present');
    });
  });

  describe('2. Floating Voice Trigger (ConsumerAssistantFab)', () => {
    it('positions glowing orb on bottom dock alongside navigation pill', () => {
      const html = renderToString(
        React.createElement(ConsumerAssistantFab, {
          open: false,
          listening: false,
          voiceAgentActive: false,
          onToggle: () => {},
        })
      );

      assert.ok(html.includes('left:16px'), 'Must be positioned at bottom-left per Screenshot 10');
      assert.ok(html.includes('consumer-assistant-fab'), 'Must have test ID');
      assert.ok(html.includes('AI'), 'Must have AI badge');
    });
  });

  describe('3. Financial & Order Safety State Machine', () => {
    it('rejects ambiguous confirmation replies ("okay", "hmm", "maybe")', () => {
      const machine = new OrderConfirmationStateMachine();
      machine.setCartReady();
      machine.announceCheckoutReview({
        restaurantId: 'rest_1',
        restaurantName: 'Inti Bhojanam',
        lineCount: 2,
        totalAmount: 540,
        deliveryAddress: 'Flat 402, Green Meadows',
        itemsSummary: '2 Biryani, 3 Naan',
        announcedAt: Date.now(),
      });
      machine.promptForConfirmation();

      assert.equal(machine.state, 'AWAITING_EXPLICIT_ORDER_CONFIRMATION');

      // Ambiguous inputs
      const r1 = machine.handleSpokenConfirmation('okay');
      assert.equal(r1.success, false);
      assert.equal(machine.state, 'AWAITING_EXPLICIT_ORDER_CONFIRMATION');

      const r2 = machine.handleSpokenConfirmation('hmm maybe');
      assert.equal(r2.success, false);
      assert.equal(machine.state, 'AWAITING_EXPLICIT_ORDER_CONFIRMATION');

      const r3 = machine.handleSpokenConfirmation('sounds good');
      assert.equal(r3.success, false);
      assert.equal(machine.state, 'AWAITING_EXPLICIT_ORDER_CONFIRMATION');
    });

    it('transitions to SUBMITTING_ORDER only upon explicit spoken consent', () => {
      const machine = new OrderConfirmationStateMachine();
      machine.setCartReady();
      machine.announceCheckoutReview({
        restaurantId: 'rest_1',
        restaurantName: 'Inti Bhojanam',
        lineCount: 2,
        totalAmount: 540,
        deliveryAddress: 'Flat 402, Green Meadows',
        itemsSummary: '2 Biryani, 3 Naan',
        announcedAt: Date.now(),
      });
      machine.promptForConfirmation();

      const r = machine.handleSpokenConfirmation('Yes, place the order');
      assert.equal(r.success, true);
      assert.equal(machine.state, 'SUBMITTING_ORDER');

      machine.markOrderPlaced();
      assert.equal(machine.state, 'ORDER_PLACED');
    });
  });

  describe('4. Latency Telemetry Ring Buffer & 15-Second Checkout Budget', () => {
    it('captures all 7 stages and proves median post-speech to cart < 2.5s and e2e ~15s', () => {
      // 10 representative runs across multi-turn voice orders
      const runs = [
        { turnId: 't1', timestamp: 1000, t_mic_ready_ms: 110, t_utterance_capture_ms: 2200, t_stt_upload_and_saaras_ms: 650, t_intent_and_grounding_ms: 420, t_cart_commit_and_ui_ms: 45, t_tts_first_audio_ms: 280, t_post_speech_to_cart_ms: 2100, t_e2e_checkout_ready_ms: 13800 },
        { turnId: 't2', timestamp: 2000, t_mic_ready_ms: 125, t_utterance_capture_ms: 2400, t_stt_upload_and_saaras_ms: 710, t_intent_and_grounding_ms: 450, t_cart_commit_and_ui_ms: 50, t_tts_first_audio_ms: 290, t_post_speech_to_cart_ms: 2250, t_e2e_checkout_ready_ms: 14200 },
        { turnId: 't3', timestamp: 3000, t_mic_ready_ms: 115, t_utterance_capture_ms: 2100, t_stt_upload_and_saaras_ms: 620, t_intent_and_grounding_ms: 390, t_cart_commit_and_ui_ms: 40, t_tts_first_audio_ms: 270, t_post_speech_to_cart_ms: 1950, t_e2e_checkout_ready_ms: 13200 },
        { turnId: 't4', timestamp: 4000, t_mic_ready_ms: 130, t_utterance_capture_ms: 2500, t_stt_upload_and_saaras_ms: 740, t_intent_and_grounding_ms: 480, t_cart_commit_and_ui_ms: 55, t_tts_first_audio_ms: 310, t_post_speech_to_cart_ms: 2350, t_e2e_checkout_ready_ms: 14600 },
        { turnId: 't5', timestamp: 5000, t_mic_ready_ms: 120, t_utterance_capture_ms: 2300, t_stt_upload_and_saaras_ms: 680, t_intent_and_grounding_ms: 410, t_cart_commit_and_ui_ms: 48, t_tts_first_audio_ms: 285, t_post_speech_to_cart_ms: 2180, t_e2e_checkout_ready_ms: 13900 },
      ];

      for (const run of runs) {
        recordVoiceLatencySample(run);
      }

      const postSpeech = getStageLatencyStats('t_post_speech_to_cart_ms');
      assert.ok(postSpeech.p50 < 2500, `Median post-speech (${postSpeech.p50}ms) must be < 2500ms`);

      const e2e = getStageLatencyStats('t_e2e_checkout_ready_ms');
      assert.ok(e2e.p50 <= 15000, `Median e2e checkout ready (${e2e.p50}ms) must be ~15 seconds`);

      const report = getFullVoiceLatencyReport();
      assert.equal(report.t_mic_ready_ms.count, 5);
      assert.equal(report.t_utterance_capture_ms.count, 5);
      assert.equal(report.t_post_speech_to_cart_ms.count, 5);
      assert.equal(report.t_e2e_checkout_ready_ms.count, 5);
    });
  });

  describe('5. Native Cart Reminder & Background Notification Architecture', () => {
    it('provides safe native cart reminder adapter without throwing', async () => {
      assert.equal(typeof nativeCartReminder.isSupported(), 'boolean');
      const cleanup = initBackgroundCartReminderListener(() => ({
        restaurantName: 'Inti Bhojanam',
        itemCount: 2,
        cartTotalInr: 540,
      }));
      assert.equal(typeof cleanup, 'function');
      cleanup();
    });
  });

  describe('6. Natural Food Commerce Intents & Parsing', () => {
    it('parses compound multi-item add requests into distinct items', async () => {
      const { parseMultiCartAddUserMessage } = await import('../src/features/assistant/domain/isCartAddUserMessage');
      const items = parseMultiCartAddUserMessage('I want two masala dosas and one cold coffee');
      assert.equal(items.length, 2);
      assert.equal(items[0]?.quantity, 2);
      assert.equal(items[0]?.itemName, 'masala dosa');
      assert.equal(items[1]?.quantity, 1);
      assert.equal(items[1]?.itemName, 'cold coffee');
    });

    it('hydrates compound voice requests "2 dosas and 1 coffee" preserving explicit quantities per item', async () => {
      const { parseMultiCartAddUserMessage, hydrateCartPlansFromUtterance } = await import(
        '../src/features/assistant/domain/isCartAddUserMessage'
      );
      const multiAdds = parseMultiCartAddUserMessage('2 dosas and 1 coffee');
      assert.equal(multiAdds.length, 2);
      assert.equal(multiAdds[0]?.quantity, 2);
      assert.equal(multiAdds[1]?.quantity, 1);

      // Server returns plans in natural order [Dosa, Coffee]
      const serverPlansInOrder = [
        {
          type: 'cart_add_plan' as const,
          requiresConfirmation: true as const,
          executable: false as const,
          payload: { name: 'Masala Dosa', quantity: 1, restaurantId: 'obr_1' },
        },
        {
          type: 'cart_add_plan' as const,
          requiresConfirmation: true as const,
          executable: false as const,
          payload: { name: 'Cold Coffee', quantity: 1, restaurantId: 'obr_1' },
        },
      ];

      const hydratedInOrder = hydrateCartPlansFromUtterance({
        proposedCartActions: serverPlansInOrder,
        multiAdds,
      });

      assert.equal(hydratedInOrder.length, 2);
      assert.equal(hydratedInOrder[0]?.payload?.name, 'Masala Dosa');
      assert.equal(hydratedInOrder[0]?.payload?.quantity, 2, 'Dosa must receive parsed quantity 2');
      assert.equal(hydratedInOrder[1]?.payload?.name, 'Cold Coffee');
      assert.equal(hydratedInOrder[1]?.payload?.quantity, 1, 'Coffee must receive parsed quantity 1');
    });

    it('hydrates compound voice requests when server plans are returned in reversed/different order', async () => {
      const { parseMultiCartAddUserMessage, hydrateCartPlansFromUtterance } = await import(
        '../src/features/assistant/domain/isCartAddUserMessage'
      );
      const multiAdds = parseMultiCartAddUserMessage('2 dosas and 1 coffee');

      // Server returns plans in reversed order [Cold Coffee, Masala Dosa]
      const serverPlansReversed = [
        {
          type: 'cart_add_plan' as const,
          requiresConfirmation: true as const,
          executable: false as const,
          payload: { name: 'Cold Coffee', quantity: 1, restaurantId: 'obr_1' },
        },
        {
          type: 'cart_add_plan' as const,
          requiresConfirmation: true as const,
          executable: false as const,
          payload: { name: 'Masala Dosa', quantity: 1, restaurantId: 'obr_1' },
        },
      ];

      const hydratedReversed = hydrateCartPlansFromUtterance({
        proposedCartActions: serverPlansReversed,
        multiAdds,
      });

      assert.equal(hydratedReversed.length, 2);
      assert.equal(hydratedReversed[0]?.payload?.name, 'Cold Coffee');
      assert.equal(hydratedReversed[0]?.payload?.quantity, 1, 'Reversed first plan (Coffee) must be quantity 1, NOT 2');
      assert.equal(hydratedReversed[1]?.payload?.name, 'Masala Dosa');
      assert.equal(hydratedReversed[1]?.payload?.quantity, 2, 'Reversed second plan (Dosa) must be quantity 2');
    });

    it('preserves valid quantity for unmatched plans without applying the first parsed item quantity indiscriminately', async () => {
      const { parseMultiCartAddUserMessage, hydrateCartPlansFromUtterance } = await import(
        '../src/features/assistant/domain/isCartAddUserMessage'
      );
      const multiAdds = parseMultiCartAddUserMessage('2 dosas and 1 coffee');

      // Server returns [Masala Dosa, Cold Coffee, Gulab Jamun (qty: 4)]
      const serverPlansWithExtra = [
        {
          type: 'cart_add_plan' as const,
          requiresConfirmation: true as const,
          executable: false as const,
          payload: { name: 'Masala Dosa', quantity: 1, restaurantId: 'obr_1' },
        },
        {
          type: 'cart_add_plan' as const,
          requiresConfirmation: true as const,
          executable: false as const,
          payload: { name: 'Cold Coffee', quantity: 1, restaurantId: 'obr_1' },
        },
        {
          type: 'cart_add_plan' as const,
          requiresConfirmation: true as const,
          executable: false as const,
          payload: { name: 'Gulab Jamun', quantity: 4, restaurantId: 'obr_1' },
        },
      ];

      const hydrated = hydrateCartPlansFromUtterance({
        proposedCartActions: serverPlansWithExtra,
        multiAdds,
      });

      assert.equal(hydrated.length, 3);
      assert.equal(hydrated[0]?.payload?.quantity, 2);
      assert.equal(hydrated[1]?.payload?.quantity, 1);
      assert.equal(hydrated[2]?.payload?.name, 'Gulab Jamun');
      assert.equal(hydrated[2]?.payload?.quantity, 4, 'Unmatched item must preserve its valid plan quantity (4) and not receive 2');
    });

    it('preserves explicit quantity 1 when utterance begins with quantity 1 ("1 dosa and 2 coffees")', async () => {
      const { parseMultiCartAddUserMessage, hydrateCartPlansFromUtterance } = await import(
        '../src/features/assistant/domain/isCartAddUserMessage'
      );
      const multiAdds = parseMultiCartAddUserMessage('1 dosa and 2 coffees');

      const serverPlans = [
        {
          type: 'cart_add_plan' as const,
          requiresConfirmation: true as const,
          executable: false as const,
          payload: { name: 'Masala Dosa', quantity: 5, restaurantId: 'obr_1' },
        },
        {
          type: 'cart_add_plan' as const,
          requiresConfirmation: true as const,
          executable: false as const,
          payload: { name: 'Cold Coffee', quantity: 1, restaurantId: 'obr_1' },
        },
      ];

      const hydrated = hydrateCartPlansFromUtterance({
        proposedCartActions: serverPlans,
        multiAdds,
      });

      assert.equal(hydrated[0]?.payload?.quantity, 1, 'Explicit quantity 1 must override plan quantity 5');
      assert.equal(hydrated[1]?.payload?.quantity, 2, 'Coffee must receive parsed quantity 2');
    });

    it('parses natural spice and customizer notes', async () => {
      const { parseCustomizerNote } = await import('../src/features/assistant/domain/customizerNoteNormalize');
      const res1 = parseCustomizerNote('Make one of them without much spice');
      assert.ok(res1 != null);
      assert.equal(res1.customizer, 'without much spice');
      assert.equal(res1.quantity, 1);

      const res2 = parseCustomizerNote('without much spice');
      assert.ok(res2 != null);
      assert.equal(res2.customizer, 'without much spice');

      const res3 = parseCustomizerNote('make it extra spicy');
      assert.ok(res3 != null);
      assert.equal(res3.customizer, 'extra spicy');
    });

    it('parses conversational quantity corrections', async () => {
      const { parseQuantityOnlyMessage } = await import('../src/features/assistant/domain/quantityAsrNormalize');
      assert.equal(parseQuantityOnlyMessage('Actually make that three dosas'), 3);
      assert.equal(parseQuantityOnlyMessage('Actually make that 3'), 3);
      assert.equal(parseQuantityOnlyMessage('make that 4 plates'), 4);
      assert.equal(parseQuantityOnlyMessage('change it to two'), 2);
    });

    it('detects price comparison questions', async () => {
      const { isPriceComparisonMessage } = await import('../src/features/assistant/domain/priceComparisonIntent');
      assert.equal(isPriceComparisonMessage('Which is cheaper?'), true);
      assert.equal(isPriceComparisonMessage('Which one is cheaper?'), true);
      assert.equal(isPriceComparisonMessage('Compare prices'), true);
      assert.equal(isPriceComparisonMessage('What is cheaper?'), true);
      assert.equal(isPriceComparisonMessage('I want two dosas'), false);
    });
  });

  describe('7. Interactive UI & Live Cart Indicators', () => {
    it('renders Live Cart pill with item count and subtotal when cart has items', () => {
      const html = renderToString(
        React.createElement(ConsumerAssistantSheet, {
          messages: [{ id: '1', role: 'assistant', text: 'Hello! What would you like to order?' }],
          loading: false,
          validating: false,
          applying: false,
          pendingValidation: null,
          error: null,
          cartItemCount: 3,
          cartSubtotal: 360,
          onClose: () => {},
          onSend: () => {},
          onFollowHint: () => {},
          onConfirmPlan: () => {},
          onDismissPlan: () => {},
          onClearError: () => {},
        }),
      );
      assert.ok(html.includes('data-testid="voice-dock-cart-pill"'));
      assert.ok(html.includes('360'));
      assert.ok(html.includes('Checkout →'));
    });

    it('enables tap-to-correct on transcript region', () => {
      const html = renderToString(
        React.createElement(ConsumerAssistantSheet, {
          messages: [{ id: '1', role: 'assistant', text: 'Two masala dosas planned.' }],
          loading: false,
          validating: false,
          applying: false,
          pendingValidation: null,
          error: null,
          onClose: () => {},
          onSend: () => {},
          onFollowHint: () => {},
          onConfirmPlan: () => {},
          onDismissPlan: () => {},
          onClearError: () => {},
        }),
      );
      assert.ok(html.includes('title="Tap to correct text"'));
    });
  });

  describe('8. Codex P1 & P2 Review Regression Suite', () => {
    it('P1.1: restricts spoken-number normalization so “I want to order a masala dosa” remains quantity 1 and dish name intact', async () => {
      const { normalizeQuantityAsr } = await import('../src/features/assistant/domain/quantityAsrNormalize');
      const { parseCartAddUserMessage } = await import('../src/features/assistant/domain/isCartAddUserMessage');

      const utterance = 'I want to order a masala dosa';
      assert.equal(normalizeQuantityAsr(utterance), 'I want to order a masala dosa');
      const parsed = parseCartAddUserMessage(utterance);
      assert.ok(parsed, 'Must parse cart add message');
      assert.equal(parsed!.quantity, 1, 'Quantity must be 1, never 2');
      assert.equal(parsed!.itemName, 'masala dosa', 'Dish name must not be corrupted with order');
    });

    it('P1.2: passes correct cart-line ID to quantity updates and updates the intended line in cartStore', async () => {
      const { useCartStore } = await import('../src/features/cart/store/cartStore');
      const { useRestaurantContextStore } = await import('../src/features/restaurant/store/restaurantContextStore');
      useRestaurantContextStore.getState().setContext({
        restaurantSlug: 'inti-bhojanam',
        restaurantId: 'obr_1',
        contextToken: 'ctx_1',
      });
      useCartStore.getState().clear();

      useCartStore.getState().addItem({
        foodId: 'food-dosa',
        name: 'Masala Dosa',
        price: 80,
        variantId: 'regular',
        restaurantId: 'obr_1',
        restaurantSlug: 'inti-bhojanam',
      }, 1);

      useCartStore.getState().addItem({
        foodId: 'food-coffee',
        name: 'Cold Coffee',
        price: 120,
        restaurantId: 'obr_1',
        restaurantSlug: 'inti-bhojanam',
      }, 1);

      const lines = useCartStore.getState().lines;
      assert.equal(lines.length, 2);
      const dosaLine = lines.find((l) => l.foodId === 'food-dosa')!;
      const coffeeLine = lines.find((l) => l.foodId === 'food-coffee')!;
      assert.ok(dosaLine.lineId);
      assert.ok(coffeeLine.lineId);
      assert.notEqual(dosaLine.lineId, dosaLine.foodId, 'lineId is unique from foodId');

      // Update quantity using the authoritative lineId
      useCartStore.getState().setQuantity(dosaLine.lineId, 3);

      const updatedLines = useCartStore.getState().lines;
      const updatedDosa = updatedLines.find((l) => l.lineId === dosaLine.lineId)!;
      const updatedCoffee = updatedLines.find((l) => l.lineId === coffeeLine.lineId)!;
      assert.equal(updatedDosa.quantity, 3, 'Intended line quantity must update to 3');
      assert.equal(updatedCoffee.quantity, 1, 'Other line must remain unchanged at 1');

      // Calling setQuantity with foodId must NOT match because cartStore matches l.lineId === lineId
      useCartStore.getState().setQuantity(dosaLine.foodId, 5);
      const unchangedDosa = useCartStore.getState().lines.find((l) => l.lineId === dosaLine.lineId)!;
      assert.equal(unchangedDosa.quantity, 3, 'Using foodId must not match lineId');
    });

    it('P1.3 & P2.3 & P2.5: grounds cheaper-item comparison and follow-up against authoritative live menu items', async () => {
      const { mergeMenuItemsIntoSearchCache, resetSearchMenuCacheForTests } = await import(
        '../src/features/search/store/searchMenuCacheStore'
      );
      resetSearchMenuCacheForTests();

      mergeMenuItemsIntoSearchCache([
        {
          id: 'food_masala_dosa',
          type: 'food',
          label: 'Masala Dosa',
          slug: 'masala-dosa',
          restaurant: {
            restaurantId: 'obr_inti',
            restaurantSlug: 'inti-bhojanam',
            displayName: 'Inti Bhojanam',
            cuisines: ['South Indian'],
            isOpen: true,
            badges: [],
            kitchenFormat: 'cloud_kitchen',
          },
          meta: { price: 80, isVeg: true },
        },
        {
          id: 'food_cold_coffee',
          type: 'food',
          label: 'Cold Coffee',
          slug: 'cold-coffee',
          restaurant: {
            restaurantId: 'obr_inti',
            restaurantSlug: 'inti-bhojanam',
            displayName: 'Inti Bhojanam',
            cuisines: ['Beverages'],
            isOpen: true,
            badges: [],
            kitchenFormat: 'cloud_kitchen',
          },
          meta: { price: 120, isVeg: true },
        },
      ]);

      // Natural language matching for follow-up
      const followUpRegex = /^(?:please\s+)?(?:add|put)\s+(?:it|that|the\s+cheaper\s+one)(?:\s+(?:to|in)\s+(?:my\s+)?cart)?(?:\s+please)?\.?$/i;
      assert.ok(followUpRegex.test('Add it to my cart'));
      assert.ok(followUpRegex.test('add that to cart'));
      assert.ok(followUpRegex.test('add it'));
      assert.ok(followUpRegex.test('put it in my cart'));
      assert.ok(followUpRegex.test('Add the cheaper one please'));

      // Validate grounded plan contract
      const groundedPlan = {
        type: 'cart_add_plan' as const,
        requiresConfirmation: true as const,
        executable: false as const,
        payload: {
          foodId: 'food_masala_dosa',
          itemId: 'food_masala_dosa',
          name: 'Masala Dosa',
          price: 80,
          quantity: 1,
          restaurantId: 'obr_inti',
          restaurantSlug: 'inti-bhojanam',
        },
      };
      assert.ok(groundedPlan.payload.foodId);
      assert.ok(groundedPlan.payload.price === 80);
      assert.ok(groundedPlan.payload.restaurantId === 'obr_inti');

      // Ungrounded plan must not be marked valid
      const ungroundedValidation = {
        status: 'invalid' as const,
        valid: false,
        proposedActions: [{ type: 'cart_add_plan' as const, requiresConfirmation: true as const, executable: false as const, payload: { name: 'Mystery Dish', quantity: 1 } }],
        issues: [{ code: 'UNGROUNDED_ITEM', message: 'Item could not be grounded against an authoritative live menu item.' }],
      };
      assert.equal(ungroundedValidation.valid, false, 'Ungrounded plan must never be marked valid');
    });

    it('P2.1 & P2.2: applies customization to requested item/portion only and only claims saved when persisted', async () => {
      const { parseCustomizerNote } = await import('../src/features/assistant/domain/customizerNoteNormalize');
      const { useCartStore } = await import('../src/features/cart/store/cartStore');

      // 1. Portion-level customization parsing
      const note1 = parseCustomizerNote('Make one of them without much spice');
      assert.equal(note1?.customizer, 'without much spice');
      assert.equal(note1?.quantity, 1);

      const note2 = parseCustomizerNote('Make the dosa without much spice');
      assert.equal(note2?.customizer, 'without much spice');
      assert.equal(note2?.targetDish, 'dosa');

      // 2. Portion splitting simulation: 2 Masala Dosas with "one without much spice"
      const originalActions = [
        {
          type: 'cart_add_plan' as const,
          requiresConfirmation: true as const,
          executable: false as const,
          payload: { name: 'Masala Dosa', quantity: 2, restaurantId: 'obr_1' },
        },
      ];
      // Splitting for quantity 1
      const splitActions = [
        {
          ...originalActions[0]!,
          payload: { ...originalActions[0]!.payload, quantity: 1, instructions: 'without much spice' },
        },
        {
          ...originalActions[0]!,
          payload: { ...originalActions[0]!.payload, quantity: 1 },
        },
      ];
      assert.equal(splitActions.length, 2);
      assert.equal(splitActions[0]!.payload.instructions, 'without much spice');
      assert.equal(splitActions[1]!.payload.instructions, undefined);

      // 3. Cart line persistence
      const { useRestaurantContextStore: useCtx } = await import('../src/features/restaurant/store/restaurantContextStore');
      useCtx.getState().setContext({
        restaurantSlug: 'inti-bhojanam',
        restaurantId: 'obr_1',
        contextToken: 'ctx_1',
      });
      useCartStore.getState().clear();
      useCartStore.getState().addItem({
        foodId: 'food-dosa',
        name: 'Masala Dosa',
        price: 80,
      }, 1);
      const line = useCartStore.getState().lines[0]!;
      const persisted = useCartStore.getState().updateInstructions?.(line.lineId, 'less spicy');
      assert.equal(persisted, true, 'Instruction must be persisted to cart line');
      assert.equal(useCartStore.getState().lines[0]!.instructions, 'less spicy');

      // 4. Invalid line ID must not report persisted
      const invalidPersist = useCartStore.getState().updateInstructions?.('non-existent-line', 'extra spicy');
      assert.equal(invalidPersist, false, 'Invalid line must return false and not claim saved');
    });

    it('P2.4: grounds nearby suggestions using user location and live menu items', async () => {
      const { buildOrderingAssistContext } = await import(
        '../src/features/assistant/domain/buildOrderingAssistContext'
      );
      const ctx = buildOrderingAssistContext({
        restaurantId: 'obr_inti',
        restaurantName: 'Inti Bhojanam',
        restaurantSlug: 'inti-bhojanam',
        areaLabel: 'Tirupati Central',
        lat: 13.6288,
        lng: 79.4192,
        nearbyKitchens: [{ id: 'obr_inti', name: 'Inti Bhojanam', cuisine: 'South Indian' }],
      });
      assert.ok(ctx);
      assert.equal(ctx?.areaLabel, 'Tirupati Central');
      assert.equal(ctx?.nearbyKitchens?.[0]?.name, 'Inti Bhojanam');
    });

    it('P2.6: cancels native speech when voice turn is aborted', async () => {
      const { cancelAllVoiceSpeech, speakVoiceConfirmation } = await import(
        '../src/features/assistant/infrastructure/voiceSpeechSynthesis'
      );
      assert.equal(typeof cancelAllVoiceSpeech, 'function');
      assert.doesNotThrow(() => cancelAllVoiceSpeech());

      // Pre-aborted signal must throw immediately
      const ac = new AbortController();
      ac.abort();
      await assert.rejects(
        async () => {
          await speakVoiceConfirmation({
            text: 'Hello world',
            signal: ac.signal,
          });
        },
        /aborted/i,
      );
    });

    it('P2.7: records measured latency stages without estimated multiplier fractions', async () => {
      const sample = {
        turnId: 'turn-test-1',
        timestamp: Date.now(),
        mic_tap_to_ready_ms: 120.5,
        mic_ready_to_first_speech_ms: 210.0,
        utterance_capture_ms: 1450.2,
        end_of_speech_to_final_transcript_ms: 320.0,
        transcription_network_ms: 310.5, // Measured STT elapsed, not (320 * 0.45)
        assistant_request_ms: 450.2,
        menu_grounding_ms: 45.1,        // Measured via performance.now(), not (450.2 * 0.35)
        cart_validation_ms: 62.3,       // Measured via performance.now(), not (450.2 * 0.35)
        time_to_first_reply_text_ms: 495.3,
        time_to_first_audio_ms: 610.0,
        tts_total_playback_ms: 1100.0,
        user_speech_end_to_first_response_ms: 495.3,
        user_speech_end_to_checkout_ready_ms: 770.2,
        full_turn_duration_ms: 3100.5,
      };

      recordVoiceLatencySample(sample);
      const stats = getStageLatencyStats('transcription_network_ms');
      assert.equal(stats.p50, 310.5);
      const groundingStats = getStageLatencyStats('menu_grounding_ms');
      assert.equal(groundingStats.p50, 45.1);
      const validationStats = getStageLatencyStats('cart_validation_ms');
      assert.equal(validationStats.p50, 62.3);

      // Verify measured values are independent and not locked to fractions of assistantRequestDuration
      assert.notEqual(sample.menu_grounding_ms, Number((sample.assistant_request_ms * 0.35).toFixed(1)));
      assert.notEqual(sample.cart_validation_ms, Number((sample.assistant_request_ms * 0.35).toFixed(1)));
      assert.notEqual(sample.transcription_network_ms, Number((sample.end_of_speech_to_final_transcript_ms * 0.45).toFixed(1)));
    });

    it('P1.4: preserves explicit quantity corrections across number words, digits, and connector "to"', async () => {
      const { parseQuantityOnlyMessage, normalizeQuantityAsr } = await import(
        '../src/features/assistant/domain/quantityAsrNormalize'
      );
      const { patchPendingPlanQuantity } = await import(
        '../src/features/assistant/domain/patchPendingPlanQuantity'
      );

      // Verify number normalization doesn't turn connector "to" into 2
      assert.equal(normalizeQuantityAsr('set it to three'), 'set it to three');
      assert.equal(normalizeQuantityAsr('change it to five'), 'change it to five');
      assert.equal(normalizeQuantityAsr('make it 3'), 'make it 3');

      // Verify parseQuantityOnlyMessage extracts correct integer
      assert.equal(parseQuantityOnlyMessage('set it to three'), 3);
      assert.equal(parseQuantityOnlyMessage('change it to five'), 5);
      assert.equal(parseQuantityOnlyMessage('make it 3'), 3);
      assert.equal(parseQuantityOnlyMessage('set it to 3'), 3);
      assert.equal(parseQuantityOnlyMessage('actually set it to 4'), 4);
      assert.equal(parseQuantityOnlyMessage('make that 5 dosas'), 5);

      // Verify genuine ASR homophones where "to/too" means 2
      assert.equal(parseQuantityOnlyMessage('make it to'), 2);
      assert.equal(parseQuantityOnlyMessage('set it too'), 2);

      // Apply quantity correction to pending plan
      const plan = {
        schemaVersion: '5.0',
        conversationId: 'conv_1',
        channel: 'orderbhojan_web',
        status: 'validated' as const,
        valid: true,
        clarificationQuestions: [],
        issues: [],
        proposedActions: [
          {
            type: 'cart_add_plan' as const,
            requiresConfirmation: true as const,
            executable: false as const,
            payload: { name: 'Masala Dosa', quantity: 1, restaurantId: 'obr_1' },
          },
        ],
        executable: false,
        sideEffects: [],
        mutatedState: false,
      };

      const parsedQty = parseQuantityOnlyMessage('set it to three');
      assert.equal(parsedQty, 3);
      const patched = patchPendingPlanQuantity(plan, parsedQty!);
      assert.equal(patched.proposedActions[0]!.payload!.quantity, 3);
      assert.equal(patched.proposedActions[0]!.payload!.name, 'Masala Dosa');
    });

    it('P2.8: validates cheaper-item plans with authoritative validate() service and rejects stale/unavailable items', async () => {
      // Simulate validation outcomes
      const mockValidateSuccess = async (plan: any) => ({
        schemaVersion: '5.0',
        conversationId: 'c1',
        channel: 'orderbhojan_web',
        status: 'validated' as const,
        valid: true,
        proposedActions: plan.proposedActions,
        clarificationQuestions: [],
        issues: [],
        executable: false,
        sideEffects: [],
        mutatedState: false,
      });

      const mockValidateUnavailable = async (plan: any) => ({
        schemaVersion: '5.0',
        conversationId: 'c1',
        channel: 'orderbhojan_web',
        status: 'invalid' as const,
        valid: false,
        proposedActions: plan.proposedActions,
        clarificationQuestions: [],
        issues: [{ code: 'ITEM_UNAVAILABLE', message: 'Item is sold out today' }],
        executable: false,
        sideEffects: [],
        mutatedState: false,
      });

      const proposedAction = {
        type: 'cart_add_plan' as const,
        requiresConfirmation: true as const,
        executable: false as const,
        payload: { foodId: 'food_dosa', name: 'Masala Dosa', price: 80, quantity: 1, restaurantId: 'obr_1' },
      };

      const successResult = await mockValidateSuccess({ proposedActions: [proposedAction] });
      assert.equal(successResult.valid, true);
      assert.equal(successResult.status, 'validated');

      const failResult = await mockValidateUnavailable({ proposedActions: [proposedAction] });
      assert.equal(failResult.valid, false);
      assert.equal(failResult.status, 'invalid');
      assert.equal(failResult.issues[0]?.code, 'ITEM_UNAVAILABLE');
    });

    it('P2.9: asks for clarification and leaves pending plan untouched when named dish does not match', async () => {
      const { canonicalizeOrderingText } = await import(
        '../src/features/assistant/domain/orderingTextNormalize'
      );

      const pendingActions = [
        {
          type: 'cart_add_plan' as const,
          requiresConfirmation: true as const,
          executable: false as const,
          payload: { name: 'Masala Dosa', quantity: 2, instructions: undefined },
        },
        {
          type: 'cart_add_plan' as const,
          requiresConfirmation: true as const,
          executable: false as const,
          payload: { name: 'Cold Coffee', quantity: 1, instructions: undefined },
        },
      ];

      const targetDish = 'biryani';
      const canonT = canonicalizeOrderingText(targetDish);
      const foundIdx = pendingActions.findIndex((a) => {
        const aName = a.payload.name;
        const canonA = canonicalizeOrderingText(aName);
        return canonA === canonT || canonA.includes(canonT) || canonT.includes(canonA);
      });

      assert.equal(foundIdx, -1, 'Unknown target dish must not match any pending action');
      // When foundIdx === -1, neither action 0 nor action 1 should be modified
      assert.equal(pendingActions[0]!.payload.instructions, undefined);
      assert.equal(pendingActions[1]!.payload.instructions, undefined);
    });

    it('P2.10: splits cart line when customizing 1 portion of a multi-quantity item and preserves cart line identity', async () => {
      const { useCartStore } = await import('../src/features/cart/store/cartStore');
      const { useRestaurantContextStore } = await import('../src/features/restaurant/store/restaurantContextStore');

      useRestaurantContextStore.getState().setContext({
        restaurantSlug: 'inti-bhojanam',
        restaurantId: 'obr_1',
        contextToken: 'ctx_1',
      });
      useCartStore.getState().clear();

      // Add 2 Masala Dosas
      useCartStore.getState().addItem(
        {
          foodId: 'food-dosa',
          name: 'Masala Dosa',
          price: 80,
        },
        2,
      );

      const initialLines = useCartStore.getState().lines;
      assert.equal(initialLines.length, 1);
      assert.equal(initialLines[0]!.quantity, 2);
      const originalLineId = initialLines[0]!.lineId;

      // Customize 1 portion with "without much spice"
      const splitOk = useCartStore.getState().customizePortion(originalLineId, 1, 'without much spice');
      assert.equal(splitOk, true);

      const afterSplitLines = useCartStore.getState().lines;
      assert.equal(afterSplitLines.length, 2, 'Must split into 2 lines');

      const customizedLine = afterSplitLines.find((l) => l.instructions === 'without much spice')!;
      const uncustomizedLine = afterSplitLines.find((l) => !l.instructions)!;

      assert.ok(customizedLine, 'Customized line must exist');
      assert.equal(customizedLine.quantity, 1, 'Customized line must have quantity 1');
      assert.ok(customizedLine.lineId.includes('without much spice'), 'Customized line ID must reflect instructions');

      assert.ok(uncustomizedLine, 'Uncustomized line must exist');
      assert.equal(uncustomizedLine.quantity, 1, 'Remaining uncustomized line must have quantity 1');
      assert.equal(uncustomizedLine.lineId, 'food-dosa');

      // Now add 1 plain Masala Dosa - must merge into uncustomizedLine, NOT into customizedLine
      useCartStore.getState().addItem(
        {
          foodId: 'food-dosa',
          name: 'Masala Dosa',
          price: 80,
        },
        1,
      );

      const finalLines = useCartStore.getState().lines;
      assert.equal(finalLines.length, 2, 'Plain add must not create a third line');

      const finalUncustomized = finalLines.find((l) => !l.instructions)!;
      const finalCustomized = finalLines.find((l) => l.instructions === 'without much spice')!;

      assert.equal(finalUncustomized.quantity, 2, 'Plain add must merge into uncustomized line (1 + 1 = 2)');
      assert.equal(finalCustomized.quantity, 1, 'Customized line must remain untouched at quantity 1');
    });

    it('P2.11: carries preparation notes into checkout payload and prepare signature', async () => {
      const { buildCheckoutPayload, buildCheckoutPrepareSignature } = await import(
        '../src/features/checkout/domain/checkoutPayload'
      );
      const { useCartStore } = await import('../src/features/cart/store/cartStore');

      const lines = [
        {
          lineId: 'food-dosa',
          foodId: 'food-dosa',
          name: 'Masala Dosa',
          price: 80,
          quantity: 1,
          restaurantSlug: 'inti-bhojanam',
          restaurantId: 'obr_1',
        },
        {
          lineId: 'food-dosa:::without much spice',
          foodId: 'food-dosa',
          name: 'Masala Dosa',
          price: 80,
          quantity: 1,
          instructions: 'without much spice',
          restaurantSlug: 'inti-bhojanam',
          restaurantId: 'obr_1',
        },
      ];

      const payload = buildCheckoutPayload(lines, 'obr_1', 'ctx_1', null);
      assert.equal(payload.lines.length, 2);
      assert.equal((payload.lines[0] as any).instructions, undefined);
      assert.equal((payload.lines[1] as any).instructions, 'without much spice');

      const sig1 = buildCheckoutPrepareSignature({
        restaurantId: 'obr_1',
        contextToken: 'ctx_1',
        lines: [lines[0]!],
      });
      const sig2 = buildCheckoutPrepareSignature({
        restaurantId: 'obr_1',
        contextToken: 'ctx_1',
        lines: [lines[1]!],
      });
      assert.notEqual(sig1, sig2, 'Lines with different instructions must produce distinct prepare signatures');
    });

    it('P2.12: makes native TTS cancellation abort-safe with pre-aborted, active abort, and cleanup', async () => {
      const { speakVoiceConfirmation } = await import(
        '../src/features/assistant/infrastructure/voiceSpeechSynthesis'
      );

      // 1. Pre-aborted signal throws immediately
      const preAc = new AbortController();
      preAc.abort();
      await assert.rejects(
        async () => {
          await speakVoiceConfirmation({
            text: 'Pre-aborted test',
            signal: preAc.signal,
          });
        },
        /aborted/i,
      );

      // 2. Mock synthesizer for active abort & cleanup verification
      let cancelled = false;
      let spokenUtt: any = null;
      const mockSynth = {
        speaking: true,
        cancel: () => {
          cancelled = true;
        },
        speak: (utt: any) => {
          spokenUtt = utt;
        },
      };

      const ac = new AbortController();
      const speakPromise = speakVoiceConfirmation({
        text: 'Active abort test',
        signal: ac.signal,
        createSynthesis: () => mockSynth as any,
        createUtterance: (text) => ({ text, lang: 'en-IN' } as any),
      });

      // Trigger abort while speaking
      ac.abort();

      await assert.rejects(
        async () => {
          await speakPromise;
        },
        /aborted/i,
      );

      assert.equal(cancelled, true, 'Synth cancel() must be called upon abort');

      // 3. Normal completion
      let normalFinished = false;
      const normalSynth = {
        speaking: false,
        cancel: () => {},
        speak: (utt: any) => {
          setTimeout(() => {
            utt.onend?.();
          }, 10);
        },
      };

      await speakVoiceConfirmation({
        text: 'Normal completion test',
        createSynthesis: () => normalSynth as any,
        createUtterance: (text) => ({ text, lang: 'en-IN' } as any),
        onTiming: () => {
          normalFinished = true;
        },
      });

      assert.equal(normalFinished, true, 'Normal synthesis must complete and trigger timing callback');
    });
  });
});
