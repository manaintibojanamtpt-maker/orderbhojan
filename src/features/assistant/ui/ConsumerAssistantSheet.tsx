import { useEffect, useMemo, useState } from 'react';
import { Mic, Square, X, AlertCircle, Edit2, Check } from 'lucide-react';
import type { CartPlanValidationResult } from '../domain/cartPlanContract';
import type { AssistantThreadMessage } from './useAssistantConversation';
import type { ConsumerAssistHint } from '../types';

function triggerHaptic(type: 'light' | 'medium' | 'success' | 'error' = 'light') {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      if (type === 'light') navigator.vibrate(15);
      else if (type === 'medium') navigator.vibrate(35);
      else if (type === 'success') navigator.vibrate([20, 40, 20]);
      else if (type === 'error') navigator.vibrate([40, 60, 40]);
    } catch {}
  }
}

export const ORDERING_STARTERS = [
  'What vegetarian options look good?',
  'Help me pick something mild',
  'Explain delivery fees',
] as const;

export const PERSONALIZATION_STARTERS = [
  'Reorder my last order',
  'Order my usual',
  'Show my favorite kitchens',
] as const;

export const POST_ORDER_STARTERS = [
  'Where is my order?',
  'Why is delivery taking long?',
  'How do I reorder the same items?',
  'Something looks wrong with my order',
  'My payment didn’t go through',
  'I need a refund for this order',
  'How do I cancel this order?',
] as const;

/**
 * 4-dot voice sparkle icon matching Zomato reference Screenshots 4 & 7,
 * styled in OrderBhojan's Warm Charcoal / Amber / Cream tokens.
 */
export function VoiceSparkleDots({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-[3px] align-middle mr-2 shrink-0 ${className}`}
      aria-hidden="true"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#E8720C] animate-pulse" />
      <span className="h-2 w-2 rounded-full bg-[#f4a261] animate-pulse [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-[#E8720C] animate-pulse [animation-delay:240ms]" />
      <span className="h-1 w-1 rounded-full bg-[#F5EBE1] animate-pulse [animation-delay:360ms]" />
    </span>
  );
}

interface ConsumerAssistantSheetProps {
  readonly messages: readonly AssistantThreadMessage[];
  readonly loading: boolean;
  readonly validating: boolean;
  readonly applying: boolean;
  readonly listening?: boolean;
  readonly speaking?: boolean;
  readonly voiceTurnPhase?: 'idle' | 'listening' | 'thinking' | 'speaking';
  readonly voiceAgentActive?: boolean;
  readonly interimTranscript?: string | null;
  readonly error: string | null;
  readonly pendingValidation: CartPlanValidationResult | null;
  readonly voiceEnabled?: boolean;
  readonly voiceAvailable?: boolean;
  readonly personalizationEnabled?: boolean;
  readonly assistMode?: 'ordering' | 'post_order';
  readonly voiceLanguage?: string;
  readonly onVoiceLanguageChange?: (lang: string) => void;
  readonly onClose: () => void;
  readonly onSend: (text: string) => void;
  readonly onVoiceStart?: () => void;
  readonly onVoiceCancel?: () => void;
  readonly onStartVoiceAgent?: () => void;
  readonly onStopVoiceAgent?: () => void;
  readonly onFollowHint: (hint: ConsumerAssistHint) => void;
  readonly onConfirmPlan: () => void;
  readonly onDismissPlan: () => void;
  readonly onClearError: () => void;
  readonly cartItemCount?: number;
  readonly cartSubtotal?: number;
  readonly onGoToCheckout?: () => void;
}

/**
 * Non-Blocking Top Voice Dock (~140–170px height)
 * Replaces any blocking full-screen or bottom modal per Zomato reference screenshots.
 * Anchored at the top of the viewport with a subtle warm ambient glow,
 * leaving the underlying menu and cart 100% visible, interactive, and scrollable.
 */
export function ConsumerAssistantSheet({
  messages,
  loading,
  validating,
  applying,
  listening = false,
  speaking = false,
  voiceTurnPhase = 'idle',
  voiceAgentActive = false,
  interimTranscript = null,
  error,
  pendingValidation,
  voiceEnabled = false,
  voiceAvailable = false,
  assistMode = 'ordering',
  voiceLanguage = 'en-IN',
  onVoiceLanguageChange,
  onClose,
  onSend,
  onVoiceStart,
  onVoiceCancel,
  onStartVoiceAgent,
  onStopVoiceAgent,
  onConfirmPlan,
  onDismissPlan,
  onClearError,
  cartItemCount = 0,
  cartSubtotal = 0,
  onGoToCheckout,
}: ConsumerAssistantSheetProps) {
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  // Sync CSS dock height variable for underlying screen padding
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--ob-voice-dock-height', '155px');
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.documentElement.style.removeProperty('--ob-voice-dock-height');
      }
    };
  }, []);

  const lastUserMessage = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'user')?.text,
    [messages],
  );

  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant')?.text,
    [messages],
  );

  const isThinking =
    voiceTurnPhase === 'thinking' || loading || validating || applying;
  const isSpeaking = voiceTurnPhase === 'speaking' || speaking;
  const isListening = voiceTurnPhase === 'listening' || listening;

  const canConfirm =
    pendingValidation?.status === 'validated' &&
    pendingValidation.valid &&
    !applying &&
    !loading &&
    !listening;

  // Active status label
  const statusLabel = isThinking
    ? 'Processing...'
    : isSpeaking
      ? 'Speaking'
      : isListening
        ? 'Listening...'
        : 'Voice Ready';

  // Primary text to display in top dock (max 2–3 lines)
  let displayText = '';
  let showSparkle = false;

  if (interimTranscript) {
    displayText = interimTranscript;
    showSparkle = true;
  } else if (isThinking && lastUserMessage) {
    displayText = lastUserMessage;
    showSparkle = true;
  } else if (lastAssistantMessage) {
    displayText = lastAssistantMessage;
    showSparkle = false;
  } else if (assistMode === 'post_order') {
    displayText =
      'Where is my order? This chat is for triage only — it never cancels, refunds, or promises outcomes.';
  } else {
    displayText = 'Speak or type in Telugu, Hindi, or English';
  }

  const showStopPill = isThinking || isSpeaking;

  const handleStop = () => {
    triggerHaptic('medium');
    if (onVoiceCancel) onVoiceCancel();
    else if (onStopVoiceAgent) onStopVoiceAgent();
  };

  const handleMicToggle = () => {
    triggerHaptic('light');
    if (isListening || voiceAgentActive) {
      if (onStopVoiceAgent) onStopVoiceAgent();
      else if (onVoiceCancel) onVoiceCancel();
    } else {
      if (onStartVoiceAgent) onStartVoiceAgent();
      else if (onVoiceStart) onVoiceStart();
    }
  };

  return (
    <header
      className="fixed inset-x-0 top-0 z-[88] flex flex-col justify-between overflow-hidden border-b border-[var(--ob-border)] bg-[var(--ob-surface)]/98 px-4 py-3 shadow-[0_12px_36px_rgba(232,114,12,0.18)] backdrop-blur-md rounded-b-2xl transition-all"
      style={{
        height: '155px',
        maxHeight: '170px',
        minHeight: '140px',
      }}
      role="region"
      aria-live="polite"
      aria-label="OrderBhojan Voice Assistant"
      data-testid="consumer-assistant-sheet"
    >
      {/* Top Ambient Glow Edge */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#E8720C]/60 to-transparent"
        aria-hidden="true"
      />

      {/* Main Transcript / Spoken Reply Typography Region (Screenshots 1, 2, 4, 6, 7) */}
      <div className="flex-1 overflow-hidden pt-1">
        <div className="flex items-start justify-between gap-2">
          {isEditingTranscript ? (
            <div className="flex items-center gap-2 w-full">
              <input
                type="text"
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editDraft.trim()) {
                    onSend(editDraft.trim());
                    setIsEditingTranscript(false);
                  }
                }}
                className="flex-1 bg-white/10 border border-[#E8720C]/60 rounded-lg px-2.5 py-1 text-sm text-[var(--ob-text-primary)] focus:outline-none focus:ring-1 focus:ring-[#E8720C]"
                autoFocus
                placeholder="Type your correction..."
              />
              <button
                type="button"
                onClick={() => {
                  if (editDraft.trim()) {
                    onSend(editDraft.trim());
                    setIsEditingTranscript(false);
                  }
                }}
                className="p-1 rounded bg-[#E8720C] text-black hover:bg-[#E8720C]/80"
                title="Send corrected text"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsEditingTranscript(false)}
                className="p-1 rounded bg-white/10 text-[var(--ob-text-secondary)] hover:text-white"
                title="Cancel edit"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              className="flex items-start group cursor-pointer flex-1"
              onClick={() => {
                if (displayText && displayText !== 'Speak or type in Telugu, Hindi, or English') {
                  setEditDraft(displayText);
                  setIsEditingTranscript(true);
                }
              }}
              title="Tap to correct text"
            >
              <p
                className="text-base font-medium leading-snug text-[var(--ob-text-primary)] line-clamp-3 md:text-lg"
                data-testid="voice-dock-transcript"
              >
                {showSparkle && <VoiceSparkleDots />}
                {displayText}
              </p>
              {displayText && displayText !== 'Speak or type in Telugu, Hindi, or English' && (
                <Edit2 className="h-3.5 w-3.5 ml-2 text-[var(--ob-text-secondary)] opacity-0 group-hover:opacity-70 transition shrink-0 mt-1" />
              )}
            </div>
          )}

          {/* Live Floating Cart Indicator (Zomato-inspired) */}
          {cartItemCount > 0 && !isEditingTranscript && (
            <button
              type="button"
              onClick={onGoToCheckout}
              className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/25 active:scale-95 shrink-0"
              aria-label={`View cart with ${cartItemCount} items, total ₹${cartSubtotal}`}
              data-testid="voice-dock-cart-pill"
            >
              <span>🛒</span>
              <span>{cartItemCount} • ₹{cartSubtotal}</span>
              <span className="text-[10px] text-emerald-300 font-bold ml-0.5">Checkout →</span>
            </button>
          )}
        </div>

        {error && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-rose-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{error}</span>
            <button
              type="button"
              onClick={onClearError}
              className="ml-1 text-[11px] underline opacity-80 hover:opacity-100"
            >
              dismiss
            </button>
          </div>
        )}

        {/* Validation clarification questions */}
        {pendingValidation && pendingValidation.clarificationQuestions?.length > 0 && (
          <ul
            className="mt-1 text-xs text-[#f4a261]"
            data-testid="consumer-assistant-clarifications"
          >
            {pendingValidation.clarificationQuestions.map((q, i) => (
              <li key={i} className="truncate">
                {q}
              </li>
            ))}
          </ul>
        )}

        {/* Hidden cues for continuous multilingual listening */}
        <span className="sr-only">
          Listening continuously in Telugu, Hindi, or English. Listening for "Confirm" or next item.
        </span>
      </div>

      {/* Controls & Status Row */}
      <div className="flex shrink-0 items-center justify-between pt-2">
        {/* Left Side: Status label & Inline [■ Stop] Pill Button (Screenshots 4 & 7) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {isListening && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E8720C] opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#E8720C]" />
              </span>
            )}
            {isSpeaking && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
            )}
            {isThinking && (
              <span className="h-2.5 w-2.5 rounded-full bg-[#f4a261] animate-pulse" />
            )}
            <span
              className={`text-xs font-semibold tracking-wide ${
                isListening
                  ? 'text-[#f4a261]'
                  : isSpeaking
                    ? 'text-emerald-400'
                    : isThinking
                      ? 'text-[#f4a261]'
                      : 'text-[var(--ob-text-secondary)]'
              }`}
              data-testid="voice-dock-status"
            >
              {statusLabel}
            </span>
          </div>

          {showStopPill && (
            <button
              type="button"
              onClick={handleStop}
              className="flex items-center gap-1.5 rounded-full border border-[#E8720C]/50 bg-[#E8720C]/15 px-3 py-1 text-xs font-semibold text-[#f4a261] transition hover:bg-[#E8720C]/25 active:scale-95 touch-manipulation"
              aria-label="Stop current speech or processing"
              data-testid="voice-dock-stop-pill"
            >
              <Square className="h-3 w-3 fill-current" />
              <span>Stop</span>
            </button>
          )}

          {/* Validation Confirm Chip when plan awaiting confirmation */}
          {pendingValidation && pendingValidation.proposedActions?.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!canConfirm}
                onClick={() => void onConfirmPlan()}
                title={
                  canConfirm
                    ? 'Confirm & add to cart'
                    : 'Confirm stays disabled until the plan is validated'
                }
                className="flex items-center gap-1 rounded-full bg-[#E8720C] px-2.5 py-0.5 text-[11px] font-semibold text-black transition disabled:opacity-40"
              >
                {applying ? 'Applying…' : 'Confirm & add to cart'}
              </button>
              <button
                type="button"
                onClick={() => void onDismissPlan()}
                title="Dismiss proposed changes"
                className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-[var(--ob-text-secondary)] hover:text-white"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Compact language pills (EN, TE, HI) */}
          {voiceEnabled && (
            <div className="hidden items-center gap-1 sm:flex" role="radiogroup" aria-label="Voice Language">
              {[
                { id: 'en-IN', label: 'EN' },
                { id: 'te-IN', label: 'తెలుగు' },
                { id: 'hi-IN', label: 'हिंदी' },
              ].map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onVoiceLanguageChange?.(l.id)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
                    voiceLanguage === l.id
                      ? 'bg-[#E8720C] text-black font-semibold'
                      : 'bg-white/5 text-[var(--ob-text-secondary)] hover:text-white'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Circular 44x44px Mic Toggle & Circular 44x44px Close (✕) Buttons */}
        <div className="flex items-center gap-2">
          {voiceEnabled && voiceAvailable && (
            <button
              type="button"
              onClick={handleMicToggle}
              title="Speak your question"
              className={`flex h-11 w-11 items-center justify-center rounded-full transition touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8720C] ${
                isListening
                  ? 'bg-[#E8720C] text-white shadow-[0_0_16px_rgba(232,114,12,0.6)] animate-pulse'
                  : 'border border-[var(--ob-border)] bg-white/5 text-[var(--ob-text-primary)] hover:border-[#E8720C]/50 hover:bg-white/10'
              }`}
              aria-label={isListening ? 'Stop listening' : 'Start live voice'}
              data-testid="consumer-assistant-mic"
            >
              <Mic className="h-5 w-5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ob-border)] bg-white/5 text-[var(--ob-text-secondary)] transition hover:border-white/20 hover:text-[var(--ob-text-primary)] active:scale-95 touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            aria-label="Close voice assistant"
            data-testid="voice-dock-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
