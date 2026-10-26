import { Section } from '@bhojan/storefront-design-system/primitives/Section';
import { SectionHeader } from '@bhojan/storefront-design-system/primitives/SectionHeader';
import { TrendingSkeleton } from '@bhojan/storefront-design-system/skeleton/SkeletonSystem';
import type { FoodCategoryId } from '../../domain/experience.types';
import { useTrendingFoods } from '../../hooks/useMockExperienceQuery';
import { matchesHomeCategory } from '../../utils/homeCategoryFilter';
import { HomeDishPoster } from './HomeDishPoster';
import { OrderBhojanDiscoveryUxState } from '@/presentation/states';
import { useDiscoveryFeatureEnabled } from '@/features/discovery';

export interface TrendingFoodsSectionProps {
  readonly categoryId?: FoodCategoryId | null;
}

export function TrendingFoodsSection({ categoryId = null }: TrendingFoodsSectionProps) {
  const discoveryEnabled = useDiscoveryFeatureEnabled();
  const query = useTrendingFoods();

  // In live production discovery, do not display static mock dishes with placeholder imagery.
  if (discoveryEnabled) {
    return null;
  }

  return (
    <Section density="comfortable" background="default" className="!py-3" aria-label="Homestyle Specialties">
      <SectionHeader
        label="COOKING NOW"
        title="Homestyle Specialties"
        description="Freshly cooked regional meals from home kitchens in your area"
        align="left"
        className="!mb-3 !text-left"
      />
      {query.isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar" aria-busy="true" aria-label="Loading dishes">
          <TrendingSkeleton />
          <TrendingSkeleton />
          <TrendingSkeleton />
        </div>
      ) : query.isError ? (
        <OrderBhojanDiscoveryUxState
          variant="error"
          title="Could not load dishes"
          description="Check your connection and try again."
          primaryLabel="Retry"
          onPrimary={() => void query.refetch()}
          compact
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
          {query.data?.map((item) => {
            const matches = matchesHomeCategory(item.categoryIds, categoryId);
            return (
              <div
                key={item.id}
                className={matches ? 'flex-shrink-0' : 'flex-shrink-0 opacity-50'}
              >
                <HomeDishPoster item={item} />
              </div>
            );
          })}
          {!query.data?.length ? (
            <OrderBhojanDiscoveryUxState
              variant="empty"
              title="No dishes to show"
              description="Check back later for trending picks."
              compact
            />
          ) : null}
        </div>
      )}
    </Section>
  );
}
