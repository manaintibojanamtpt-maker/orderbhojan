import React from 'react';
import { Mic, Search, X } from 'lucide-react';
import { MarketplaceSearchAutocomplete } from './MarketplaceSearchAutocomplete';
import type { AutocompleteItem, MarketplaceAutocompleteViewModel } from '../../lib/marketplace/autocompleteTypes';

interface MarketplaceSearchBarProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onClear: () => void;
  readonly disabled?: boolean;
  /** Pill home-discovery bar (no separate Search button) */
  readonly appearance?: 'default' | 'pill';
  readonly placeholder?: string;
  readonly autocompleteView?: MarketplaceAutocompleteViewModel;
  readonly autocompleteEnabled?: boolean;
  readonly onAutocompleteFocus?: () => void;
  readonly onAutocompleteBlur?: () => void;
  readonly onAutocompleteKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  readonly onAutocompleteSelect?: (item: AutocompleteItem) => void;
}

export const MarketplaceSearchBar: React.FC<MarketplaceSearchBarProps> = ({
  value,
  onChange,
  onSubmit,
  onClear,
  disabled = false,
  appearance = 'default',
  placeholder,
  autocompleteView,
  autocompleteEnabled = false,
  onAutocompleteFocus,
  onAutocompleteBlur,
  onAutocompleteKeyDown,
  onAutocompleteSelect,
}) => {
  const showAutocomplete =
    autocompleteEnabled && autocompleteView?.open && onAutocompleteSelect !== undefined;
  const isPill = appearance === 'pill';
  const resolvedPlaceholder =
    placeholder ??
    (isPill ? 'Search for restaurants or dishes' : 'Search restaurants, cuisines, or areas');

  const activeDescendant =
    showAutocomplete && autocompleteView && autocompleteView.activeIndex >= 0
      ? `marketplace-search-autocomplete-listbox-option-${autocompleteView.activeIndex}`
      : undefined;

  return (
    <div className="relative">
      <form
        className={isPill ? 'block' : 'flex gap-2'}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ob-text-secondary)]/60" />
          <input
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={onAutocompleteFocus}
            onBlur={onAutocompleteBlur}
            onKeyDown={onAutocompleteKeyDown}
            placeholder={resolvedPlaceholder}
            disabled={disabled}
            className={
              isPill
                ? 'w-full rounded-full border border-[var(--ob-border)] bg-[var(--ob-surface)] py-2.5 pl-10 pr-10 text-sm text-[var(--ob-text-primary)] placeholder:text-[var(--ob-text-secondary)]/50 focus:border-[#E8720C]/60 focus:outline-none disabled:opacity-60'
                : 'w-full rounded-[1.25rem] border border-[var(--ob-border)] bg-[var(--ob-surface)] py-3 pl-10 pr-10 text-sm text-[var(--ob-text-primary)] placeholder:text-[var(--ob-text-secondary)]/50 focus:border-[#E8720C] focus:outline-none disabled:opacity-60'
            }
            aria-label="Search restaurants"
            aria-expanded={showAutocomplete}
            aria-controls={showAutocomplete ? 'marketplace-search-autocomplete-listbox' : undefined}
            aria-activedescendant={activeDescendant}
            aria-autocomplete="list"
            role="combobox"
            autoComplete="off"
          />
          {value ? (
            <button
              type="button"
              onClick={onClear}
              className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-[var(--ob-text-secondary)] hover:bg-[var(--ob-surface-strong)] hover:text-[var(--ob-text-primary)] touch-manipulation"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('ob-voice-agent-open'));
                }
              }}
              className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-[#FA7A1E] hover:bg-white/10 hover:text-[#FA7A1E]/80 touch-manipulation"
              aria-label="Voice search or assistant"
              title="Speak to order"
            >
              <Mic className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
        {isPill ? null : (
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className="shrink-0 rounded-[1.25rem] bg-[#E8720C] px-5 py-3 text-sm font-semibold text-[#FFF8F0] transition hover:bg-[#f07020] disabled:opacity-50"
          >
            Search
          </button>
        )}
      </form>

      {showAutocomplete && autocompleteView && (
        <MarketplaceSearchAutocomplete view={autocompleteView} onSelect={onAutocompleteSelect} />
      )}
    </div>
  );
};

export default MarketplaceSearchBar;
