import { GlassCard } from '../primitives/GlassCard';
import type { CartSummaryViewModel } from './types';

export interface CartSummaryViewProps {
  readonly summary: CartSummaryViewModel;
}

export function CartSummaryView({ summary }: CartSummaryViewProps) {
  return (
    <GlassCard hoverEffect={false} className="!rounded-[1.25rem] !border-[var(--ob-border)] !bg-[var(--ob-surface)] !p-4" aria-label="Cart summary">
      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#A89B8C]">Order summary</p>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-[#A89B8C]">Subtotal</span>
        <span className="text-base font-bold text-[#FFF8F0]">{summary.subtotalLabel}</span>
      </div>
      <div className="mt-3 flex items-baseline justify-between border-t border-white/[0.08] pt-3">
        <span className="text-sm font-semibold text-[#FFF8F0]">Items</span>
        <span className="text-sm font-bold text-[#f4a261]">{summary.itemCountLabel}</span>
      </div>
    </GlassCard>
  );
}
