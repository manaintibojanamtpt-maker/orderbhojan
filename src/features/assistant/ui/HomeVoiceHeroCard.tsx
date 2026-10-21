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
      className="relative overflow-hidden rounded-xl border border-[#FF7A00]/30 bg-gradient-to-br from-[#1A110B] via-[#120D0A] to-[#0A0705] p-3 sm:p-4 shadow-[0_8px_24px_-8px_rgba(255,122,0,0.25)]"
      data-testid="home-voice-hero-card"
    >
      {/* Decorative ambient glows — subtle */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#FF7A00]/10 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-8 -bottom-8 h-20 w-20 rounded-full bg-[#FFA043]/10 blur-2xl"
        aria-hidden
      />

      <div className="relative flex flex-col gap-2.5">
        {/* Header row: badge + language */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <span className="inline-flex items-center gap-1 rounded-full border border-[#FF7A00]/40 bg-[#FF7A00]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FF9E40] tracking-wide">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FF7A00] animate-pulse" />
              AI Voice Ordering
            </span>
            <span className="text-[10px] text-zinc-400">
              తెలుగు · हिंदी · English
            </span>
          </div>
        </div>

        {/* Compact CTA row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white leading-snug">
              What would you like to eat?
            </h2>
            <p className="text-[11px] sm:text-xs text-zinc-300 leading-snug">
              Speak naturally — order in your language.
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleOpenVoice()}
            className="group relative flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#E05A00] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(255,122,0,0.35)] transition hover:scale-[1.02] hover:shadow-[0_6px_20px_rgba(255,122,0,0.45)] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]"
            aria-label="Tap to speak and order food with AI voice"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-black/20 group-hover:bg-black/30 transition">
              <svg
                className="h-3 w-3 text-white animate-pulse"
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

        {/* Quick voice prompts — compact */}
        <div className="pt-0.5">
          <p className="mb-1 text-[10px] font-medium text-zinc-400">
            Try saying:
          </p>
          <div className="flex flex-wrap gap-1">
            {SAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt.label}
                type="button"
                onClick={() => handleOpenVoice(prompt.label)}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-0.5 text-left text-[11px] text-zinc-300 transition hover:border-[#FF7A00]/50 hover:bg-[#FF7A00]/10 hover:text-white"
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
