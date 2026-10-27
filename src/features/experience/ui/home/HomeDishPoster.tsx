import { Plus } from 'lucide-react';
import type { MockFoodItem } from '../../domain/experience.types';
import { addExperienceFoodToCart } from '../../utils/experienceCart';
import { resolveAppetitePhoto } from '../../utils/resolveAppetitePhoto';
import { MotionPress } from '../../motion/premiumMotion';

export interface HomeDishPosterProps {
  readonly item: MockFoodItem;
}

export function HomeDishPoster({ item }: HomeDishPosterProps) {
  const photo = resolveAppetitePhoto(item.imageUrl, 480, '12rem', 85);

  return (
    <MotionPress className="block">
      <article className="group relative flex w-[11rem] sm:w-[12.5rem] shrink-0 flex-col rounded-2xl border border-[var(--ob-border)] bg-[var(--ob-surface)] p-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.35)] transition-all duration-300 hover:border-[#E8720C]/40 hover:shadow-[0_12px_28px_rgba(0,0,0,0.5)]">
        {/* Food Image Container with Add Button Overlay */}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[var(--ob-surface-strong)]">
          <picture className="block h-full w-full">
            {photo.sources?.map((source) => (
              <source key={source.type} type={source.type} srcSet={source.srcSet} sizes={source.sizes} />
            ))}
            <img
              src={photo.src}
              srcSet={photo.srcSet}
              sizes={photo.sizes}
              alt={item.name}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              loading="lazy"
              decoding="async"
            />
          </picture>

          {/* Cooking Now / Special Badge */}
          <span className="absolute left-2 top-2 rounded-full border border-[var(--ob-border)] bg-[var(--ob-bg)]/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#FF9E42] backdrop-blur-md">
            Specialty
          </span>

          {/* Quick Add Floating Button */}
          <button
            type="button"
            className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#E8720C] text-white shadow-[0_4px_12px_rgba(232,114,12,0.45)] transition-all duration-200 hover:scale-110 hover:bg-[#ff8522] active:scale-95 focus:outline-none"
            aria-label={`Add ${item.name}`}
            onClick={(event) => {
              event.stopPropagation();
              addExperienceFoodToCart(item);
            }}
          >
            <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden />
          </button>
        </div>

        {/* Dish Metadata */}
        <div className="mt-2.5 flex flex-col">
          <h3 className="truncate text-xs font-bold text-[var(--ob-text-primary)] sm:text-sm group-hover:text-[#FF9E42] transition-colors">
            {item.name}
          </h3>
          {item.description ? (
            <p className="mt-0.5 truncate text-[11px] text-[var(--ob-text-secondary)]">
              {item.description}
            </p>
          ) : null}

          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-sm font-extrabold text-[var(--ob-text-primary)]">₹{item.price}</span>
            {item.oldPrice && item.oldPrice > item.price ? (
              <span className="text-[11px] text-[var(--ob-text-secondary)] line-through">₹{item.oldPrice}</span>
            ) : null}
          </div>
        </div>
      </article>
    </MotionPress>
  );
}
