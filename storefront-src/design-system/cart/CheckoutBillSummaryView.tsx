import { GlassCard } from '../primitives/GlassCard';
import type { CheckoutBillSummaryViewModel } from './types';

export interface CheckoutBillSummaryViewProps {
  readonly bill: CheckoutBillSummaryViewModel;
}

export function CheckoutBillSummaryView({ bill }: CheckoutBillSummaryViewProps) {
  return (
    <GlassCard hoverEffect={false} className="!rounded-[1.25rem] !border-[var(--ob-border)] !bg-[var(--ob-surface)] !p-4" aria-label="Bill summary">
      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#A89B8C]">Bill breakdown</p>
      {bill.lines.map((item) => (
        <div key={item.label} className="mb-2.5 flex items-baseline justify-between gap-4">
          <span className="text-sm text-[#A89B8C]">{item.label}</span>
          <span className="text-sm font-medium tabular-nums text-[#FFF8F0]/90">{item.amountLabel}</span>
        </div>
      ))}
      <div className="mt-4 flex items-baseline justify-between border-t border-[#E8720C]/20 pt-4">
        <span className="text-base font-extrabold text-[#FFF8F0]">Total</span>
        <span className="text-lg font-black tabular-nums text-[#E8720C]">{bill.totalLabel}</span>
      </div>
      {bill.deliveryPendingNote ? (
        <p className="mt-3 text-sm text-[#A89B8C]">{bill.deliveryPendingNote}</p>
      ) : null}
    </GlassCard>
  );
}
