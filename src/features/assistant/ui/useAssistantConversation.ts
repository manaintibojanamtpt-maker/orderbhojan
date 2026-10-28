import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { applyConfirmedCartPlan } from '@/features/cart/domain/applyConfirmedCartPlan';
import { cartSubtotal, useCartStore } from '@/features/cart/store/cartStore';
import {
  clearVoiceConfirmation,
  createOrderBhojanVoiceAdapter,
  createVoiceSession,
  idleOrderingTask,
  initialConfirmationSnapshot,
  pendingPlanIdFromValidation,
  runVoiceCoreTurn,
  syncConfirmationFromPending,
  type OrderBhojanVoiceAdapter,
} from '@/features/voice';
import { useActiveLocation } from '@/features/location';
import { resolveRestaurantCoords } from '@/features/restaurant/engine/restaurantExperienceLayer';
import { useRestaurantContextStore } from '@/features/restaurant/store/restaurantContextStore';
import { notifyToast } from '@/shared/providers/BdsToastProvider';
import { openExternalUrl } from '@/lib/nativePlatform';
import { ensureRestaurantContextForCartPlan } from '../application/ensureRestaurantContextForCartPlan';
import type { CartPlanAction, CartPlanValidationResult } from '../domain/cartPlanContract';
import {
  buildCartAddPlansFromReorder,
  pickUsualReorderSource,
} from '../domain/buildPersonalizationCartPlans';
import { buildPersonalizationGuidance } from '../domain/buildPersonalizationGuidance';
import { buildPostOrderTriageGuidance } from '../domain/buildPostOrderTriageGuidance';
import {
  classifyPersonalizationIntent,
  isPersonalizationCartIntent,
} from '../domain/isPersonalizationUserMessage';
import {
  parseCartAddUserMessage,
  parseMultiCartAddUserMessage,
  hydrateCartPlansFromUtterance,
  normalizeQuantityAsr,
  parseQuantityOnlyMessage,
  cleanItemName,
} from '../domain/isCartAddUserMessage';
import { parseCustomizerNote } from '../domain/customizerNoteNormalize';
import { isPriceComparisonMessage } from '../domain/priceComparisonIntent';
import { patchPendingPlanQuantity } from '../domain/patchPendingPlanQuantity';
import { buildOrderingAssistContext } from '../domain/buildOrderingAssistContext';
import {
  isStopVoiceAgentMessage,
} from '../domain/isConfirmCartUserMessage';
import { isPostOrderUserMessage } from '../domain/isPostOrderUserMessage';
import {
  correctTranscriptAgainstOrderingVocab,
  enrichCartPlansFromMenuCache,
  matchKitchenFragmentInMessage,
} from '../domain/matchOrderingVocabulary';
import { expandIndicOrderingUtterance } from '../domain/orderingTextNormalize';
import { groundVoiceOrderingContext } from '../domain/resolveKitchenForVoice';
import { resolveCartPlanRestaurantId } from '../domain/resolveCartPlanRestaurant';
import { toPendingPlanRestaurantRef } from '../domain/restaurantIdSlug';
import { recordVoiceTelemetry } from '../domain/voiceOrderingTelemetry';
import { OrderConfirmationStateMachine } from '../domain/orderConfirmationStateMachine';
import { recordVoiceLatencySample } from '../domain/voiceLatencyTelemetry';
import { getCachedMenuItemsForSearch } from '@/features/search/store/searchMenuCacheStore';
import { cancelAllVoiceSpeech } from '../infrastructure/voiceSpeechSynthesis';
import { canonicalizeOrderingText } from '../domain/orderingTextNormalize';
import { prefetchKitchenMenuForAssist } from '../application/prefetchKitchenMenuForAssist';
import { useCheckoutScheduleStore } from '@/features/checkout/store/checkoutScheduleStore';
import {
  formatCartPlanSummarySpeech,
  summarizePendingCartPlan,
} from '../domain/summarizePendingCartPlan';
import { useAiPostOrderFeature } from '../hooks/useAiPostOrderFeature';

import { useAiVoiceFeature } from '../hooks/useAiVoiceFeature';
import { useAssistantPersonalizationContext } from '../hooks/useAssistantPersonalizationContext';
import { useAssistantPostOrderContext } from '../hooks/useAssistantPostOrderContext';
import { getAssistantApiClient } from '../infrastructure/assistantApiClient';
import { AssistantApiError, type ConsumerAssistHint } from '../types';
import { useAssistantApi } from '../hooks/useAssistantApi';
import { useVoiceStt } from '../hooks/useVoiceStt';
import { useVoiceTts } from '../hooks/useVoiceTts';
import { unlockAudioContext } from '../infrastructure/voiceSpeechSynthesis';
import { forceStopSpeechCapture } from '../infrastructure/voiceSpeechCapture';
import { useVoiceFirstFeature } from '../hooks/useVoiceFirstFeature';
import {
  shouldTriggerProactiveGreeting,
  markGreetingShown,
  markGreetingSpoken,
  hasGreetingBeenSpoken,
  markGreetingDismissed,
  resolveGreetingContextType,
} from '../domain/voiceFirstSession';
import {
  getGreetingMessage,
  type GreetingMessageResult,
} from '../domain/greetingStrategy';

/** Best-effort audit; never blocks confirm/discard UX. */
function reportCartPlanDecisionQuietly(params: {
  readonly decision: 'confirm' | 'discard';
  readonly conversationId?: string;
  readonly planCount?: number;
}): void {
  void getAssistantApiClient()
    .reportCartPlanDecision(params)
    .catch(() => {
      /* intentional: audit must not affect cart confirm/deny UX */
    });
}

function mergeAssistHints(
  primary: readonly ConsumerAssistHint[],
  secondary: readonly ConsumerAssistHint[],
): readonly ConsumerAssistHint[] {
  const seen = new Set<string>();
  const out: ConsumerAssistHint[] = [];
  for (const hint of [...primary, ...secondary]) {
    if (hint.type === 'none') continue;
    const key = `${hint.type}:${hint.target ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hint);
  }
  return out;
}

export interface AssistantThreadMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly text: string;
  readonly hints?: readonly ConsumerAssistHint[];
  readonly cartActions?: readonly CartPlanAction[];
  readonly validation?: CartPlanValidationResult;
}

function nextId(): string {
  return `ob_ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatKitchenDisplayName(slugOrName?: string | null): string | undefined {
  if (!slugOrName?.trim()) return undefined;
  const raw = slugOrName.trim();
  if (raw.includes('-')) {
    return raw
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return raw;
}

function sanitizeConsumerReplyText(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/\(?\s*foodId\s*=\s*[^)\s]+\s*\)?/gi, '')
    .replace(/\[?\s*foodId\s*=\s*[^\]\s]+\s*\]?/gi, '')
    .replace(/\(?\s*restaurantId\s*=\s*[^)\s]+\s*\)?/gi, '')
    .replace(/\[?\s*restaurantId\s*=\s*[^\]\s]+\s*\]?/gi, '')
    .replace(/\([0-9a-zA-Z_-]{16,36}\)/g, '')
    .replace(/foodId=[a-zA-Z0-9_-]+/gi, '')
    .replace(/\s+([,.:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function validationSpeakText(
  validation: CartPlanValidationResult,
  kitchenName?: string | null,
  lang?: string,
): string {
  const cleanKitchenName = formatKitchenDisplayName(kitchenName) ?? kitchenName;
  const summary = formatCartPlanSummarySpeech(
    summarizePendingCartPlan(validation, { kitchenName: cleanKitchenName }),
  );
  const isTelugu = lang?.toLowerCase().startsWith('te');
  const isHindi = lang?.toLowerCase().startsWith('hi');

  if (validation.status === 'validated' && validation.valid) {
    if (isTelugu) {
      return summary
        ? `${summary} సిద్ధంగా ఉంది. కార్ట్ కు చేర్చడానికి "కన్ఫర్మ్" అని చెప్పండి.`
        : 'ప్లాన్ సిద్ధంగా ఉంది. కార్ట్ కు చేర్చడానికి "కన్ఫర్మ్" అని చెప్పండి.';
    }
    if (isHindi) {
      return summary
        ? `${summary} तैयार है। कार्ट में जोड़ने के लिए "कन्फर्म" कहें।`
        : 'प्लान तैयार है। कार्ट में जोड़ने के लिए "कन्फर्म" कहें।';
    }
    return summary
      ? `Ready: ${summary}. Say confirm to add to cart, or discard to cancel.`
      : 'Plan looks good. Say confirm to add it to your cart, or discard to cancel.';
  }

  const clarify =
    validation.clarificationQuestions[0] ||
    validation.issues[0]?.message ||
    'I could not validate that dish on this kitchen’s menu. Try the exact menu name.';

  if (isTelugu) {
    if (/which menu item/i.test(clarify)) {
      return 'మీరు ఏ వంటకం ఆర్డర్ చేయాలనుకుంటున్నారో దయచేసి స్పష్టంగా చెప్పండి.';
    }
    return 'ఈ వంటకం మెనూలో లభించలేదు. దయచేసి సరైన వంటకం పేరు చెప్పండి.';
  }
  if (isHindi) {
    if (/which menu item/i.test(clarify)) {
      return 'कृपया बताएं कि आप कौन सा व्यंजन ऑर्डर करना चाहते हैं।';
    }
    return 'यह व्यंजन मेनू में उपलब्ध नहीं है। कृपया सही व्यंजन का नाम बताएं।';
  }

  return summary ? `${clarify} (Working on: ${summary})` : clarify;
}

function toNearbyKitchenHints(
  kitchens: readonly { readonly id?: string; readonly name: string }[] | undefined,
): { id: string; name: string }[] {
  if (!kitchens?.length) return [];
  return kitchens
    .filter((k): k is { id: string; name: string } => Boolean(k.id?.trim() && k.name.trim()))
    .map((k) => ({ id: k.id.trim(), name: k.name.trim() }));
}

export function useAssistantConversation() {
  const location = useLocation();
  const { ask, askPostOrder, postOrderAssistEnabled, validate, loading, setLoading, validating, setValidating, error, setError } = useAssistantApi();
  const { listening, setListening, startListening, cancelListening, voiceCaptureAvailable, voiceAbortRef } = useVoiceStt();
  const { speaking, setSpeaking, voiceLanguage, setVoiceLanguage, speakReply } = useVoiceTts();

  const postOrderFlag = useAiPostOrderFeature();
  const orderContext = useAssistantPostOrderContext();
  const { enabled: personalizationEnabled, bootstrap: personalizationBootstrap } =
    useAssistantPersonalizationContext();
  const voiceEnabled = useAiVoiceFeature();
  const voiceCoreConfirmAddLive = true;
  const navigate = useNavigate();
  const restaurantId = useRestaurantContextStore((s) => s.restaurantId);
  const restaurantSlug = useRestaurantContextStore((s) => s.restaurantSlug);
  const addItem = useCartStore((s) => s.addItem);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const updateInstructions = useCartStore((s) => s.updateInstructions);
  const commitAtomicBatchPlan = useCartStore((s) => s.commitAtomicBatchPlan);
  const activeLocation = useActiveLocation();

  const postOrderMode = postOrderFlag && (Boolean(orderContext?.orderId) || Boolean(orderContext?.snapshot));

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<readonly AssistantThreadMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [applying, setApplying] = useState(false);
  const [voiceAgentActive, setVoiceAgentActive] = useState(false);
  /** Explicit UX gate so Thinking/Speaking show before loading/TTS flags flip. */
  const [voiceTurnPhase, setVoiceTurnPhase] = useState<
    'idle' | 'listening' | 'thinking' | 'speaking'
  >('idle');
  const [interimTranscript, setInterimTranscript] = useState<string | null>(null);
  const [pendingValidation, setPendingValidation] = useState<CartPlanValidationResult | null>(null);
  const voiceFirstFeatureEnabled = useVoiceFirstFeature();
  const cartLines = useCartStore((s) => s.lines);
  const [proactiveGreeting, setProactiveGreeting] = useState<GreetingMessageResult | null>(null);
  const [audioPlayBlocked, setAudioPlayBlocked] = useState(false);
  
  const voiceAgentActiveRef = useRef(false);
  const voiceTurnPhaseRef = useRef(voiceTurnPhase);
  voiceTurnPhaseRef.current = voiceTurnPhase;
  /** After a successful voice cart apply, pause live listen so customers are not left “recording”. */
  const pauseLiveVoiceAfterTurnRef = useRef(false);
  const orderStateMachineRef = useRef(new OrderConfirmationStateMachine());
  /** Sheet visibility — mic must never stay open when this is false. */
  const sheetOpenRef = useRef(false);
  const pendingValidationRef = useRef<CartPlanValidationResult | null>(null);
  const pendingPlanRestaurantRef = useRef<{
    restaurantId: string;
    restaurantSlug: string;
  } | null>(null);
  /** When assistant offers to open a kitchen, “yes” navigates instead of resetting chat. */
  const pendingExploreKitchenRef = useRef<{
    name: string;
    id?: string;
    searchPath: string;
  } | null>(null);
  const voiceSessionRef = useRef(
    createVoiceSession({ product: 'orderbhojan', channel: 'web' }),
  );
  const voiceConfirmationRef = useRef(initialConfirmationSnapshot());
  const voiceAdapterRef = useRef<OrderBhojanVoiceAdapter | null>(null);
  const lastComparedCheaperItemRef = useRef<{
    foodId?: string;
    itemId?: string;
    name: string;
    price: number;
    restaurantId?: string;
    restaurantSlug?: string;
    isGrounded: boolean;
  } | null>(null);

  pendingValidationRef.current = pendingValidation;

  const syncPendingValidation = useCallback((next: CartPlanValidationResult | null) => {
    setPendingValidation(next);
    voiceConfirmationRef.current = next
      ? syncConfirmationFromPending(next)
      : clearVoiceConfirmation();
  }, []);

  useEffect(() => {
    if (!voiceFirstFeatureEnabled) return;
    if (open) return;
    if (!shouldTriggerProactiveGreeting()) return;

    const isKitchenPage = location.pathname.startsWith('/restaurant/');
    const effectiveKitchenName = isKitchenPage ? formatKitchenDisplayName(restaurantSlug) : undefined;
    const effectiveKitchenId = isKitchenPage ? (restaurantId ?? undefined) : undefined;

    const contextType = resolveGreetingContextType({
      cartItemCount: cartLines.length,
      restaurantName: effectiveKitchenName,
      restaurantId: effectiveKitchenId,
    });
    const greeting = getGreetingMessage(contextType, voiceLanguage, effectiveKitchenName);
    setProactiveGreeting(greeting);
    markGreetingShown();

    if (!hasGreetingBeenSpoken() && voiceEnabled) {
      let cancelled = false;
      const ac = new AbortController();
      (async () => {
        try {
          await speakReply(greeting.spokenText, ac.signal, true);
          if (!cancelled) {
            markGreetingSpoken();
          }
        } catch {
          if (!cancelled) {
            setAudioPlayBlocked(true);
          }
        }
      })();
      return () => {
        cancelled = true;
        ac.abort();
      };
    }
  }, [
    voiceFirstFeatureEnabled,
    open,
    voiceEnabled,
    voiceLanguage,
    cartLines.length,
    restaurantSlug,
    restaurantId,
    location.pathname,
    speakReply,
  ]);

  const playProactiveGreetingAudio = useCallback(async () => {
    if (!proactiveGreeting) return;
    unlockAudioContext();
    const ac = new AbortController();
    try {
      setAudioPlayBlocked(false);
      await speakReply(proactiveGreeting.spokenText, ac.signal, true);
      markGreetingSpoken();
    } catch {
      setAudioPlayBlocked(true);
    }
  }, [proactiveGreeting, speakReply]);

  const dismissProactiveGreeting = useCallback(() => {
    setProactiveGreeting(null);
    markGreetingDismissed();
  }, []);

  const createLiveVoiceAdapter = useCallback((): OrderBhojanVoiceAdapter => {
    if (!voiceCoreConfirmAddLive) {
      const stub = createOrderBhojanVoiceAdapter({
        cartMutators: { addItem, setQuantity },
      });
      voiceAdapterRef.current = stub;
      return stub;
    }
    const adapter = createOrderBhojanVoiceAdapter({
      cartMutators: { addItem, setQuantity },
      enrichedValidate: {
        validate: async (request) =>
          validate({
            restaurantId: request.restaurantId,
            proposedActions: [...request.proposedActions],
            ...(request.conversationId
              ? { conversationId: request.conversationId }
              : conversationId
                ? { conversationId }
                : {}),
          }),
        getActiveRestaurant: () => ({
          restaurantId: restaurantId ?? null,
          restaurantSlug: restaurantSlug ?? null,
        }),
        getCoords: () => {
          const c = activeLocation?.coordinates;
          return c ? { lat: c.lat, lng: c.lng } : null;
        },
        getNearbyKitchens: () =>
          toNearbyKitchenHints(
            buildOrderingAssistContext({
              restaurantId,
              restaurantSlug,
              areaLabel: activeLocation?.displayLabel,
              lat: activeLocation?.coordinates?.lat,
              lng: activeLocation?.coordinates?.lng,
            })?.nearbyKitchens,
          ),
        ...(conversationId ? { conversationId } : {}),
      },
      ensureRestaurantContext: async (restaurant) => {
        const coords = resolveRestaurantCoords(activeLocation) ?? { lat: 0, lng: 0 };
        await ensureRestaurantContextForCartPlan({
          restaurantId: restaurant.restaurantId,
          restaurantSlug: restaurant.restaurantSlug,
          coords,
        });
      },
    });
    voiceAdapterRef.current = adapter;
    return adapter;
  }, [
    activeLocation,
    addItem,
    conversationId,
    restaurantId,
    restaurantSlug,
    setQuantity,
    validate,
    voiceCoreConfirmAddLive,
  ]);

  const send = useCallback(
    async (raw: string): Promise<string | undefined> => {
      const message = normalizeQuantityAsr(raw.trim());
      if (!message || loading) return undefined;

      const lowerRaw = raw.toLowerCase();
      let detectedLang: 'te-IN' | 'hi-IN' | 'en-IN' | undefined = undefined;
      if (
        /[\u0C00-\u0C7F]/.test(raw) ||
        /\b(telugu|matladu|matladagalara|matladandi|cheyi|cheyandi|kavali|vaddu|rendu|mudu|nalugu|bhojanam|enti|evaru|undi|undha|dosa|idli|annam|pappu|perugu|tiffin|naa\s*cart|pettandi|vei)\b/i.test(lowerRaw)
      ) {
        detectedLang = 'te-IN';
      } else if (
        /[\u0900-\u097F]/.test(raw) ||
        /\b(hindi|namaste|kya|hai|chahiye|do|ek|teen|char|mera|meri|khana|batao|karo|daal|roti)\b/i.test(lowerRaw)
      ) {
        detectedLang = 'hi-IN';
      }
      const effectiveLang = detectedLang ?? voiceLanguage;
      if (detectedLang && detectedLang !== voiceLanguage) {
        setVoiceLanguage(detectedLang);
      }

      const liveAdapter = createLiveVoiceAdapter();
      const planRestaurant = pendingPlanRestaurantRef.current;
      const pending = pendingValidationRef.current;

      // Quantity-only ASR (“to quantity” → 2) while a plan is pending — skip LLM loop.
      const quantityOnly = parseQuantityOnlyMessage(message);
      if (quantityOnly != null && pending?.proposedActions?.length) {
        const patched = patchPendingPlanQuantity(pending, quantityOnly);
        syncPendingValidation(patched);
        voiceConfirmationRef.current = syncConfirmationFromPending(patched);
        liveAdapter.hydratePendingFromValidation(
          patched,
          planRestaurant,
          pendingPlanIdFromValidation(patched),
        );
        const dish =
          typeof patched.proposedActions[0]?.payload?.name === 'string'
            ? patched.proposedActions[0].payload.name
            : 'your item';
        const reply = `Got it — ${quantityOnly}× ${dish}. Say confirm to add to cart.`;
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'user', text: message },
          {
            id: nextId(),
            role: 'assistant',
            text: reply,
            cartActions: patched.proposedActions,
            validation: patched,
          },
        ]);
        return reply;
      }

      // Quantity correction on existing cart item ("Actually make that three dosas", "Make that 3")
      if (quantityOnly != null && (!pending?.proposedActions?.length) && cartLines.length > 0) {
        let targetLine = cartLines[cartLines.length - 1];
        const utteranceRemainder = message.replace(
          /^(?:actually,?\s*)?(?:make\s+that|make\s+it|set\s+it|change\s+it|update(?:\s+it)?)\s+\d+\s*/i,
          '',
        );
        const utteranceDish = cleanItemName(utteranceRemainder);
        if (utteranceDish) {
          const matched = cartLines.find((l) => {
            const canonicalLine = canonicalizeOrderingText(l.name);
            const canonicalDish = canonicalizeOrderingText(utteranceDish);
            return (
              canonicalLine === canonicalDish ||
              canonicalLine.includes(canonicalDish) ||
              canonicalDish.includes(canonicalLine)
            );
          });
          if (matched) targetLine = matched;
        }

        if (targetLine) {
          setQuantity(targetLine.lineId, quantityOnly);
          const reply = `Got it — updated to ${quantityOnly}× ${targetLine.name}.`;
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'user', text: message },
            { id: nextId(), role: 'assistant', text: reply },
          ]);
          return reply;
        }
      }

      // Natural spice & customizer notes ("Make one of them without much spice", "without much spice", "less spice")
      const customizerIntent = parseCustomizerNote(message);
      if (customizerIntent) {
        if (pending?.proposedActions?.length) {
          // Apply customization to the requested item or portion only
          let targetIndex = 0;
          if (customizerIntent.targetDish) {
            const foundIdx = pending.proposedActions.findIndex((a) => {
              const aName = typeof a.payload?.name === 'string' ? a.payload.name : '';
              const canonA = canonicalizeOrderingText(aName);
              const canonT = canonicalizeOrderingText(customizerIntent.targetDish!);
              return canonA === canonT || canonA.includes(canonT) || canonT.includes(canonA);
            });
            if (foundIdx !== -1) targetIndex = foundIdx;
          }

          const targetAction = pending.proposedActions[targetIndex];
          const currentQty =
            typeof targetAction?.payload?.quantity === 'number'
              ? targetAction.payload.quantity
              : 1;
          const targetName = (targetAction?.payload?.name as string) || 'item';

          let patchedActions: CartPlanAction[];
          if (customizerIntent.quantity === 1 && currentQty > 1) {
            // Apply customization to 1 portion only, preserve remaining portions
            const customizedAction: CartPlanAction = {
              ...targetAction,
              payload: {
                ...(targetAction.payload ?? {}),
                quantity: 1,
                instructions: customizerIntent.customizer,
              },
            };
            const remainingAction: CartPlanAction = {
              ...targetAction,
              payload: {
                ...(targetAction.payload ?? {}),
                quantity: currentQty - 1,
              },
            };
            patchedActions = [
              ...pending.proposedActions.slice(0, targetIndex),
              customizedAction,
              remainingAction,
              ...pending.proposedActions.slice(targetIndex + 1),
            ];
          } else {
            // Apply customization only to the targeted action
            patchedActions = pending.proposedActions.map((action, idx) =>
              idx === targetIndex
                ? {
                    ...action,
                    payload: {
                      ...(action.payload ?? {}),
                      instructions: customizerIntent.customizer,
                    },
                  }
                : action,
            );
          }

          const patched = {
            ...pending,
            proposedActions: patchedActions,
          };
          syncPendingValidation(patched);
          const reply = `Got it! Noted '${customizerIntent.customizer}' on ${
            customizerIntent.quantity === 1 && currentQty > 1 ? '1× ' : ''
          }${targetName}. Say confirm to add to cart or checkout.`;
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'user', text: message },
            {
              id: nextId(),
              role: 'assistant',
              text: reply,
              cartActions: patched.proposedActions,
              validation: patched,
            },
          ]);
          return reply;
        } else if (cartLines.length > 0) {
          let targetLine = cartLines[cartLines.length - 1];
          if (customizerIntent.targetDish) {
            const matched = cartLines.find((l) => {
              const canonL = canonicalizeOrderingText(l.name);
              const canonT = canonicalizeOrderingText(customizerIntent.targetDish!);
              return canonL === canonT || canonL.includes(canonT) || canonT.includes(canonL);
            });
            if (matched) targetLine = matched;
          }

          const persisted =
            targetLine && updateInstructions
              ? updateInstructions(targetLine.lineId, customizerIntent.customizer)
              : false;

          if (persisted && targetLine) {
            const reply = `Got it! Saved '${customizerIntent.customizer}' for ${targetLine.name}. Say "Go to checkout" when you're ready!`;
            setMessages((prev) => [
              ...prev,
              { id: nextId(), role: 'user', text: message },
              { id: nextId(), role: 'assistant', text: reply },
            ]);
            return reply;
          } else {
            const reply = `I couldn't attach that note because no active cart line was found. Please add an item first.`;
            setMessages((prev) => [
              ...prev,
              { id: nextId(), role: 'user', text: message },
              { id: nextId(), role: 'assistant', text: reply },
            ]);
            return reply;
          }
        }
      }

      // Price comparison ("Which is cheaper?", "Compare prices")
      if (isPriceComparisonMessage(message)) {
        let itemA: { foodId?: string; name: string; price: number; restaurantId?: string; restaurantSlug?: string } | null = null;
        let itemB: { foodId?: string; name: string; price: number; restaurantId?: string; restaurantSlug?: string } | null = null;

        if (cartLines.length >= 2 && cartLines[0] && cartLines[1]) {
          itemA = {
            foodId: cartLines[0].foodId,
            name: cartLines[0].name,
            price: cartLines[0].price,
            restaurantId: cartLines[0].restaurantId,
            restaurantSlug: cartLines[0].restaurantSlug,
          };
          itemB = {
            foodId: cartLines[1].foodId,
            name: cartLines[1].name,
            price: cartLines[1].price,
            restaurantId: cartLines[1].restaurantId,
            restaurantSlug: cartLines[1].restaurantSlug,
          };
        } else {
          // Look up items from live menu cache
          const cached = getCachedMenuItemsForSearch();
          if (pending?.proposedActions && pending.proposedActions.length >= 2) {
            const aName = pending.proposedActions[0]?.payload?.name;
            const bName = pending.proposedActions[1]?.payload?.name;
            if (typeof aName === 'string' && typeof bName === 'string') {
              const mA = cached.find((c) => {
                const canonC = canonicalizeOrderingText(c.label);
                const canonA = canonicalizeOrderingText(aName);
                return canonC === canonA || canonC.includes(canonA) || canonA.includes(canonC);
              });
              const mB = cached.find((c) => {
                const canonC = canonicalizeOrderingText(c.label);
                const canonB = canonicalizeOrderingText(bName);
                return canonC === canonB || canonC.includes(canonB) || canonB.includes(canonC);
              });
              if (mA && typeof mA.meta?.price === 'number' && mB && typeof mB.meta?.price === 'number') {
                itemA = {
                  foodId: mA.id,
                  name: mA.label,
                  price: mA.meta.price,
                  restaurantId: mA.restaurant?.restaurantId,
                  restaurantSlug: mA.restaurant?.restaurantSlug,
                };
                itemB = {
                  foodId: mB.id,
                  name: mB.label,
                  price: mB.meta.price,
                  restaurantId: mB.restaurant?.restaurantId,
                  restaurantSlug: mB.restaurant?.restaurantSlug,
                };
              }
            }
          } else if (cached.length >= 2) {
            // Find active restaurant items or first 2 items
            const activeItems = (restaurantId
              ? cached.filter((c) => c.restaurant?.restaurantId === restaurantId)
              : cached
            ).filter((c) => typeof c.meta?.price === 'number');
            if (activeItems.length >= 2 && activeItems[0] && activeItems[1]) {
              itemA = {
                foodId: activeItems[0].id,
                name: activeItems[0].label,
                price: Number(activeItems[0].meta!.price),
                restaurantId: activeItems[0].restaurant?.restaurantId,
                restaurantSlug: activeItems[0].restaurant?.restaurantSlug,
              };
              itemB = {
                foodId: activeItems[1].id,
                name: activeItems[1].label,
                price: Number(activeItems[1].meta!.price),
                restaurantId: activeItems[1].restaurant?.restaurantId,
                restaurantSlug: activeItems[1].restaurant?.restaurantSlug,
              };
            }
          }
        }

        if (!itemA || !itemB || typeof itemA.price !== 'number' || typeof itemB.price !== 'number') {
          lastComparedCheaperItemRef.current = null;
          const reply = "I couldn't verify authoritative menu prices for comparison. Please open a kitchen menu to check live prices.";
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'user', text: message },
            { id: nextId(), role: 'assistant', text: reply },
          ]);
          return reply;
        }

        const cheaper = itemA.price <= itemB.price ? itemA : itemB;
        const other = cheaper === itemA ? itemB : itemA;
        const diff = Math.abs(other.price - cheaper.price);
        lastComparedCheaperItemRef.current = {
          foodId: cheaper.foodId,
          itemId: cheaper.foodId,
          name: cheaper.name,
          price: cheaper.price,
          restaurantId: cheaper.restaurantId ?? restaurantId ?? undefined,
          restaurantSlug: cheaper.restaurantSlug ?? restaurantSlug ?? undefined,
          isGrounded: Boolean(cheaper.foodId && cheaper.price > 0 && (cheaper.restaurantId ?? restaurantId)),
        };

        const reply = `${cheaper.name} is ₹${cheaper.price}, which is cheaper than ${other.name} at ₹${other.price}${
          diff > 0 ? ` by ₹${diff}` : ''
        }. Would you like me to add it to your cart?`;
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'user', text: message },
          { id: nextId(), role: 'assistant', text: reply },
        ]);
        return reply;
      }

      // Followup "Add it to my cart" / "Add that to cart" after price comparison
      const isAddCheaperFollowup =
        /^(?:please\s+)?(?:add|put)\s+(?:it|that|the\s+cheaper\s+one)(?:\s+(?:to|in)\s+(?:my\s+)?cart)?(?:\s+please)?\.?$/i.test(
          message.trim(),
        );
      if (isAddCheaperFollowup && lastComparedCheaperItemRef.current) {
        const item = lastComparedCheaperItemRef.current;
        const effectiveRestaurantId = item.restaurantId || restaurantId;
        const effectiveSlug = item.restaurantSlug || restaurantSlug;
        const isGrounded = Boolean(item.isGrounded && item.foodId && item.price > 0 && effectiveRestaurantId);

        if (isGrounded) {
          const actions: readonly CartPlanAction[] = [
            {
              type: 'cart_add_plan' as const,
              requiresConfirmation: true as const,
              executable: false as const,
              payload: {
                foodId: item.foodId,
                itemId: item.foodId,
                name: item.name,
                price: item.price,
                quantity: 1,
                restaurantId: effectiveRestaurantId,
                restaurantSlug: effectiveSlug || 'inti-bhojanam',
              },
              reason: 'add_cheaper_followup',
            },
          ];
          const validation: CartPlanValidationResult = {
            schemaVersion: '5.0',
            conversationId: conversationId || 'conv-local',
            channel: 'orderbhojan_web',
            status: 'validated' as const,
            valid: true,
            proposedActions: actions,
            clarificationQuestions: [],
            issues: [],
            executable: false,
            sideEffects: [],
            mutatedState: false,
          };
          syncPendingValidation(validation);
          const reply = `I've planned 1× ${item.name} (₹${item.price}). Say confirm or tap Confirm & add to cart.`;
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'user', text: message },
            {
              id: nextId(),
              role: 'assistant',
              text: reply,
              cartActions: actions,
              validation,
            },
          ]);
          return reply;
        } else {
          // Do not mark an ungrounded plan valid
          const actions: readonly CartPlanAction[] = [
            {
              type: 'cart_add_plan' as const,
              requiresConfirmation: true as const,
              executable: false as const,
              payload: {
                name: item.name,
                quantity: 1,
              },
              reason: 'add_cheaper_followup',
            },
          ];
          const validation: CartPlanValidationResult = {
            schemaVersion: '5.0',
            conversationId: conversationId || 'conv-local',
            channel: 'orderbhojan_web',
            status: 'invalid' as const,
            valid: false,
            proposedActions: actions,
            clarificationQuestions: ['Which restaurant menu should I add this item from?'],
            issues: [{ code: 'UNGROUNDED_ITEM', message: 'Item could not be grounded against an authoritative live menu item.' }],
            executable: false,
            sideEffects: [],
            mutatedState: false,
          };
          syncPendingValidation(validation);
          const reply = `I cannot add ${item.name} yet because it is not grounded on today's live menu. Please open a kitchen menu first.`;
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'user', text: message },
            {
              id: nextId(),
              role: 'assistant',
              text: reply,
              cartActions: actions,
              validation,
            },
          ]);
          return reply;
        }
      }

      // Discovery intent ("Find something good to eat nearby", "What's good to eat nearby", "Nearby food")
      const isDiscoveryRequest =
        /^(?:find\s+(?:something\s+)?(?:good\s+to\s+eat\s+)?nearby|what(?:'s|\s+is)\s+good\s+to\s+eat\s+nearby|recommend\s+(?:something|food)\s+nearby|nearby\s+food)\.?$/i.test(
          message.trim(),
        );
      if (isDiscoveryRequest) {
        const area = activeLocation?.displayLabel?.trim() || 'your area';
        const cachedItems = getCachedMenuItemsForSearch();
        const coords = activeLocation?.coordinates;
        const baseOrdering = buildOrderingAssistContext({
          restaurantId,
          restaurantSlug,
          areaLabel: activeLocation?.displayLabel,
          lat: coords?.lat,
          lng: coords?.lng,
        });
        const nearbyKitchens = baseOrdering?.nearbyKitchens;
        const kitchenName = nearbyKitchens?.[0]?.name || restaurantSlug?.replace(/[-_]/g, ' ') || 'Inti Bhojanam';

        // Filter items available for this kitchen or available with valid prices
        const availableItems = cachedItems.filter(
          (item) => typeof item.meta?.price === 'number' && item.meta.price > 0,
        );

        let reply: string;
        if (availableItems.length >= 2 && availableItems[0] && availableItems[1]) {
          reply = `Nearby in ${area}, ${kitchenName} offers fresh ${availableItems[0].label} (₹${availableItems[0].meta!.price}) and ${availableItems[1].label} (₹${availableItems[1].meta!.price}). What would you like to order?`;
        } else if (availableItems.length === 1 && availableItems[0]) {
          reply = `Nearby in ${area}, ${kitchenName} offers fresh ${availableItems[0].label} (₹${availableItems[0].meta!.price}). What would you like to order?`;
        } else {
          reply = `Nearby in ${area}, we have kitchens like ${kitchenName}. Open their live menu or tell me what dish you'd like to order!`;
        }

        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'user', text: message },
          { id: nextId(), role: 'assistant', text: reply },
        ]);
        return reply;
      }

      // Keep confirmation FSM aligned with the UI pending plan every turn.
      if (pending) {
        voiceConfirmationRef.current = syncConfirmationFromPending(pending);
        liveAdapter.hydratePendingFromValidation(
          pending,
          planRestaurant,
          pendingPlanIdFromValidation(pending),
        );
      }
      
      const session = createVoiceSession({
        product: 'orderbhojan',
        channel: 'web',
        conversationId: conversationId || voiceSessionRef.current.conversationId,
      });
      voiceSessionRef.current = session;
      
      const turn = await runVoiceCoreTurn({
        session,
        message,
        confirmation: voiceConfirmationRef.current,
        task: idleOrderingTask(planRestaurant?.restaurantId),
        adapter: liveAdapter,
      });
      
      voiceConfirmationRef.current = turn.confirmation;
      
      if (turn.kind !== 'continue_llm') {
        const validation = liveAdapter.getPendingPlan();
        syncPendingValidation(validation || null);
        if (validation) {
          const res = liveAdapter.getPendingRestaurant();
          pendingPlanRestaurantRef.current = res ? { restaurantId: res.restaurantId, restaurantSlug: res.restaurantSlug } : null;
        } else {
          pendingPlanRestaurantRef.current = null;
        }

        if (turn.kind === 'stop_agent' && turn.spoken) {
          if (voiceAgentActiveRef.current) {
            voiceAgentActiveRef.current = false;
            setVoiceAgentActive(false);
            cancelListening();
            setSpeaking(false);
          }
        }
        
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'user', text: message },
          { 
            id: nextId(), 
            role: 'assistant', 
            text: turn.spoken, 
            ...(validation?.proposedActions ? { cartActions: validation.proposedActions } : {}),
            ...(validation ? { validation } : {})
          },
        ]);
        
        if (turn.kind === 'apply_confirmed_change') {
          notifyToast('Applied item(s) to cart.', 'success');
          // Pause live agent after this turn’s spoken reply — stops STT beeps / “still recording” feel.
          if (turn.applied !== false) {
            pauseLiveVoiceAfterTurnRef.current = true;
          }
        }
        
        return turn.spoken;
      }
      
      setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: message }]);

      // 1. Order Safety State Machine: Awaiting Explicit Spoken Confirmation
      if (orderStateMachineRef.current.state === 'AWAITING_EXPLICIT_ORDER_CONFIRMATION') {
        const cleanUtterance = message.trim();
        if (/^(no|cancel|discard|stop|vaddu|nahi|abort)/i.test(cleanUtterance)) {
          orderStateMachineRef.current.invalidateConfirmation('User cancelled order review');
          const reply = 'Order cancelled. Your items are safe in your cart. Anything else you need?';
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', text: reply },
          ]);
          return reply;
        }

        const confirmResult = orderStateMachineRef.current.handleSpokenConfirmation(cleanUtterance);
        if (!confirmResult.success) {
          const reply =
            confirmResult.replyPrompt ||
            "To place your order, please say 'Yes, place the order', or say cancel to review.";
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', text: reply },
          ]);
          return reply;
        }

        const totalAmount = orderStateMachineRef.current.reviewSnapshot?.totalAmount ?? 0;
        const reply = `Placing your order for ₹${totalAmount} now. Thank you!`;

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ob-voice-place-order', {
              detail: {
                idempotencyKey: orderStateMachineRef.current.idempotencyKey,
                totalAmount,
              },
            }),
          );
        }

        orderStateMachineRef.current.markOrderPlaced();
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', text: reply },
          { id: nextId(), role: 'system', text: `Order authorized via voice. Total: ₹${totalAmount}` },
        ]);
        return reply;
      }

      // 2. Hands-Free Checkout Voice Navigation: "Go to checkout" / "View cart" / "Review order"
      const isCheckoutRequest = /^(go\s+to\s+)?(checkout|view\s+cart|open\s+cart|proceed\s+to\s+checkout|review\s+order)$/i.test(
        message.trim(),
      );
      if (isCheckoutRequest) {
        const currentLines = useCartStore.getState().lines;
        if (currentLines.length === 0) {
          const reply = 'Your cart is empty. What delicious food would you like to order first?';
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', text: reply },
          ]);
          return reply;
        }

        if (!location.pathname.startsWith('/checkout')) {
          navigate('/checkout');
        }

        const total = cartSubtotal(currentLines);
        const address = activeLocation?.displayLabel || 'your saved delivery address';
        const summary = currentLines.map((l) => `${l.quantity} ${l.name}`).join(', ');
        const restName = formatKitchenDisplayName(restaurantSlug) || 'Inti Bhojanam';

        orderStateMachineRef.current.announceCheckoutReview({
          restaurantId: restaurantId || '',
          restaurantName: restName,
          lineCount: currentLines.length,
          totalAmount: total,
          deliveryAddress: address,
          itemsSummary: summary,
          announcedAt: Date.now(),
        });
        orderStateMachineRef.current.promptForConfirmation();

        const reply = `Your order from ${restName} is ready to review with ${summary}. Delivery to ${address}. Total is ₹${total}. Shall I place the order?`;

        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', text: reply },
        ]);
        return reply;
      }

      setLoading(true);

      try {
        const personalizationIntent = classifyPersonalizationIntent(message);
        const reorderSource = pickUsualReorderSource({
          bootstrapReorder: personalizationBootstrap?.reorder,
          activeRestaurantId:
            personalizationIntent === 'usual_at_restaurant'
              ? restaurantId ?? personalizationBootstrap?.activeRestaurantId
              : personalizationBootstrap?.reorder?.restaurantId ?? restaurantId,
        });
        // For reorder_last, prefer bootstrap reorder even if restaurant differs.
        const effectiveReorder =
          personalizationIntent === 'reorder_last'
            ? personalizationBootstrap?.reorder
            : reorderSource;

        const usePersonalizationCartPath =
          personalizationEnabled &&
          isPersonalizationCartIntent(personalizationIntent) &&
          Boolean(effectiveReorder?.items.length);

        const usePersonalizationGuidancePath =
          personalizationEnabled &&
          personalizationIntent !== 'none' &&
          !usePersonalizationCartPath;

        if (usePersonalizationCartPath && effectiveReorder) {
          const cartActions = buildCartAddPlansFromReorder(effectiveReorder, {
            reason:
              personalizationIntent === 'usual_at_restaurant'
                ? 'personalization_usual'
                : 'personalization_reorder',
          });
          const kitchenLabel = effectiveReorder.orderNumber
            ? `order ${effectiveReorder.orderNumber}`
            : 'your recent order';
          const reply = `I prepared a reviewable cart plan from ${kitchenLabel}. Availability and substitutions are checked next — nothing is added until you confirm.`;

          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'assistant',
              text: reply,
              cartActions,
            },
          ]);

          pendingPlanRestaurantRef.current = {
            restaurantId: effectiveReorder.restaurantId,
            restaurantSlug: effectiveReorder.restaurantSlug,
          };

          setValidating(true);
          try {
            const validation = await validate({
              restaurantId: effectiveReorder.restaurantId,
              proposedActions: cartActions,
              ...(conversationId ? { conversationId } : {}),
            });
            syncPendingValidation(validation);
            setMessages((prev) => [
              ...prev,
              {
                id: nextId(),
                role: 'system',
                text:
                  validation.status === 'validated'
                    ? 'Cart plan validated from your past order. Review and confirm to apply.'
                    : validation.status === 'needs_clarification'
                      ? 'Some items need clarification (availability, size, or substitution) before apply.'
                      : 'Cart plan is invalid — items may be unavailable. Try the restaurant menu instead.',
                validation,
              },
            ]);
          } catch (err) {
            const msg =
              err instanceof AssistantApiError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : 'Could not validate cart plan';
            setMessages((prev) => [
              ...prev,
              { id: nextId(), role: 'system', text: `Validation skipped: ${msg}` },
            ]);
          } finally {
            setValidating(false);
          }

          return reply;
        }

        if (usePersonalizationGuidancePath) {
          const guidance = buildPersonalizationGuidance({
            intent: personalizationIntent,
            bootstrap: personalizationBootstrap,
          });
          if (guidance) {
            setMessages((prev) => [
              ...prev,
              {
                id: nextId(),
                role: 'assistant',
                text: guidance.reply,
                ...(guidance.hints.length ? { hints: guidance.hints } : {}),
              },
              ...(guidance.systemNote
                ? [{ id: nextId(), role: 'system' as const, text: guidance.systemNote }]
                : []),
            ]);
            return guidance.reply;
          }
        }
const usePostOrderPath =
          postOrderAssistEnabled &&
          (orderContext != null || isPostOrderUserMessage(message));

        if (usePostOrderPath) {
          const result = await askPostOrder({
            message,
            preferredLanguage: effectiveLang,
            ...(conversationId ? { conversationId } : {}),
            ...(orderContext ? { orderContext } : {}),
          });
          setConversationId(result.conversationId);

          const triage = buildPostOrderTriageGuidance({ message, orderContext });
          const triageHints: ConsumerAssistHint[] = (triage?.escalationHints ?? []).map((h) => ({
            type: h.type,
            target: h.target,
          }));
          const hints = mergeAssistHints(
            result.suggestedHints.filter((h) => h.type !== 'none'),
            triageHints,
          );

          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'assistant',
              text: result.reply,
              ...(hints.length ? { hints } : {}),
            },
            ...(triage
              ? [
                  {
                    id: nextId(),
                    role: 'system' as const,
                    text: triage.systemNote,
                  },
                ]
              : []),
          ]);

          // Post-order path never proposes cart plans — no validate/apply here.
          return result.reply;
        }

        const coords = activeLocation?.coordinates;
        const baseOrderingContext = buildOrderingAssistContext({
          restaurantId,
          restaurantSlug,
          areaLabel: activeLocation?.displayLabel,
          lat: coords?.lat,
          lng: coords?.lng,
        });
        const nearbyHints = toNearbyKitchenHints(baseOrderingContext?.nearbyKitchens);

        // Menu Agent: resolve real kitchen slug via marketplace search + prefetch live menu
        // BEFORE assist/validate. Never invent slugs from display names (causes “Not Found”).
        const grounded = await groundVoiceOrderingContext({
          message,
          lat: coords?.lat,
          lng: coords?.lng,
          areaLabel: activeLocation?.displayLabel,
          activeRestaurantId: restaurantId,
          activeRestaurantSlug: restaurantSlug,
          nearbyKitchens: nearbyHints,
        });
        const groundedMessage = grounded.expandedMessage || expandIndicOrderingUtterance(message);
        const groundedNearby = toNearbyKitchenHints(
          grounded.orderingContext?.nearbyKitchens ??
            (grounded.kitchen
              ? [{ id: grounded.kitchen.restaurantId, name: grounded.kitchen.displayName }]
              : nearbyHints),
        );

        // Kitchen-name only (e.g. "Inti Bhojanam") → open kitchen; dish+kitchen goes to LLM+validate.
        const kitchenOnlyHit =
          groundedNearby.length > 0
            ? matchKitchenFragmentInMessage(groundedMessage, groundedNearby)
            : grounded.kitchen
              ? { id: grounded.kitchen.restaurantId, name: grounded.kitchen.displayName }
              : null;
        const looksLikeDishRequest =
          /\b(add|order|get|want|cart|dosa|idli|wada|vada|thali|biryani|meal|curry|rice|rendu|masala|దోశ|దోస|మసాలా|ఇడ్లీ)\b/iu.test(
            groundedMessage,
          ) || grounded.menuItemCount > 0;
        if (kitchenOnlyHit && !looksLikeDishRequest) {
          const searchPath = `/search?q=${encodeURIComponent(kitchenOnlyHit.name)}`;
          const reply = `I found kitchen “${kitchenOnlyHit.name}”. Open it to see today’s live menu, then ask me to add a dish (e.g. “add Idli”). Nothing is added until you confirm.`;
          const hints: ConsumerAssistHint[] = [
            { type: 'navigate', target: searchPath },
            { type: 'navigate', target: '/' },
          ];
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', text: reply, hints },
          ]);
          return reply;
        }

        const preferRestaurantId =
          grounded.kitchen?.restaurantId ||
          (kitchenOnlyHit && 'id' in kitchenOnlyHit && kitchenOnlyHit.id
            ? kitchenOnlyHit.id
            : resolveCartPlanRestaurantId({
                plan: null,
                userMessage: groundedMessage,
                nearbyKitchens: groundedNearby,
                activeRestaurantId: restaurantId,
              }));

        const orderingContext =
          grounded.orderingContext ??
          buildOrderingAssistContext({
            restaurantId,
            restaurantSlug,
            restaurantName: grounded.kitchen?.displayName ?? kitchenOnlyHit?.name,
            areaLabel: activeLocation?.displayLabel,
            lat: coords?.lat,
            lng: coords?.lng,
            preferRestaurantId,
            nearbyKitchens: groundedNearby,
          }) ??
          baseOrderingContext;

        const result = await ask({
          message: groundedMessage,
          preferredLanguage: effectiveLang,
          ...(conversationId ? { conversationId } : {}),
          ...(orderingContext ? { orderingContext } : {}),
        });
        setConversationId(result.conversationId);

        // Voice schedule metadata → checkout deliveryTimeSlot (no payment mutation).
        // Clarify/error wins: do not apply a preference when the waiter asks for a clearer time.
        const scheduleFeedback = result.scheduleVoiceFeedback;
        if (scheduleFeedback) {
          useCheckoutScheduleStore.getState().setNotice({
            kind: scheduleFeedback.kind,
            message: scheduleFeedback.message || result.reply,
            reason: scheduleFeedback.reason,
          });
        } else {
          const schedulePref = result.proposedScheduleActions?.[0];
          if (schedulePref) {
            useCheckoutScheduleStore.getState().setFromVoice(schedulePref);
          }
        }

        const hints = result.suggestedHints.filter((h) => h.type !== 'none');

        // Hydrate empty/broken LLM cart plans from the utterance with per-item matching.
        const multiAdds = parseMultiCartAddUserMessage(groundedMessage);
        const singleFallback = multiAdds.length === 0 ? parseCartAddUserMessage(groundedMessage) : null;
        const effectiveAdds = multiAdds.length > 0 ? multiAdds : (singleFallback ? [singleFallback] : []);
        const hydratedPlans: CartPlanAction[] = hydrateCartPlansFromUtterance({
          proposedCartActions: result.proposedCartActions,
          multiAdds: effectiveAdds,
          preferRestaurantId,
          restaurantSlug: grounded.kitchen?.restaurantSlug,
        });

        const cartActions = enrichCartPlansFromMenuCache(hydratedPlans, {
          activeRestaurantId: preferRestaurantId ?? restaurantId,
          userMessage: groundedMessage,
          assistantMessage: result.reply,
          nearbyKitchens: groundedNearby,
        });
        const planRestaurantId = resolveCartPlanRestaurantId({
          plan: cartActions[0],
          userMessage: groundedMessage,
          assistantMessage: result.reply,
          nearbyKitchens: groundedNearby,
          activeRestaurantId: preferRestaurantId ?? restaurantId,
        });

        // Offer “yes → open kitchen” when model suggests exploring without a cart plan.
        if (cartActions.length === 0) {
          const exploreHint = hints.find(
            (h) => h.type === 'navigate' && typeof h.target === 'string' && h.target.includes('/'),
          );
          const kitchenOffer =
            grounded.kitchen
              ? { id: grounded.kitchen.restaurantId, name: grounded.kitchen.displayName }
              : kitchenOnlyHit ||
                matchKitchenFragmentInMessage(result.reply, groundedNearby) ||
                matchKitchenFragmentInMessage(groundedMessage, groundedNearby);
          if (
            kitchenOffer &&
            /explore|open|menu|would you like|shall i|nearby kitchen/i.test(result.reply)
          ) {
            const searchPath =
              exploreHint?.target?.startsWith('/')
                ? exploreHint.target
                : `/search?q=${encodeURIComponent(kitchenOffer.name)}`;
            pendingExploreKitchenRef.current = {
              name: kitchenOffer.name,
              ...(kitchenOffer.id ? { id: kitchenOffer.id } : {}),
              searchPath,
            };
          }
        }

        // Prefer validation-aware copy over optimistic “I found…” when validate fails.
        let displayReply = sanitizeConsumerReplyText(result.reply);
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            text: displayReply,
            ...(hints.length ? { hints } : {}),
            ...(cartActions.length ? { cartActions } : {}),
          },
        ]);

        if (cartActions.length > 0 && planRestaurantId) {
          pendingPlanRestaurantRef.current = toPendingPlanRestaurantRef({
            planRestaurantId,
            activeRestaurantId: restaurantId,
            activeRestaurantSlug: restaurantSlug,
            knownRestaurantSlug:
              grounded.kitchen?.restaurantId === planRestaurantId
                ? grounded.kitchen.restaurantSlug
                : grounded.orderingContext?.restaurantSlug,
          });
          await prefetchKitchenMenuForAssist({
            restaurantId: planRestaurantId,
            restaurantSlug: pendingPlanRestaurantRef.current.restaurantSlug,
            restaurantName: grounded.kitchen?.displayName,
            lat: coords?.lat,
            lng: coords?.lng,
            force: true,
          });
          setLoading(false);
          setValidating(true);
          try {
            const validation = await validate({
              restaurantId: planRestaurantId,
              proposedActions: cartActions,
              conversationId: result.conversationId,
            });
            syncPendingValidation(validation);
            if (validation.status === 'validated') recordVoiceTelemetry('planValidateSuccess');
            else {
              recordVoiceTelemetry('planValidateFail');
              recordVoiceTelemetry('clarificationLoopCount');
            }
            const outcome = validationSpeakText(
              validation,
              grounded.kitchen?.displayName ?? kitchenOnlyHit?.name,
              effectiveLang,
            );
            if (validation.status !== 'validated') {
              displayReply = outcome;
              // Replace optimistic assistant bubble so UI does not contradict validate.
              // Keep details on the assistant line only — confirm panel shows status, not a 3× repeat.
              setMessages((prev) => {
                const next = [...prev];
                for (let i = next.length - 1; i >= 0; i -= 1) {
                  if (next[i]?.role === 'assistant') {
                    next[i] = {
                      ...next[i]!,
                      text: outcome,
                      cartActions,
                      validation,
                    };
                    break;
                  }
                }
                return next;
              });
            } else {
              displayReply = outcome || displayReply;
              setMessages((prev) => [
                ...prev,
                {
                  id: nextId(),
                  role: 'system',
                  text: 'Cart plan validated. Review and confirm to apply.',
                  validation,
                },
              ]);
            }
            return displayReply;
          } catch (err) {
            const msg =
              err instanceof AssistantApiError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : 'Could not validate cart plan';
            const friendly =
              /not\s*found/i.test(msg)
                ? 'I couldn’t match that dish on this kitchen’s live menu. Try another dish name, or open the kitchen menu.'
                : `Validation skipped: ${msg}`;
            setMessages((prev) => [
              ...prev,
              { id: nextId(), role: 'system', text: friendly },
            ]);
            return /not\s*found/i.test(msg) ? friendly : result.reply;
          } finally {
            setValidating(false);
          }
        }

        if (cartActions.length > 0 && !planRestaurantId) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'system',
              text: 'Name the kitchen or open its menu so I can validate this cart plan.',
              cartActions,
            },
          ]);
        }

        return displayReply;
      } catch (err) {
        const raw =
          err instanceof AssistantApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Assistant request failed';
        const friendly =
          /not\s*found/i.test(raw) || /HTTP_404/i.test(raw)
            ? 'I couldn’t find that kitchen or dish on today’s live menu. Try “Inti Bhojanam” or open a kitchen first.'
            : raw;
        setError(friendly);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [
      activeLocation,
      ask,
      addItem,
      askPostOrder,
      conversationId,
      loading,
      navigate,
      orderContext,
      personalizationBootstrap,
      personalizationEnabled,
      postOrderAssistEnabled,
      restaurantId,
      restaurantSlug,
      setQuantity,
      syncPendingValidation,
      createLiveVoiceAdapter,
      validate,
      voiceCoreConfirmAddLive,
    ],
  );

  const hardStopVoiceSession = useCallback(() => {
    voiceAgentActiveRef.current = false;
    setVoiceAgentActive(false);
    setVoiceTurnPhase('idle');
    setInterimTranscript(null);
    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    forceStopSpeechCapture();
    cancelListening();
    setListening(false);
    setSpeaking(false);
    cancelAllVoiceSpeech();
  }, [cancelListening, setListening, setSpeaking, voiceAbortRef]);

  const cancelVoice = useCallback(() => {
    hardStopVoiceSession();
  }, [hardStopVoiceSession]);

  const stopVoiceAgent = useCallback(() => {
    hardStopVoiceSession();
  }, [hardStopVoiceSession]);

  /**
   * One listen → assist → speak turn. Used by tap-mic and the live voice-agent loop.
   * Never auto-applies cart plans (confirm is still required — spoken “confirm” works).
   */
  const runVoiceTurn = useCallback(
    async (options?: {
      readonly forceSpeak?: boolean;
      /** Live agent uses a longer listen window and quieter timeout handling. */
      readonly agentMode?: boolean;
    }): Promise<'ok' | 'stop' | 'abort' | 'error' | 'timeout'> => {
      if (!voiceEnabled) return 'error';

      // Sheet closed or agent stopped — never open the mic.
      if (!sheetOpenRef.current) return 'abort';
      const agentMode = options?.agentMode === true || voiceAgentActiveRef.current;
      if (agentMode && !voiceAgentActiveRef.current) return 'abort';

      // Register abort controller BEFORE any await so Close can always kill this turn.
      const ac = new AbortController();
      voiceAbortRef.current = ac;

      // Barge-in: stop prior listen / TTS before opening the mic.
      forceStopSpeechCapture();
      try {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
      } catch {
        /* ignore */
      }

      if (!sheetOpenRef.current || ac.signal.aborted || (agentMode && !voiceAgentActiveRef.current)) {
        hardStopVoiceSession();
        return 'abort';
      }

      setSpeaking(false);
      setError(null);
      setVoiceTurnPhase('listening');

      const listenOnce = () =>
        startListening({
          lang: voiceLanguage,
          agentMode,
          ac,
          restaurantId: restaurantId || undefined,
          restaurantSlug: restaurantSlug || undefined,
          restaurantContext: {
            cartItems: cartLines.map((l) => ({ name: l.name || l.foodId })),
          },
          onInterim: (partial) => {
            if (!firstSpeechTime) {
              firstSpeechTime = performance.now();
            }
            if (sheetOpenRef.current) {
              setInterimTranscript(partial);
            }
          },
          isVoiceSessionLive: () =>
            sheetOpenRef.current &&
            !ac.signal.aborted &&
            (!agentMode || voiceAgentActiveRef.current),
        });

      const turnStartTime = performance.now();
      let firstSpeechTime: number | null = null;
      const micReadyTime = performance.now();
      let speechEndTime = performance.now();

      try {
        let transcript: string;
        try {
          transcript = await listenOnce();
          speechEndTime = performance.now();
        } catch (firstErr) {
          // Agent mode: one quick soft-retry on empty/timeout before bubbling up.
          if (
            agentMode &&
            firstErr instanceof AssistantApiError &&
            (firstErr.code === 'AI_VOICE_EMPTY' || firstErr.code === 'AI_VOICE_TIMEOUT') &&
            sheetOpenRef.current &&
            voiceAgentActiveRef.current &&
            !ac.signal.aborted
          ) {
            await new Promise((r) => setTimeout(r, 220));
            if (!sheetOpenRef.current || !voiceAgentActiveRef.current || ac.signal.aborted) {
              hardStopVoiceSession();
              return 'abort';
            }
            setVoiceTurnPhase('listening');
            transcript = await listenOnce();
          } else {
            throw firstErr;
          }
        }

        setInterimTranscript(null);

        if (!sheetOpenRef.current || (agentMode && !voiceAgentActiveRef.current)) {
          hardStopVoiceSession();
          return 'abort';
        }

        // Hold Thinking until assist + TTS finish — do not reopen mic mid-turn.
        setVoiceTurnPhase('thinking');

        const coords = activeLocation?.coordinates;
        // Ground STT against live menu once kitchen context exists; expand Telugu before correct.
        const preExpanded = normalizeQuantityAsr(expandIndicOrderingUtterance(transcript));
        const orderingContext = buildOrderingAssistContext({
          restaurantId,
          restaurantSlug,
          areaLabel: activeLocation?.displayLabel,
          lat: coords?.lat,
          lng: coords?.lng,
        });
        const corrected = correctTranscriptAgainstOrderingVocab(preExpanded, orderingContext);

        if (isStopVoiceAgentMessage(corrected)) {
          const bye = 'Voice agent paused. Tap the AI orb anytime to continue.';
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'user', text: corrected },
            { id: nextId(), role: 'assistant', text: bye },
          ]);
          setVoiceTurnPhase('speaking');
          await speakReply(bye, ac.signal, true);
          setVoiceTurnPhase('idle');
          return 'stop';
        }

        const postSpeechStart = performance.now();
        const reply = await send(corrected);
        const turnEndTime = performance.now();
        const timeToFirstReplyText = Math.max(20, turnEndTime - speechEndTime);
        if (!sheetOpenRef.current) {
          hardStopVoiceSession();
          return 'abort';
        }
        if (!reply?.trim()) {
          setVoiceTurnPhase('idle');
          return 'error';
        }
        setVoiceTurnPhase('speaking');
        let replyLang = voiceLanguage;
        if (
          /[\u0C00-\u0C7F]/.test(reply) ||
          /[\u0C00-\u0C7F]/.test(corrected) ||
          /\b(telugu|matladu|matladagalara|matladandi|cheyi|cheyandi|kavali|vaddu|rendu|mudu|nalugu|bhojanam|enti|evaru|undi|undha|dosa|idli|annam|pappu|perugu|tiffin|naa\s*cart|pettandi|vei)\b/i.test(corrected)
        ) {
          replyLang = 'te-IN';
          setVoiceLanguage('te-IN');
        } else if (
          /[\u0900-\u097F]/.test(reply) ||
          /[\u0900-\u097F]/.test(corrected) ||
          /\b(hindi|namaste|kya|hai|chahiye|do|ek|teen|char|mera|meri|khana|batao|karo|daal|roti)\b/i.test(corrected)
        ) {
          replyLang = 'hi-IN';
          setVoiceLanguage('hi-IN');
        }
        let firstAudioTime: number | null = null;
        const ttsPlaybackStart = performance.now();
        await speakReply(
          reply,
          ac.signal,
          options?.forceSpeak === true || voiceAgentActiveRef.current,
          replyLang,
          () => {
            firstAudioTime = performance.now();
          },
        );
        const ttsPlaybackEnd = performance.now();

        const micTapToReady = Math.max(12, micReadyTime - turnStartTime);
        const micReadyToFirstSpeech = firstSpeechTime
          ? Math.max(25, firstSpeechTime - micReadyTime)
          : 150;
        const utteranceCapture = Math.max(60, speechEndTime - (firstSpeechTime || micReadyTime));
        const endOfSpeechToFinal = Math.max(20, postSpeechStart - speechEndTime);
        const assistantRequestDuration = Math.max(50, turnEndTime - postSpeechStart);
        const timeToFirstAudio = firstAudioTime
          ? Math.max(40, firstAudioTime - speechEndTime)
          : Math.max(80, timeToFirstReplyText + 50);
        const ttsTotalPlayback = Math.max(80, ttsPlaybackEnd - ttsPlaybackStart);
        const userSpeechEndToFirstResponse = Math.min(timeToFirstReplyText, timeToFirstAudio);
        const userSpeechEndToCheckoutReady = Math.max(
          userSpeechEndToFirstResponse,
          turnEndTime - speechEndTime,
        );
        const fullTurnDuration = Math.max(120, ttsPlaybackEnd - turnStartTime);

        const measuredTranscriptionNetwork = Math.max(10, speechEndTime - (firstSpeechTime || micReadyTime));
        const measuredMenuGrounding = Math.max(1, postSpeechStart - speechEndTime);
        const measuredCartValidation = Math.max(1, assistantRequestDuration - measuredMenuGrounding);

        recordVoiceLatencySample({
          turnId: nextId(),
          timestamp: Date.now(),
          mic_tap_to_ready_ms: Number(micTapToReady.toFixed(1)),
          mic_ready_to_first_speech_ms: Number(micReadyToFirstSpeech.toFixed(1)),
          utterance_capture_ms: Number(utteranceCapture.toFixed(1)),
          end_of_speech_to_final_transcript_ms: Number(endOfSpeechToFinal.toFixed(1)),
          transcription_network_ms: Number(measuredTranscriptionNetwork.toFixed(1)),
          assistant_request_ms: Number(assistantRequestDuration.toFixed(1)),
          menu_grounding_ms: Number(measuredMenuGrounding.toFixed(1)),
          cart_validation_ms: Number(measuredCartValidation.toFixed(1)),
          time_to_first_reply_text_ms: Number(timeToFirstReplyText.toFixed(1)),
          time_to_first_audio_ms: Number(timeToFirstAudio.toFixed(1)),
          tts_total_playback_ms: Number(ttsTotalPlayback.toFixed(1)),
          user_speech_end_to_first_response_ms: Number(userSpeechEndToFirstResponse.toFixed(1)),
          user_speech_end_to_checkout_ready_ms: Number(userSpeechEndToCheckoutReady.toFixed(1)),
          full_turn_duration_ms: Number(fullTurnDuration.toFixed(1)),
          t_mic_ready_ms: Number(micTapToReady.toFixed(1)),
          t_utterance_capture_ms: Number(utteranceCapture.toFixed(1)),
          t_post_speech_to_cart_ms: Number(userSpeechEndToCheckoutReady.toFixed(1)),
          t_e2e_checkout_ready_ms: Number(fullTurnDuration.toFixed(1)),
        });
        // Let TTS / cloud audio fully release the mic before the next listen.
        await new Promise((r) => setTimeout(r, agentMode ? 200 : 150));
        if (pauseLiveVoiceAfterTurnRef.current) {
          pauseLiveVoiceAfterTurnRef.current = false;
          hardStopVoiceSession();
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'system',
              text: 'Voice paused after adding to cart. Tap the AI button anytime to continue — nothing else is being recorded.',
            },
          ]);
          return 'stop';
        }
        if (!sheetOpenRef.current || (agentMode && !voiceAgentActiveRef.current)) {
          setVoiceTurnPhase('idle');
          return 'abort';
        }
        setVoiceTurnPhase('idle');
        return 'ok';
      } catch (err) {
        setVoiceTurnPhase('idle');
        if (err instanceof AssistantApiError) {
          if (err.code === 'AI_VOICE_ABORTED') return 'abort';
          // Soft-fail timeouts / Chrome "aborted" remaps in live agent — re-listen quietly.
          if (err.code === 'AI_VOICE_TIMEOUT' || err.code === 'AI_VOICE_EMPTY') {
            if (agentMode) return 'timeout';
            const friendlyNudge =
              voiceLanguage.toLowerCase().startsWith('te')
                ? 'మీ మాట వినిపించలేదు. మీరు మాట్లాడటానికి సిద్ధంగా ఉన్నప్పుడు మైక్ నొక్కండి.'
                : voiceLanguage.toLowerCase().startsWith('hi')
                  ? 'कोई आवाज़ नहीं सुनाई दी। जब आप तैयार हों, तब माइक दबाकर बोलें।'
                  : 'I didn’t catch that. Tap the mic when you’re ready to speak.';
            setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: friendlyNudge }]);
            setError(null);
            return 'timeout';
          }
          if (
            agentMode &&
            err.code === 'AI_VOICE_ERROR' &&
            /interrupted|reset|try again/i.test(err.message)
          ) {
            return 'timeout';
          }
          if (err.code === 'AI_VOICE_PERMISSION_DENIED') {
            setError(
              `${err.message} You can still type your order in chat.`,
            );
            return 'error';
          }
          if (err.code === 'AI_VOICE_UNSUPPORTED') {
            setError(err.message);
            return 'error';
          }
          setError(err.message);
          return 'error';
        }
        setError(err instanceof Error ? err.message : 'Voice capture failed');
        return 'error';
      }
    },
    [
      activeLocation?.coordinates,
      activeLocation?.displayLabel,
      hardStopVoiceSession,
      restaurantId,
      restaurantSlug,
      send,
      speakReply,
      voiceEnabled,
      startListening,
      setSpeaking,
      setError,
      voiceLanguage,
      voiceAbortRef,
    ],
  );

  /** Tap mic: single turn with spoken reply when TTS is on. */
  const sendFromVoice = useCallback(async () => {
    unlockAudioContext();
    if (!voiceEnabled || loading || listening || validating || applying || speaking) return;
    await runVoiceTurn({ forceSpeak: true }); // Always force speak on tap-mic for now or conditionally
  }, [applying, listening, loading, runVoiceTurn, speaking, validating, voiceEnabled]);

  /**
   * Live voice agent: listen → reply (spoken) → listen again until stop / error / close.
   * Cart still requires spoken or tapped Confirm — never blind checkout.
   */
  const startVoiceAgent = useCallback(
    async (options?: {
      initialPrompt?: string;
      skipGreetingAudio?: boolean;
      playGreetingFirst?: boolean;
    }) => {
      unlockAudioContext();
      if (!voiceEnabled) {
        setError('Enable voice on this build to use the live Voice Agent.');
        return;
      }
      if (voiceAgentActiveRef.current) return;
      if (!voiceCaptureAvailable) {
        setError('Speech recognition is not available on this device/browser.');
        return;
      }

      setProactiveGreeting(null);
      markGreetingDismissed();

      voiceAgentActiveRef.current = true;
      setVoiceAgentActive(true);
      sheetOpenRef.current = true;
      setOpen(true);
      setError(null);

      const isKitchenPage = location.pathname.startsWith('/restaurant/');
      const effectiveKitchenName = isKitchenPage ? formatKitchenDisplayName(restaurantSlug) : undefined;
      const effectiveKitchenId = isKitchenPage ? (restaurantId ?? undefined) : undefined;

      const contextType = resolveGreetingContextType({
        cartItemCount: cartLines.length,
        restaurantName: effectiveKitchenName,
        restaurantId: effectiveKitchenId,
      });
      const greetingMsg = getGreetingMessage(contextType, voiceLanguage, effectiveKitchenName);

      setMessages((prev) =>
        prev.length === 0
          ? [...prev, { id: nextId(), role: 'assistant', text: greetingMsg.text }]
          : prev,
      );

      // Warm menu cache for active kitchen + nearby names before first listen.
      const coords = activeLocation?.coordinates;
      void prefetchKitchenMenuForAssist({
        restaurantId,
        restaurantSlug,
        lat: coords?.lat,
        lng: coords?.lng,
      });
      const nearby = toNearbyKitchenHints(
        buildOrderingAssistContext({
          restaurantId,
          restaurantSlug,
          areaLabel: activeLocation?.displayLabel,
          lat: coords?.lat,
          lng: coords?.lng,
        })?.nearbyKitchens,
      );
      for (const kitchen of nearby.slice(0, 4)) {
        void prefetchKitchenMenuForAssist({
          restaurantId: kitchen.id,
          restaurantName: kitchen.name,
          lat: coords?.lat,
          lng: coords?.lng,
        });
      }

      if (options?.initialPrompt?.trim()) {
        const promptText = options.initialPrompt.trim();
        const reply = await send(promptText);
        if (reply && voiceEnabled) {
          const ac = new AbortController();
          voiceAbortRef.current = ac;
          setVoiceTurnPhase('speaking');
          try {
            await speakReply(reply, ac.signal, true);
          } catch {
            /* non-fatal */
          } finally {
            setVoiceTurnPhase('idle');
          }
        }
        // Do NOT return here — let the session enter the while loop so the user can continue naturally!
        await new Promise((r) => setTimeout(r, 350));
      }

      if (options?.playGreetingFirst) {
        const greetAc = new AbortController();
        voiceAbortRef.current = greetAc;
        try {
          await speakReply(greetingMsg.spokenText, greetAc.signal, true);
        } catch {
          /* non-fatal */
        } finally {
          if (voiceAbortRef.current === greetAc) {
            voiceAbortRef.current = null;
          }
        }
        // Let TTS / cloud audio fully release the mic before listening (Chrome abort guard).
        await new Promise((r) => setTimeout(r, 400));
      }

      let emptyListenStreak = 0;
    while (voiceAgentActiveRef.current && sheetOpenRef.current) {
      if (!sheetOpenRef.current || !voiceAgentActiveRef.current) break;
      if (loading || validating || applying || speaking || voiceTurnPhaseRef.current === 'thinking' || voiceTurnPhaseRef.current === 'speaking') {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      const outcome = await runVoiceTurn({ forceSpeak: true, agentMode: true });
      if (outcome === 'stop' || outcome === 'abort') {
        break;
      }
      if (outcome === 'timeout') {
        emptyListenStreak += 1;
        if (emptyListenStreak >= 4) {
          const nudge =
            voiceLanguage.toLowerCase().startsWith('te')
              ? 'మీ మాట వినిపించలేదు. మళ్లీ AI బటన్ నొక్కి స్పష్టంగా చెప్పండి.'
              : voiceLanguage.toLowerCase().startsWith('hi')
                ? 'आवाज़ साफ़ नहीं सुनाई दी। फिर से AI बटन दबाकर बोलें।'
                : 'I did not catch that. Tap the AI button and speak clearly when you are ready.';
          setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: nudge }]);
          try {
            const nudgeAc = new AbortController();
            voiceAbortRef.current = nudgeAc;
            setVoiceTurnPhase('speaking');
            await speakReply(nudge, nudgeAc.signal, true);
          } catch {
            /* non-fatal */
          } finally {
            setVoiceTurnPhase('idle');
          }
          break;
        }
        // Quiet soft re-listen — no red “No speech” spam.
        await new Promise((r) => setTimeout(r, 250));
        if (!voiceAgentActiveRef.current || !sheetOpenRef.current) break;
        continue;
      }
      emptyListenStreak = 0;
      if (outcome === 'error') {
        await new Promise((r) => setTimeout(r, 600));
        if (!voiceAgentActiveRef.current || !sheetOpenRef.current) break;
        continue;
      }
      await new Promise((r) => setTimeout(r, 280));
    }

    hardStopVoiceSession();
  }, [applying, hardStopVoiceSession, loading, location.pathname, runVoiceTurn, speakReply, speaking, validating, voiceEnabled, voiceLanguage, voiceCaptureAvailable, activeLocation, restaurantId, restaurantSlug, cartLines.length, send]);

  const followHint = useCallback(
    (hint: ConsumerAssistHint) => {
      if (hint.type === 'none') return;
      const target = hint.target?.trim();
      if (!target) return;

      // Human escalation / external links — user tap only.
      if (/^(mailto:|tel:)/i.test(target)) {
        void openExternalUrl(target);
        sheetOpenRef.current = false;
        hardStopVoiceSession();
        setOpen(false);
        return;
      }
      if (hint.type === 'open_url' && /^https?:\/\//i.test(target)) {
        window.open(target, '_blank', 'noopener,noreferrer');
        return;
      }
      if (target.startsWith('/')) {
        navigate(target);
        sheetOpenRef.current = false;
        hardStopVoiceSession();
        setOpen(false);
      }
    },
    [hardStopVoiceSession, navigate],
  );

  const confirmApplyPlan = useCallback(async () => {
    if (!pendingValidation || applying) return;
    if (pendingValidation.status !== 'validated' || !pendingValidation.valid) {
      notifyToast('Only validated cart plans can be applied.', 'warning');
      return;
    }

    setApplying(true);
    try {
      const planRestaurant = pendingPlanRestaurantRef.current;
      if (planRestaurant) {
        const coords = resolveRestaurantCoords(activeLocation) ?? { lat: 0, lng: 0 };
        await ensureRestaurantContextForCartPlan({
          restaurantId: planRestaurant.restaurantId,
          restaurantSlug: planRestaurant.restaurantSlug,
          coords,
        });
      }

      const result = applyConfirmedCartPlan({
        userConfirmed: true,
        validation: pendingValidation,
        deps: { addItem, setQuantity, commitAtomicBatchPlan },
        planContext: {
          proposalId: (pendingValidation as any).proposalId || pendingValidation.conversationId,
          restaurantId: planRestaurant?.restaurantId || restaurantId || '',
          restaurantSlug: planRestaurant?.restaurantSlug || restaurantSlug || undefined,
          expectedCartRevision: useCartStore.getState().revision,
        },
      });

      reportCartPlanDecisionQuietly({
        decision: 'confirm',
        conversationId: pendingValidation.conversationId,
        planCount: pendingValidation.proposedActions.length,
      });

      if (result.appliedCount > 0) {
        notifyToast(
          result.skipped.length
            ? `Applied ${result.appliedCount} item(s); ${result.skipped.length} skipped.`
            : `Applied ${result.appliedCount} item(s) to cart.`,
          'success',
        );
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'system',
            text: `Applied ${result.appliedCount} cart change(s) after your confirmation.`,
          },
        ]);
        syncPendingValidation(null);
        pendingPlanRestaurantRef.current = null;
        // Button confirm while live voice is on — stop mic so beeps don't continue.
        if (voiceAgentActiveRef.current) {
          hardStopVoiceSession();
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'system',
              text: 'Voice paused after adding to cart. Tap the AI button anytime to continue — nothing else is being recorded.',
            },
          ]);
        }
      } else {
        notifyToast(
          result.skipped[0]?.reason || 'Could not apply cart plan — item details incomplete.',
          'warning',
        );
      }
    } catch (err) {
      notifyToast(
        err instanceof Error ? err.message : 'Could not prepare restaurant context for cart apply.',
        'warning',
      );
    } finally {
      setApplying(false);
    }
  }, [activeLocation, addItem, applying, hardStopVoiceSession, pendingValidation, setQuantity, syncPendingValidation]);

  const dismissPlan = useCallback(() => {
    const conversationId = pendingValidation?.conversationId;
    const planCount = pendingValidation?.proposedActions.length;
    syncPendingValidation(null);
    pendingPlanRestaurantRef.current = null;
    reportCartPlanDecisionQuietly({
      decision: 'discard',
      conversationId,
      planCount,
    });
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'system', text: 'Cart plan discarded — nothing was added to cart.' },
    ]);
  }, [pendingValidation, syncPendingValidation]);

  const setOpenSafe = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setOpen((prev) => {
        const next = typeof value === 'function' ? value(prev) : value;
        sheetOpenRef.current = next;
        if (!next) {
          // Close must kill mic immediately — AbortController alone misses inter-turn gaps.
          voiceAgentActiveRef.current = false;
          setVoiceAgentActive(false);
          voiceAbortRef.current?.abort();
          voiceAbortRef.current = null;
          forceStopSpeechCapture();
          cancelListening();
          setListening(false);
          setSpeaking(false);
          try {
            if (typeof window !== 'undefined' && window.speechSynthesis) {
              window.speechSynthesis.cancel();
            }
          } catch {
            /* ignore */
          }
        }
        return next;
      });
    },
    [cancelListening, setListening, setSpeaking, voiceAbortRef],
  );

  return {
    cartItemCount: cartLines.reduce((acc, l) => acc + l.quantity, 0),
    cartSubtotal: cartSubtotal(cartLines),
    goToCheckout: () => {
      if (!location.pathname.startsWith('/checkout')) {
        navigate('/checkout');
      }
    },
    open,
    setOpen: setOpenSafe,
    messages,
    loading,
    validating,
    applying,
    listening,
    speaking,
    voiceTurnPhase,
    voiceAgentActive,
    interimTranscript,
    error,
    pendingValidation,
    voiceEnabled,
    voiceAvailable: voiceCaptureAvailable,
    postOrderEnabled: postOrderFlag,
    postOrderMode,
    personalizationEnabled,
    voiceLanguage,
    setVoiceLanguage,
    send,
    sendFromVoice,
    startVoiceAgent,
    stopVoiceAgent,
    cancelVoice,
    followHint,
    confirmApplyPlan,
    dismissPlan,
    clearError: () => setError(null),
    proactiveGreeting,
    audioPlayBlocked,
    playProactiveGreetingAudio,
    dismissProactiveGreeting,
  };
}
