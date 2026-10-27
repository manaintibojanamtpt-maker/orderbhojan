import type { FoodCategoryPublic } from '@/types/marketplace-food';

const chipClass = (active: boolean) =>
  `shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
    active
      ? 'border-[#E8720C]/55 bg-[#E8720C]/18 text-[var(--ob-text-primary)] shadow-[0_0_0_1px_rgba(232,93,4,0.12)]'
      : 'border-[var(--ob-border)] bg-[var(--ob-surface)]/60 text-[var(--ob-text-secondary)] hover:border-[#E8720C]/30 hover:text-[var(--ob-text-primary)]'
  }`;

export interface OrderBhojanFoodCategoryRailProps {
  readonly categories: readonly FoodCategoryPublic[];
  readonly activeId: string;
  readonly onSelect: (sectionId: string) => void;
  readonly embedded?: boolean;
}

function normalizeCategoryLabel(name: string): string {
  const trimmed = name.trim();
  if (trimmed.toLowerCase() === 'break fast') return 'Breakfast';
  return trimmed;
}

export function OrderBhojanFoodCategoryRail({
  categories,
  activeId,
  onSelect,
  embedded = false,
}: OrderBhojanFoodCategoryRailProps) {
  return (
    <nav
      className={`${embedded ? '' : 'sticky top-0 z-30 border-b border-[var(--ob-border)] bg-[var(--ob-bg)]/95 backdrop-blur-md'} min-w-0 max-w-full py-2 ob-menu-container`}
      aria-label="Menu categories"
    >
      <div className="ob-menu-rail-bleed">
        <div className="ob-menu-rail-scroll flex gap-2 pb-1 no-scrollbar">
          {categories.map((category) => {
            const sectionId = `food-cat-${category.id}`;
            const active = activeId === sectionId;
            return (
              <button
                key={category.id}
                type="button"
                className={chipClass(active)}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(sectionId)}
              >
                {normalizeCategoryLabel(category.name)}
                {category.itemCount != null ? ` · ${category.itemCount}` : ''}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
