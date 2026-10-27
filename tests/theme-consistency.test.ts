import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeEach } from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

describe('OrderBhojan cross-device theme consistency contracts', () => {
  describe('Theme Service Logic', () => {
    let mockStorage: Record<string, string> = {};
    let mockAttributes: Record<string, string> = {};
    let mockClasses = new Set<string>();
    let mediaQueryLight = false;

    beforeEach(() => {
      mockStorage = {};
      mockAttributes = {};
      mockClasses = new Set<string>();
      mediaQueryLight = false;

      (globalThis as any).window = {
        matchMedia: (query: string) => ({
          matches: query.includes('light') ? mediaQueryLight : !mediaQueryLight,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
        dispatchEvent: () => true,
      };

      (globalThis as any).document = {
        documentElement: {
          setAttribute: (k: string, v: string) => {
            mockAttributes[k] = v;
          },
          classList: {
            toggle: (cls: string, force?: boolean) => {
              if (force) mockClasses.add(cls);
              else mockClasses.delete(cls);
            },
            add: (cls: string) => mockClasses.add(cls),
            remove: (cls: string) => mockClasses.delete(cls),
            contains: (cls: string) => mockClasses.has(cls),
          },
        },
        querySelector: () => null,
      };

      (globalThis as any).localStorage = {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = String(v);
        },
      };
    });

    it('defaults stored theme to system when unset', async () => {
      const { getStoredTheme } = await import('../src/features/theme/themeService.ts');
      assert.equal(getStoredTheme(), 'system');
    });

    it('resolves explicit light and dark themes correctly', async () => {
      const { resolveEffectiveTheme } = await import('../src/features/theme/themeService.ts');
      assert.equal(resolveEffectiveTheme('light'), 'light');
      assert.equal(resolveEffectiveTheme('dark'), 'dark');
    });

    it('resolves system theme based on prefers-color-scheme media query', async () => {
      const { resolveEffectiveTheme } = await import('../src/features/theme/themeService.ts');
      mediaQueryLight = true;
      assert.equal(resolveEffectiveTheme('system'), 'light');

      mediaQueryLight = false;
      assert.equal(resolveEffectiveTheme('system'), 'dark');
    });

    it('applies theme attributes and classes to documentElement and saves preference', async () => {
      const { applyTheme, getStoredTheme } = await import('../src/features/theme/themeService.ts');

      applyTheme('light');
      assert.equal(mockAttributes['data-theme'], 'light');
      assert.ok(mockClasses.has('theme-light'));
      assert.ok(!mockClasses.has('theme-dark'));
      assert.equal(mockStorage['ob-theme-preference'], 'light');
      assert.equal(getStoredTheme(), 'light');

      applyTheme('dark');
      assert.equal(mockAttributes['data-theme'], 'dark');
      assert.ok(mockClasses.has('theme-dark'));
      assert.ok(!mockClasses.has('theme-light'));
      assert.equal(mockStorage['ob-theme-preference'], 'dark');
      assert.equal(getStoredTheme(), 'dark');
    });
  });

  describe('Component Theme Token Integrity (No hardcoded dark colors leaking into light theme)', () => {
    it('Section.tsx uses design tokens instead of hardcoded #080706', () => {
      const content = readFileSync(
        resolve(root, 'storefront-src/design-system/primitives/Section.tsx'),
        'utf8',
      );
      assert.doesNotMatch(content, /bgClasses[\s\S]*?bg-\[#080706\]/);
      assert.match(content, /var\(--ob-bg\)/);
    });

    it('GlassCard.tsx uses design tokens instead of hardcoded #13100D', () => {
      const content = readFileSync(
        resolve(root, 'storefront-src/design-system/primitives/GlassCard.tsx'),
        'utf8',
      );
      assert.doesNotMatch(content, /bg-\[#13100D\]/);
      assert.match(content, /var\(--ob-surface\)/);
    });

    it('SectionHeader.tsx title uses dynamic token instead of text-white', () => {
      const content = readFileSync(
        resolve(root, 'storefront-src/design-system/primitives/SectionHeader.tsx'),
        'utf8',
      );
      assert.doesNotMatch(content, /text-white tracking/);
      assert.match(content, /var\(--ob-text-primary\)/);
    });

    it('TransactionalPageShell.tsx uses design tokens instead of hardcoded #080706', () => {
      const content = readFileSync(
        resolve(root, 'storefront-src/design-system/cart/TransactionalPageShell.tsx'),
        'utf8',
      );
      assert.doesNotMatch(content, /bg-\[#080706\]/);
      assert.match(content, /var\(--ob-bg\)/);
    });

    it('MarketplaceKitchenCard.tsx uses design tokens for surfaces and text', () => {
      const content = readFileSync(
        resolve(root, 'storefront-src/design-system/marketplace/MarketplaceKitchenCard.tsx'),
        'utf8',
      );
      assert.doesNotMatch(content, /bg-\[#13100D\]/);
      assert.match(content, /var\(--ob-surface\)/);
      assert.match(content, /var\(--ob-text-primary\)/);
    });

    it('MarketplaceLayout.tsx root does not force hardcoded text-[#fff8f0]', () => {
      const content = readFileSync(
        resolve(root, 'src/shared/layouts/MarketplaceLayout.tsx'),
        'utf8',
      );
      assert.doesNotMatch(content, /text-\[#fff8f0\]/);
      assert.match(content, /var\(--ob-text-primary\)/);
    });

    it('HomeSpotlightMockFeed.tsx does not hardcode text-white header', () => {
      const content = readFileSync(
        resolve(root, 'src/features/experience/ui/home/HomeSpotlightMockFeed.tsx'),
        'utf8',
      );
      assert.doesNotMatch(content, /<h2 className="[^"]*text-white[^"]*">Popular Near You<\/h2>/);
    });

    it('bds.css provides [data-theme="light"] overrides for design system variables', () => {
      const content = readFileSync(resolve(root, 'src/styles/bds.css'), 'utf8');
      assert.match(content, /\[data-theme="light"\]/);
      assert.match(content, /--bds-color-background:\s*var\(--ob-bg/);
    });

    it('MenuItemCardView.tsx uses design tokens instead of hardcoded text-[#FFF8F0]', () => {
      const content = readFileSync(
        resolve(root, 'storefront-src/design-system/food/MenuItemCardView.tsx'),
        'utf8',
      );
      assert.doesNotMatch(content, /text-\[#FFF8F0\]/);
      assert.match(content, /var\(--ob-text-primary\)/);
    });

    it('MarketplaceBottomNavView.tsx uses design tokens instead of hardcoded bg-[#13100D]', () => {
      const content = readFileSync(
        resolve(root, 'storefront-src/design-system/adapters/marketplace/MarketplaceBottomNavView.tsx'),
        'utf8',
      );
      assert.doesNotMatch(content, /bg-\[#13100D\]/);
      assert.match(content, /var\(--ob-surface\)/);
    });

    it('OrderSummaryCardView.tsx uses design tokens instead of hardcoded text-[#FFF8F0]', () => {
      const content = readFileSync(
        resolve(root, 'storefront-src/design-system/orders/OrderSummaryCardView.tsx'),
        'utf8',
      );
      assert.doesNotMatch(content, /text-\[#FFF8F0\]/);
      assert.match(content, /var\(--ob-text-primary\)/);
    });

    it('index.html provides pre-hydration theme initialization to prevent flash', () => {
      const content = readFileSync(resolve(root, 'index.html'), 'utf8');
      assert.match(content, /ob-theme-preference/);
      assert.match(content, /setAttribute\('data-theme'/);
    });
  });
});
