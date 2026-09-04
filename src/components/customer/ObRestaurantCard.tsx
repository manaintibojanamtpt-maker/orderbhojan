import { Star, Clock, MapPin } from 'lucide-react';

export interface ObRestaurantCardProps {
  name: string;
  imageUrl: string;
  rating?: string;
  deliveryTime?: string;
  distance?: string;
  deliveryFee?: string;
  cuisine?: string;
  isOpen?: boolean;
  onClick?: () => void;
}

/**
 * Premium restaurant card — discovery tile with image, rating, delivery info.
 */
export function ObRestaurantCard({
  name,
  imageUrl,
  rating,
  deliveryTime,
  distance,
  deliveryFee,
  cuisine,
  isOpen = true,
  onClick,
}: ObRestaurantCardProps) {
  return (
    <article className="ob-restaurant-card group cursor-pointer" onClick={onClick}>
      <div className="relative overflow-hidden">
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          className="ob-restaurant-card__img"
        />
        {!isOpen && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
              Closed
            </span>
          </div>
        )}
        {deliveryTime && (
          <span className="ob-restaurant-card__delivery-badge absolute bottom-2.5 right-2.5">
            <Clock size={11} aria-hidden />
            {deliveryTime}
          </span>
        )}
      </div>

      <div className="p-3.5">
        <h3 className="truncate text-base font-bold text-white">{name}</h3>
        {cuisine && <p className="mt-0.5 truncate text-xs text-white/45">{cuisine}</p>}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/55">
          {rating && (
            <span className="flex items-center gap-0.5 font-semibold text-white/85">
              <Star size={11} className="fill-[#FF7A00] text-[#FF7A00]" aria-hidden />
              {rating}
            </span>
          )}
          {distance && (
            <span className="flex items-center gap-0.5">
              <MapPin size={11} aria-hidden />
              {distance}
            </span>
          )}
          {deliveryFee && <span>{deliveryFee}</span>}
        </div>
      </div>
    </article>
  );
}

export default ObRestaurantCard;
