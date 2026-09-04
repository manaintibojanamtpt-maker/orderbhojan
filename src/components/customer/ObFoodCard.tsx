import { Plus, Star } from 'lucide-react';

export interface ObFoodCardProps {
  name: string;
  restaurant: string;
  price: string;
  rating?: string;
  imageUrl: string;
  category?: string;
  isBestseller?: boolean;
  onAdd?: () => void;
  onClick?: () => void;
}

/**
 * Premium food card — portrait 3:4 image, hover zoom, add button.
 * Visual-first design for OrderBhojan discovery.
 */
export function ObFoodCard({
  name,
  restaurant,
  price,
  rating,
  imageUrl,
  category,
  isBestseller,
  onAdd,
  onClick,
}: ObFoodCardProps) {
  return (
    <article className="ob-food-card group cursor-pointer" onClick={onClick}>
      <div className="relative overflow-hidden">
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          className="ob-food-card__img"
        />
        {category && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm">
            {category}
          </span>
        )}
        {isBestseller && (
          <span className="absolute left-2.5 bottom-2.5 rounded-full bg-[#FF7A00]/90 px-2 py-0.5 text-[10px] font-bold text-black">
            Bestseller
          </span>
        )}
      </div>

      <div className="p-3">
        <h3 className="truncate text-sm font-bold text-white">{name}</h3>
        <p className="mt-0.5 truncate text-xs text-white/45">{restaurant}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-base font-extrabold text-white">{price}</span>
          {rating && (
            <span className="flex items-center gap-0.5 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-bold text-white/85">
              <Star size={10} className="fill-[#FF7A00] text-[#FF7A00]" aria-hidden />
              {rating}
            </span>
          )}
        </div>
      </div>

      {onAdd && (
        <button
          type="button"
          aria-label={`Add ${name} to cart`}
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="ob-food-card__add-btn"
        >
          <Plus size={18} strokeWidth={3} />
        </button>
      )}
    </article>
  );
}

export default ObFoodCard;
