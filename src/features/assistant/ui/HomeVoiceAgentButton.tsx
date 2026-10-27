/**
 * Premium AI control placed next to home search — opens live Voice Agent.
 */
import { Mic } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';

export function HomeVoiceAgentButton() {
  return (
    <button
      type="button"
      onClick={() => {
        triggerHaptic('light');
        window.dispatchEvent(new CustomEvent('ob-voice-agent-open'));
      }}
      className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-r from-[#FA7A1E] to-[#E8720C] text-white shadow-[0_2px_10px_rgba(232,114,12,0.35)] transition-all hover:brightness-105 active:scale-95 touch-manipulation"
      aria-label="OrderBhojan Voice Assistant — speak to order"
      title="Voice Assistant"
      data-testid="home-voice-agent-button"
    >
      <Mic className="h-4 w-4" aria-hidden />
    </button>
  );
}
