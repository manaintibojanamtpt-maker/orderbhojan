
const DEFAULT_TRENDING_TERMS: readonly SearchTermChip[] = [
  { id: 't-biryani', label: 'Biryani' },
  { id: 't-dosa', label: 'Masala Dosa' },
  { id: 't-paneer', label: 'Paneer Butter Masala' },
  { id: 't-thali', label: 'Homestyle Thali' },
  { id: 't-parotta', label: 'Malabar Parotta' },
  { id: 't-samosa', label: 'Samosa' },
];
import type { SearchBrowseSection, SearchTermChip } from '@/types/marketplace-search';
import { SoftButton } from '@bhojan/storefront-design-system/primitives/SoftButton';
import { GlassCard } from '@bhojan/storefront-design-system/primitives/GlassCard';
import { Search } from 'lucide-react';
import { useSearchHistoryStore } from '@/features/search/store/searchStore';
import { trackSearchEvent } from '@/features/search/analytics/searchAnalytics';
import { OrderBhojanSearchBrowseSkeleton } from './OrderBhojanSearchResultsSkeleton';

const chipClass =
  'rounded-full border border-[var(--ob-border)] bg-[var(--ob-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ob-text-primary)] transition hover:border-[#E8720C]/40 hover:text-[var(--ob-brand)]';

function TermChipSection({
  title,
  terms,
  onSelect,
  onRemove,
  removable = false,
}: {
  title: string;
  terms: readonly SearchTermChip[];
  onSelect: (label: string) => void;
  onRemove?: (id: string) => void;
  removable?: boolean;
}) {
  if (terms.length === 0) return null;

  return (
    <section className="py-2.5 sm:py-3" aria-label={title}>
      <h2 className="mb-2 text-sm sm:text-base font-bold tracking-tight text-[var(--ob-text-primary)]">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {terms.map((term) => (
          <div key={term.id} className="flex items-center gap-1">
            <button
              type="button"
              className={chipClass}
              aria-label={`${title} ${term.label}`}
              onClick={() => {
                trackSearchEvent('search_suggestion_click', { query: term.label });
                onSelect(term.label);
              }}
            >
              {term.label}
              {term.count != null ? ` · ${term.count}` : ''}
            </button>
            {removable && onRemove ? (
              <SoftButton
                type="button"
                tone="ghost"
                size="compact"
                aria-label={`Remove ${term.label} from recent searches`}
                onClick={() => onRemove(term.id)}
              >
                ×
              </SoftButton>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function BrowseCollectionSection({
  section,
  onSelect,
}: {
  section: SearchBrowseSection;
  onSelect: (label: string) => void;
}) {
  return (
    <section className="py-2.5 sm:py-3" aria-label={section.title}>
      <h2 className="mb-2 text-sm sm:text-base font-bold tracking-tight text-[var(--ob-text-primary)]">{section.title}</h2>
      <div className="flex flex-wrap gap-2">
        {section.items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={chipClass}
            aria-label={`${section.title} ${item.label}`}
            onClick={() => onSelect(item.query ?? item.label)}
          >
            {item.emoji ? `${item.emoji} ` : ''}
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export interface OrderBhojanSearchBrowsePanelProps {
  readonly trending: readonly SearchTermChip[];
  readonly popular: readonly SearchTermChip[];
  readonly apiRecent: readonly SearchTermChip[];
  readonly collections: readonly SearchBrowseSection[];
  readonly isLoading: boolean;
  readonly onSelectTerm: (label: string) => void;
}

export function OrderBhojanSearchBrowsePanel({
  trending,
  popular,
  apiRecent,
  collections,
  isLoading,
  onSelectTerm,
}: OrderBhojanSearchBrowsePanelProps) {
  const localRecent = useSearchHistoryStore((s) => s.terms);
  const removeTerm = useSearchHistoryStore((s) => s.removeTerm);
  const clearAll = useSearchHistoryStore((s) => s.clearAll);

  const recent: SearchTermChip[] = [
    ...localRecent.map((t) => ({ id: t.id, label: t.label })),
    ...apiRecent.filter(
      (item) => !localRecent.some((l) => l.label.toLowerCase() === item.label.toLowerCase()),
    ),
  ].slice(0, 8);

  if (isLoading) {
    return <OrderBhojanSearchBrowseSkeleton />;
  }

  return (
    <div className="space-y-2">
      <TermChipSection
        title="Recent searches"
        terms={recent}
        onSelect={onSelectTerm}
        onRemove={removeTerm}
        removable
      />
      {recent.length > 0 ? (
        <div className="flex justify-end px-4">
          <SoftButton type="button" tone="ghost" size="compact" onClick={clearAll}>
            Clear history
          </SoftButton>
        </div>
      ) : null}
      <TermChipSection title="Trending searches" terms={trending.length > 0 ? trending : DEFAULT_TRENDING_TERMS} onSelect={onSelectTerm} />
      <TermChipSection title="Popular searches" terms={popular} onSelect={onSelectTerm} />
      {collections.map((section) => (
        <BrowseCollectionSection key={section.id} section={section} onSelect={onSelectTerm} />
      ))}
      {recent.length === 0 && trending.length === 0 ? (
        <div className="py-6">
          <GlassCard hoverEffect={false} className="!rounded-2xl !p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8720C]/15">
              <Search className="h-6 w-6 text-[#E8720C]" aria-hidden />
            </div>
            <h2 className="text-base font-bold text-[var(--ob-text-primary)] mb-1">Start exploring</h2>
            <p className="text-xs text-[var(--ob-text-secondary)]">Search for biryani, dosa, cloud kitchens, or browse collections below.</p>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
