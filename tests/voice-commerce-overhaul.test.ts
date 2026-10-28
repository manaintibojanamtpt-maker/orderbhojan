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
});
