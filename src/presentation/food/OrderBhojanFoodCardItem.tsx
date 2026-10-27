import { memo, useState, type MouseEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { MenuItemCardView } from '@bhojan/storefront-design-system/food/MenuItemCardView';
import type { FoodPublic } from '@/types/marketplace-food';
import { useCartStore } from '@/features/cart/store/cartStore';
import { mapFoodToMenuItemCardView } from './mapFoodToMenuItemCardView';



import { triggerHaptic } from '@/lib/haptics';

const FoodCartQuantitySelector = memo(function FoodCartQuantitySelector({
  foodName,
  hasOptions,
  unitPrice,
  foodId,
  food,
  onCustomize,
}: {
  readonly foodName: string;
  readonly hasOptions: boolean;
  readonly unitPrice: number;
  readonly foodId: string;
  readonly onCustomize: (food: FoodPublic) => void;
  readonly food: FoodPublic;
}) {
  const total = useCartStore((s) => s.lines.reduce((acc, l) => (l.foodId === foodId ? acc + l.quantity : acc), 0));
  const targetLineId = useCartStore((s) => {
    const lines = s.lines.filter((l) => l.foodId === foodId);
    return lines.length > 0 ? lines[lines.length - 1].lineId : undefined;
  });
  const addItem = useCartStore((s) => s.addItem);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const lines = useCartStore((s) => s.lines);

  return (
    <div className="flex h-8 w-full items-center justify-between rounded-lg border border-[#E8720C]/35 bg-[var(--ob-surface)] px-1 shadow-sm">
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 touch-manipulation"
        aria-label={`Decrease quantity of ${foodName}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!targetLineId) return;
          const line = lines.find((l) => l.lineId === targetLineId);
          if (line) {
            triggerHaptic('light');
            setQuantity(targetLineId, line.quantity - 1);
          }
        }}
      >
        <Minus className="h-3.5 w-3.5 text-[#f4a261]" strokeWidth={2.5} aria-hidden />
      </button>
      <span className="min-w-[1.25rem] text-center text-xs font-bold tabular-nums text-[var(--ob-text-primary)]">{total}</span>
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 touch-manipulation"
        aria-label={`Increase quantity of ${foodName}`}
        onClick={(e) => {
          e.stopPropagation();
          triggerHaptic('light');
          if (hasOptions) onCustomize(food);
          else addItem({ foodId, name: foodName, price: unitPrice }, 1);
        }}
      >
        <Plus className="h-3.5 w-3.5 text-[#f4a261]" strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
});

export interface OrderBhojanFoodCardItemProps {
  readonly food: FoodPublic;
  readonly onCustomize: (food: FoodPublic) => void;
  readonly priority?: boolean;
  readonly index?: number;
}

export const OrderBhojanFoodCardItem = memo(function OrderBhojanFoodCardItem({
  food,
  onCustomize,
  priority = false,
  index = 0,
}: OrderBhojanFoodCardItemProps) {
  const quantity = useCartStore((s) => s.lines.reduce((acc, l) => (l.foodId === food.foodId ? acc + l.quantity : acc), 0));
  const addItem = useCartStore((s) => s.addItem);
  const [fly, setFly] = useState(false);

  const hasOptions = food.variants.length > 0 || food.addons.length > 0;
  const unitPrice = food.offerPrice ?? food.price;
  const viewModel = mapFoodToMenuItemCardView(food);

  const triggerFly = () => {
    setFly(true);
    window.setTimeout(() => setFly(false), 520);
  };

  const handleAdd = () => {
    if (!food.availability) return;
    triggerHaptic('light');
    if (hasOptions) {
      onCustomize(food);
      return;
    }
    triggerFly();
    addItem({ foodId: food.foodId, name: food.name, price: unitPrice }, 1);
  };

  const actionSlot =
    quantity > 0 ? (
      <FoodCartQuantitySelector
        foodName={food.name}
        hasOptions={hasOptions}
        unitPrice={unitPrice}
        foodId={food.foodId}
        food={food}
        onCustomize={onCustomize}
      />
    ) : (
      <button
        type="button"
        className={`w-full h-8 rounded-lg border border-[#E8720C]/40 bg-gradient-to-r from-[#FA7A1E] to-[#E8720C] text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:brightness-105 active:scale-95 transition-all touch-manipulation disabled:opacity-50${fly ? ' scale-95' : ''}`}
        disabled={!food.availability}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          handleAdd();
        }}
        aria-label={`Add ${food.name}`}
      >
        Add
      </button>
    );

  return (
    <MenuItemCardView
      item={viewModel}
      actionSlot={actionSlot}
      index={index}
      imagePriority={priority}
      onPress={hasOptions ? () => onCustomize(food) : undefined}
    />
  );
});
