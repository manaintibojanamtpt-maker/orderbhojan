import { useCallback } from 'react';

const SAMPLE_PROMPTS = [
  { label: '2 Masala Dosa add cheyi', lang: 'te' },
  { label: 'Mutton Biryani from Mana Inti', lang: 'en' },
  { label: '2 Veg Meals cart mein dalo', lang: 'hi' },
  { label: 'Gulab Jamun rendu kavali', lang: 'te' },
];

export function HomeVoiceHeroCard() {
  const handleOpenVoice = useCallback((initialPrompt?: string) => {
    window.dispatchEvent(
      new CustomEvent('ob-voice-agent-open', {
        detail: { initialPrompt },
      }),
    );
  }, []);

  return (
    <section
      aria-label="Voice-first food ordering"
      className="relative overflow-hidden rounded-2xl border border-[var(--ob-border)] bg-[var(--ob-surface)] p-3.5 sm:p-4"
      data-testid="home-voice-hero-card"
    >
      <div className="relative flex flex-col gap-2.5">
        {/* Header row: badge + language */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-[#FF9E40] tracking-wide">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E8720C]" />
              AI Voice Ordering
            </span>
            <span className="text-[11px] text-white/50">
              తెలుగు · हिंदी · English
            </span>
          </div>
        </div>

        {/* Compact CTA row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-[#FFF8F0] leading-snug">
              What would you like to eat?
            </h2>
            <p className="text-xs text-white/60 leading-snug">
              Speak naturally — order in your language.
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleOpenVoice()}
            className="group relative flex items-center justify-center gap-2 rounded-xl bg-[#E8720C] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#D96304] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8720C]"
            aria-label="Tap to speak and order food with AI voice"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-black/20 group-hover:bg-black/30 transition">
              <svg
                className="h-3 w-3 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </span>
            <span>Tap to speak</span>
          </button>
        </div>

        {/* Quick voice prompts */}
        <div className="pt-1 border-t border-white/[0.06]">
          <p className="mb-1.5 text-[11px] font-medium text-white/50">
            Try saying:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt.label}
                type="button"
                onClick={() => handleOpenVoice(prompt.label)}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-left text-xs text-white/80 transition hover:border-white/25 hover:bg-white/[0.06] hover:text-white"
                title={`Try saying: ${prompt.label}`}
              >
                &ldquo;{prompt.label}&rdquo;
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
