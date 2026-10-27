import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, MapPin, Star, ChevronRight, IndianRupee } from 'lucide-react';
import type { MarketplaceKitchenCard } from '../../lib/marketplace/types';

const MIN_DISPLAY_DISTANCE_KM = 0.1;

function isDisplayableDistanceKm(km: number | undefined | null): km is number {
  if (km == null || !Number.isFinite(km)) return false;
  if (km === 0) return true;
  return km >= MIN_DISPLAY_DISTANCE_KM;
}

export interface MarketplaceKitchenCardViewProps {
  readonly kitchen: MarketplaceKitchenCard;
  readonly variant?: 'default' | 'spotlight' | 'list';
  readonly favoriteSlot?: React.ReactNode;
  readonly className?: string;
  readonly imageLoading?: 'lazy' | 'eager';
  readonly spotlightEyebrow?: string;
  /** Passed to react-router Link for instant destination chrome (e.g. kitchen name). */
  readonly linkState?: Record<string, unknown>;
}

const badgeStyles: Record<string, string> = {
  closest: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  fast_delivery: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  highly_rated: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  within_delivery_radius: 'bg-[#E8720C]/15 text-[#E8720C] border-[#E8720C]/30',
  offer: 'bg-[#E8720C]/15 text-[#E8720C] border-[#E8720C]/30',
  closed: 'bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30',
  kitchen_format: 'bg-[var(--ob-surface-strong)] text-[var(--ob-text-secondary)] border-[var(--ob-border)]',
  pure_veg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  non_veg: 'bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30',
};

function KitchenThumbnail({
  kitchen,
  imageLoading,
  className,
}: {
  kitchen: MarketplaceKitchenCard;
  imageLoading: 'lazy' | 'eager';
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (kitchen.thumbnailUrl && !imageFailed) {
    return (
      <img
        src={kitchen.thumbnailUrl}
        alt={kitchen.name}
        className={className}
        loading={imageLoading}
        decoding="async"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className={`flex items-center justify-center text-xs text-[var(--ob-text-secondary)]/70 ${className ?? ''}`}>
      Kitchen
    </div>
  );
}

function KitchenMetadata({ kitchen }: { kitchen: MarketplaceKitchenCard }) {
  const distanceKm = kitchen.distanceKm;
  const showDistance = isDisplayableDistanceKm(distanceKm);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--ob-text-secondary)]">
      {showDistance ? (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          {distanceKm.toFixed(1)} km
        </span>
      ) : null}
      {kitchen.etaMins !== undefined && (
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {kitchen.etaMins} min
        </span>
      )}
      {kitchen.deliveryFeeLabel && kitchen.deliveryFeeLabel !== '—' ? (
        <span className="inline-flex items-center gap-1">
          <IndianRupee className="h-3.5 w-3.5" />
          {kitchen.deliveryFeeLabel}
        </span>
      ) : null}
      {kitchen.rating !== undefined && (
        <span className="inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          {kitchen.rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

function KitchenBadges({ kitchen }: { kitchen: MarketplaceKitchenCard }) {
  if (kitchen.badges.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {kitchen.badges.map((badge) => (
        <span
          key={`${badge.id}-${badge.label}`}
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
            badgeStyles[badge.id] ?? 'border-[var(--ob-border)] text-[var(--ob-text-secondary)]'
          }`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

export const MarketplaceKitchenCardView: React.FC<MarketplaceKitchenCardViewProps> = ({
  kitchen,
  variant = 'default',
  favoriteSlot = null,
  className = '',
  imageLoading = 'lazy',
  spotlightEyebrow = 'Cooking now',
  linkState,
}) => {
  if (variant === 'list') {
    const offerBadge = kitchen.badges.find((badge) => badge.id === 'offer');
    const etaLabel =
      kitchen.etaMins !== undefined
        ? `${Math.max(20, kitchen.etaMins - 5)}-${kitchen.etaMins + 5} mins`
        : null;

    return (
      <Link
        to={kitchen.storePath}
        state={linkState}
        className={`group flex items-center gap-3 py-3 transition active:bg-[var(--ob-surface-strong)] active:scale-[0.98] touch-manipulation ${className}`}
      >
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--ob-surface-strong)]">
          <KitchenThumbnail
            kitchen={kitchen}
            imageLoading={imageLoading}
            className="h-full w-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-bold text-[var(--ob-text-primary)] group-hover:text-[#f4a261]">
            {kitchen.name}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-[var(--ob-text-secondary)]">
            {kitchen.rating !== undefined ? (
              <span className="inline-flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                {kitchen.rating.toFixed(1)}
              </span>
            ) : null}
            {kitchen.rating !== undefined && etaLabel ? <span aria-hidden>·</span> : null}
            {etaLabel ? <span>{etaLabel}</span> : null}
          </div>
          <p className="mt-0.5 line-clamp-1 text-[12px] text-[var(--ob-text-secondary)]/80">
            {kitchen.cuisineTags?.join(' · ') || kitchen.eligibilityLabel}
          </p>
        </div>

        <div className="flex max-w-[40%] shrink-0 items-center justify-end gap-1.5 sm:max-w-none sm:gap-2">
          {offerBadge ? (
            <span className="max-w-[4.5rem] truncate rounded-md bg-[#E8720C] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {offerBadge.label}
            </span>
          ) : null}
          {!kitchen.isOpen ? (
            <span className="rounded-md bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-200">
              Closed
            </span>
          ) : null}
          {favoriteSlot ? <span className="hidden min-[360px]:inline-flex">{favoriteSlot}</span> : null}
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ob-text-secondary)]/60 group-hover:text-[#f4a261]" aria-hidden />
        </div>
      </Link>
    );
  }

  if (variant === 'spotlight') {
    return (
      <Link
        to={kitchen.storePath}
        state={linkState}
        className={`group block overflow-hidden rounded-[1.25rem] border border-[var(--ob-border)] bg-[var(--ob-surface)] transition hover:border-[#E8720C]/40 hover:bg-[var(--ob-surface)]/90 hover:shadow-[0_24px_56px_rgba(0,0,0,0.45)] active:scale-[0.98] touch-manipulation ${className}`}
      >
        <div className="relative h-48 overflow-hidden bg-[var(--ob-surface-strong)]">
          <KitchenThumbnail
            kitchen={kitchen}
            imageLoading={imageLoading}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          {favoriteSlot ? <div className="absolute right-3 top-3 z-10">{favoriteSlot}</div> : null}
          <span className="absolute left-3 top-3 rounded-full border border-[#E8720C]/30 bg-[#E8720C]/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#E8720C]">
            {spotlightEyebrow}
          </span>
        </div>
        <div className="p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#E8720C]/80">
            {kitchen.eligibilityLabel}
          </p>
          <h3 className="mt-1 line-clamp-2 text-xl font-bold text-[var(--ob-text-primary)] group-hover:text-[#E8720C]">{kitchen.name}</h3>
          {kitchen.cuisineTags?.length ? (
            <p className="mt-1 text-sm text-[var(--ob-text-secondary)]">{kitchen.cuisineTags.join(' · ')}</p>
          ) : null}
          <KitchenMetadata kitchen={kitchen} />
          <KitchenBadges kitchen={kitchen} />
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={kitchen.storePath}
      state={linkState}
      className={`group block h-full min-w-0 rounded-[1.25rem] border border-[var(--ob-border)] bg-[var(--ob-surface)] p-4 transition hover:border-[#E8720C]/40 hover:bg-[var(--ob-surface)]/90 hover:shadow-[0_16px_48px_rgba(0,0,0,0.38)] active:scale-[0.98] touch-manipulation ${className}`}
    >
      <div className="flex gap-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[var(--ob-surface-strong)]">
          <KitchenThumbnail
            kitchen={kitchen}
            imageLoading={imageLoading}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {favoriteSlot ? <div className="absolute right-1 top-1">{favoriteSlot}</div> : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-bold text-[var(--ob-text-primary)] group-hover:text-[#E8720C]">
                {kitchen.name}
              </h3>
              <p className="mt-0.5 text-xs text-[var(--ob-text-secondary)]">
                {kitchen.cuisineTags?.join(' · ') || kitchen.eligibilityLabel}
              </p>
            </div>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ob-text-secondary)]/60 group-hover:text-[#E8720C]" />
          </div>

          <KitchenMetadata kitchen={kitchen} />
          <KitchenBadges kitchen={kitchen} />
        </div>
      </div>
    </Link>
  );
};

export default MarketplaceKitchenCardView;
