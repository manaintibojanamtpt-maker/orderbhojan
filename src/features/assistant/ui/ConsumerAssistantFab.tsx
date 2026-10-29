interface ConsumerAssistantFabProps {
  readonly open: boolean;
  readonly listening?: boolean;
  readonly voiceAgentActive?: boolean;
  readonly onToggle: () => void;
}

/**
 * Premium OrderBhojan AI Voice Trigger Orb (Screenshot 10 parity)
 * Positioned in the bottom dock alongside navigation pill.
 * Features distinct circular glowing pulse and Warm Charcoal / Warm Amber styling.
 */
export function ConsumerAssistantFab({
  open,
  listening = false,
  voiceAgentActive = false,
  onToggle,
}: ConsumerAssistantFabProps) {
  const live = listening || voiceAgentActive;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="group fixed z-[85] flex h-12 w-12 items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8720C]/70"
      style={{
        left: '16px',
        bottom: 'calc(76px + var(--ob-safe-bottom, 0px))',
      }}
      aria-label={
        open
          ? 'Close OrderBhojan Voice Agent'
          : 'Open OrderBhojan Voice Agent — live voice ordering'
      }
      aria-expanded={open}
      data-testid="consumer-assistant-fab"
    >
      {/* Soft ambient glow ring */}
      <span
        className={
          live
            ? 'absolute inset-0 animate-ping rounded-full bg-[#E8720C]/40'
            : 'absolute inset-0 rounded-full bg-[#E8720C]/10 opacity-0 transition group-hover:opacity-100'
        }
        aria-hidden="true"
      />
      <span
        className={
          live
            ? 'relative flex h-12 w-12 items-center justify-center rounded-full bg-[#E8720C] shadow-[0_8px_24px_rgba(232,114,12,0.45)] transition'
            : 'relative flex h-12 w-12 items-center justify-center rounded-full border border-[var(--ob-border)] bg-[var(--ob-surface)] shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition group-hover:scale-[1.05] group-hover:border-[#E8720C]/60'
        }
      >
        {open && !live ? (
          <span className="text-lg font-semibold text-[var(--ob-text-primary)]">×</span>
        ) : (
          <span className="flex flex-col items-center justify-center gap-0.5">
            {/* Waveform mark — reads as voice AI, not generic chat */}
            <span className="flex h-3.5 items-end gap-[2.5px]" aria-hidden="true">
              <span
                className={
                  live
                    ? 'h-1.5 w-[2.5px] animate-pulse rounded-full bg-black/90'
                    : 'h-1.5 w-[2.5px] rounded-full bg-[#E8720C]'
                }
              />
              <span
                className={
                  live
                    ? 'h-3.5 w-[2.5px] animate-pulse rounded-full bg-black/95 [animation-delay:75ms]'
                    : 'h-3.5 w-[2.5px] rounded-full bg-[#E8720C]'
                }
              />
              <span
                className={
                  live
                    ? 'h-2.5 w-[2.5px] animate-pulse rounded-full bg-black/90 [animation-delay:150ms]'
                    : 'h-2.5 w-[2.5px] rounded-full bg-[#E8720C]'
                }
              />
              <span
                className={
                  live
                    ? 'h-3 w-[2.5px] animate-pulse rounded-full bg-black/95 [animation-delay:225ms]'
                    : 'h-3 w-[2.5px] rounded-full bg-[#E8720C]'
                }
              />
            </span>
            <span
              className={
                live
                  ? 'text-[7.5px] font-bold tracking-[0.14em] text-black/90'
                  : 'text-[7.5px] font-bold tracking-[0.14em] text-[#E8720C]'
              }
            >
              AI
            </span>
          </span>
        )}
      </span>
    </button>
  );
}
