import { Search, MapPin, ShoppingBag, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDiscoveryHome } from '@/features/discovery';
import { useActiveLocation, useLocationActions, hasActiveDeliveryLocation } from '@/features/location';
import { resolveActiveDeliveryLocation } from '@/features/location/domain/activeDeliveryLocation';
import { OrderBhojanKitchenCard } from '@/presentation/discovery/OrderBhojanKitchenCard';
import { Skeleton } from '@bhojan/storefront-design-system/primitives/Skeleton';
import type { RestaurantPublic } from '@/types/marketplace';

/**
 * OrderBhojan Premium Home / Discovery Page
 *
 * Consumes real data from the existing discovery API.
 * Visual-first design optimized for mobile and desktop.
 */

const CATEGORIES = [
  { label: 'Biryani', emoji: '🍛' },
  { label: 'Meals', emoji: '🍱' },
  { label: 'South Indian', emoji: '🥞' },
  { label: 'North Indian', emoji: '🍲' },
  { label: 'Snacks', emoji: '🥟' },
  { label: 'Desserts', emoji: '🍮' },
  { label: 'Breakfast', emoji: '🫓' },
];

function HeroSection() {
  const navigate = useNavigate();
  return (
    <section className="mb-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
        Craving something?
      </h1>
      <div className="ob-hero-search mt-4">
        <Search size={18} className="text-white/40" aria-hidden />
        <input
          type="text"
          placeholder="Search biryani, dosa, thali..."
          className="ob-hero-search__input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              navigate('/search');
            }
          }}
        />
      </div>
    </section>
  );
}

function CategorySection() {
  const navigate = useNavigate();
  return (
    <section className="mb-8">
      <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.label}
            type="button"
            onClick={() => navigate('/search')}
            className="ob-category-pill"
          >
            <span className="text-lg" aria-hidden>{cat.emoji}</span>
            <span className="text-xs font-semibold text-white/85">{cat.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function RestaurantCard({ restaurant }: { restaurant: RestaurantPublic }) {
  return <OrderBhojanKitchenCard restaurant={restaurant} variant="grid" />;
}

function RestaurantSection({ restaurants }: { restaurants: RestaurantPublic[] }) {
  if (restaurants.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="ob-section-header">
        Popular near you
        <span className="ob-section-header__sub">{restaurants.length} kitchens</span>
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {restaurants.map((r) => (
          <RestaurantCard key={r.restaurantId} restaurant={r} />
        ))}
      </div>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6 px-4 pt-5">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <Skeleton className="h-12 w-full rounded-full" />
      <div className="flex gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-20 shrink-0 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onSetLocation }: { onSetLocation: () => void }) {
  return (
    <div className="ob-empty-state">
      <div className="ob-empty-state__icon" aria-hidden>🍽️</div>
      <p className="ob-empty-state__title">No kitchens near you yet</p>
      <p className="ob-empty-state__desc">
        Set your delivery location to discover restaurants that deliver to you.
      </p>
      <button
        type="button"
        onClick={onSetLocation}
        className="rounded-full bg-[#FF7A00] px-6 py-3 text-sm font-bold text-black"
      >
        Set delivery location
      </button>
    </div>
  );
}

export function PremiumHomePage() {
  const navigate = useNavigate();
  const activeLocation = useActiveLocation();
  const deliveryLocation = resolveActiveDeliveryLocation(activeLocation);
  const hasLocation = hasActiveDeliveryLocation(activeLocation);
  const { openSelector } = useLocationActions();
  const query = useDiscoveryHome();

  const restaurants = query.data?.collections?.flatMap((c) => c.restaurants) ?? [];
  const isLoading = query.isPending && !query.data;
  const showEmpty = !isLoading && hasLocation && restaurants.length === 0;

  return (
    <div className="min-h-screen bg-[#050403] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 backdrop-blur-md bg-[#050403]/90 border-b border-white/[0.06]">
        <button
          type="button"
          className="flex items-center gap-2 ob-focus-ring"
          onClick={() => openSelector()}
          aria-label="Set delivery location"
        >
          <MapPin size={18} className="text-[#FF7A00]" aria-hidden />
          <div className="text-left">
            <p className="text-[10px] text-white/45">Deliver to</p>
            <p className="text-xs font-bold text-white">
              {deliveryLocation?.text?.shortLabel ?? 'Set location'}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Notifications" className="relative ob-focus-ring">
            <Bell size={20} className="text-white/70" />
          </button>
          <button
            type="button"
            aria-label="Cart"
            className="relative ob-focus-ring"
            onClick={() => navigate('/cart')}
          >
            <ShoppingBag size={20} className="text-white/70" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-5">
        <HeroSection />
        <CategorySection />

        {isLoading && <HomeSkeleton />}

        {showEmpty && <EmptyState onSetLocation={openSelector} />}

        {!isLoading && restaurants.length > 0 && (
          <RestaurantSection restaurants={restaurants} />
        )}

        {!hasLocation && !isLoading && (
          <EmptyState onSetLocation={openSelector} />
        )}
      </main>
    </div>
  );
}

export default PremiumHomePage;
