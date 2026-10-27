import { Link, useNavigate } from 'react-router-dom';
import { MarketplaceSearchBar } from '@bhojan/storefront-design-system/marketplace/MarketplaceSearchBar';
import { CategorySkeleton } from '@bhojan/storefront-design-system/skeleton/SkeletonSystem';
import {
  POPULAR_SEARCHES,
  RECENT_SEARCHES,
  TRENDING_FOODS,
} from '../../data/mockCatalog';

const chipClass =
  'rounded-full border border-[var(--ob-border)] bg-[var(--ob-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ob-text-primary)]/80 transition hover:border-[#E8720C]/40 hover:text-white';

export function MockSearchExperiencePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--ob-bg,#080706)] text-[#FFF8F0]">
      <header className="border-b border-white/[0.06] bg-[var(--ob-bg,#080706)] px-4 py-3 sm:px-6">
        <h1 className="mb-2 text-lg sm:text-xl font-bold tracking-tight text-[#FFF8F0]">Search</h1>
        <div className="pointer-events-none opacity-80">
          <MarketplaceSearchBar
            value=""
            onChange={() => undefined}
            onSubmit={() => navigate('/search')}
            onClear={() => undefined}
          />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4 pb-20 sm:px-6 lg:px-8">
        <section className="py-2">
          <h2 className="mb-2 text-sm sm:text-base font-bold tracking-tight text-[#FFF8F0]">Recent searches</h2>
          <div className="flex flex-wrap gap-2">
            {RECENT_SEARCHES.map((term) => (
              <span key={term.id} className={chipClass}>
                {term.label}
              </span>
            ))}
          </div>
        </section>

        <section className="py-2">
          <h2 className="mb-2 text-sm sm:text-base font-bold tracking-tight text-[#FFF8F0]">Popular searches</h2>
          <div className="flex flex-wrap gap-2">
            {POPULAR_SEARCHES.map((term) => (
              <span key={term.id} className={chipClass}>
                {term.label}
              </span>
            ))}
          </div>
        </section>

        <section className="py-2">
          <h2 className="mb-2 text-sm sm:text-base font-bold tracking-tight text-[#FFF8F0]">Trending foods</h2>
          <CategorySkeleton />
          <div className="mt-4 space-y-3">
            {TRENDING_FOODS.map((food) => (
              <Link
                key={food.id}
                to={`/restaurant/${food.restaurantSlug}`}
                className="flex items-center gap-3 rounded-2xl border border-[var(--ob-border)] bg-[var(--ob-surface)] p-3 transition hover:border-[#E8720C]/40"
              >
                <div className="h-12 w-12 rounded-xl bg-white/5" />
                <div>
                  <p className="text-sm font-semibold text-white">{food.name}</p>
                  <p className="text-xs text-white/50">{food.restaurantSlug}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
