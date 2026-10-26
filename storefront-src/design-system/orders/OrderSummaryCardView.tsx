import { ChevronRight } from 'lucide-react';
import { GlassCard } from '../primitives/GlassCard';
import type { OrderSummaryCardViewModel } from './types';

const statusToneClass: Record<OrderSummaryCardViewModel['statusTone'], string> = {
  active: 'bg-[#E8720C]/15 text-[#FF9E40]',
  complete: 'bg-emerald-500/15 text-emerald-300',
  cancelled: 'bg-red-500/15 text-red-300',
};

export interface OrderSummaryCardViewProps {
  readonly order: OrderSummaryCardViewModel;
  readonly onSelect: () => void;
}

export function OrderSummaryCardView({ order, onSelect }: OrderSummaryCardViewProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={order.ariaLabel}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className="cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#E8720C]/50"
    >
      <GlassCard hoverEffect className="!rounded-2xl !p-3.5 sm:!p-4 transition hover:border-[var(--ob-border-strong)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-[var(--ob-text-secondary)]">Order #{order.orderNumber}</p>
            <p className="truncate font-semibold tracking-tight text-[var(--ob-text-primary)]">{order.displayName}</p>
            <p className="text-xs text-[var(--ob-text-secondary)]">{order.dateLabel}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusToneClass[order.statusTone]}`}
          >
            {order.statusLabel}
          </span>
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t border-[var(--ob-border)] pt-2.5">
          <span className="text-base font-bold text-[var(--ob-text-primary)]">{order.totalLabel}</span>
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#E8720C]">
            {order.trackLabel}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </GlassCard>
    </div>
  );
}
