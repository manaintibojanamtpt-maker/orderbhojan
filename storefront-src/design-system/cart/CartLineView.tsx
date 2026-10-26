import { UtensilsCrossed } from 'lucide-react';
import { GlassCard } from '../primitives/GlassCard';
import { QuantityStepperView } from '../primitives/QuantityStepperView';
import type { CartLineViewModel } from './types';

export interface CartLineViewProps {
  readonly line: CartLineViewModel;
  readonly onQuantityChange: (lineId: string, quantity: number) => void;
}

export function CartLineView({ line, onQuantityChange }: CartLineViewProps) {
  const addons = line.addons ?? [];

  return (
    <li>
      <GlassCard hoverEffect={false} className="!rounded-[1.25rem] !p-3">
        <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
          <div
            className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-xl border border-[#E8720C]/15 bg-[#E8720C]/10 text-[#E8720C]"
            aria-hidden
          >
            <UtensilsCrossed className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex flex-col gap-1">
            <p className="font-bold leading-tight text-[#FFF8F0]">{line.name}</p>
            {line.variantLabel ? (
              <p className="text-sm text-[#A89B8C]">{line.variantLabel}</p>
            ) : null}
            {addons.length > 0 ? (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {addons.map((addon) => (
                  <span
                    key={addon.id}
                    className="rounded-full border border-[#E8720C]/15 bg-[#E8720C]/10 px-2 py-0.5 text-[11px] font-semibold text-[#A89B8C]"
                  >
                    + {addon.label}
                    {addon.price > 0 ? ` (₹${addon.price})` : ''}
                  </span>
                ))}
              </div>
            ) : null}
            {line.instructions?.trim() ? (
              <p className="text-sm italic text-[#A89B8C]">Note: {line.instructions.trim()}</p>
            ) : null}
            <p className="mt-1 text-xs text-[#A89B8C]">
              {line.priceLabel} &nbsp;·&nbsp; <span className="font-semibold text-[#FFF8F0]">Total {line.totalLabel}</span>
            </p>
          </div>
          <div className="self-center">
            <QuantityStepperView
              value={line.quantity}
              min={0}
              ariaLabel={`Quantity for ${line.name}`}
              onChange={(next) => onQuantityChange(line.lineId, next)}
            />
          </div>
        </div>
      </GlassCard>
    </li>
  );
}
