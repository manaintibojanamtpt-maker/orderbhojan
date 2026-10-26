import clsx from 'clsx';
import { useHomeCategories } from '@/hooks/useHomeCategories';
import {
  isHomeCategoryDiscoveryFilterActive,
  toggleHomeCategoryDiscoveryFilter,
} from '@/features/discovery/domain/homeCategoryCuisine';
import { useDiscoveryFeatureEnabled } from '@/features/discovery/hooks/useDiscoveryFeature';
import { useDiscoveryFilterStore } from '@/features/discovery/store/discoveryFilterStore';
import {

} from '@/features/experience/data/food-photo-manifest';
import type { HomeCategory } from '@/hooks/useHomeCategories';
import { useCategoryStore } from '@/features/experience/store/categoryStore';
import type { FoodCategoryId } from '@/features/experience/domain/experience.types';
import { triggerHaptic } from '@/lib/haptics';

export interface OrderBhojanHomeCategoriesProps {
  readonly compact?: boolean;
}



export function OrderBhojanHomeCategories({ compact = false }: OrderBhojanHomeCategoriesProps) {
  const discoveryEnabled = useDiscoveryFeatureEnabled();
  const { selectedId, select } = useCategoryStore();
  const cuisines = useDiscoveryFilterStore((s) => s.filters.cuisines);
  const setFilters = useDiscoveryFilterStore((s) => s.setFilters);
  const { data: categories = [] } = useHomeCategories();

  const circleSize = compact ? 'size-[3.85rem]' : 'size-[4.25rem]';

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ob-text-secondary)]">
        What's On Your Mind?
      </h2>
      <div
        className={clsx(
          'flex gap-3.5 overflow-x-auto pb-0.5 no-scrollbar snap-x snap-mandatory',
          compact && '-mx-1 px-1',
        )}
        role="list"
        aria-label="Browse cuisines"
      >
        {categories.map((cat: HomeCategory) => {
          const selected = discoveryEnabled
            ? isHomeCategoryDiscoveryFilterActive(cat.id, cuisines)
            : selectedId === cat.id;

          const handleSelect = () => {
            triggerHaptic('light');
            if (discoveryEnabled) {
              setFilters({
                cuisines: toggleHomeCategoryDiscoveryFilter(cat.id, cuisines),
              });
              return;
            }
            select(cat.id as FoodCategoryId);
          };

          return (
            <button
              key={cat.id}
              type="button"
              role="listitem"
              onClick={handleSelect}
              className={clsx(
                'group flex shrink-0 snap-start flex-col items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8720C]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080706]',
                'w-[4.35rem]',
              )}
              aria-pressed={selected}
              aria-label={`${selected ? 'Clear' : 'Filter by'} ${cat.label}`}
            >
              <span
                className={clsx(
                  'relative rounded-full p-[2px] transition-all duration-300 ease-out',
                  circleSize,
                  selected
                    ? 'bg-gradient-to-br from-[#E8720C] via-[#f4a261] to-[#E8720C] shadow-sm'
                    : 'bg-white/10 group-active:scale-95',
                )}
              >
                <picture
                  className={clsx(
                    'block size-full overflow-hidden rounded-full bg-[var(--ob-surface-strong)]',
                    selected && 'ring-2 ring-[#080706]/80',
                  )}
                >
                  <img
                    src={cat.imageUrl}
                    alt=""
                    className={clsx(
                      'size-full scale-[1.12] object-cover transition-transform duration-500 ease-out',
                      'group-hover:scale-[1.18] group-active:scale-[1.08]',
                    )}
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
              </span>
              <span
                className={clsx(
                  'max-w-full truncate px-0.5 text-center text-[11px] font-semibold leading-tight transition-colors duration-300',
                  selected ? 'text-[#E8720C]' : 'text-[var(--ob-text-primary)]',
                )}
              >
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
