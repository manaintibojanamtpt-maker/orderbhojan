import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Regression test: DiscoveryRestaurantCard ETA rendering.
 *
 * Note: Full DOM render testing requires jsdom + testing-library which are
 * not part of the node:test runner. This test verifies the component module
 * is importable and the ETA rendering logic is correct by inspecting the
 * component source behavior contract.
 *
 * The actual fix is in DiscoveryRestaurantCard.tsx:
 *   - hasEta = typeof deliveryTimeMinutes === 'number' && deliveryTimeMinutes > 0
 *   - hasEta ? "{deliveryTimeMinutes} min" : "Calculating…"
 *   - No hardcoded fallback like "25–35 min"
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mapRestaurantPublicToKitchenCard } from '../src/presentation/discovery/mapRestaurantToKitchenCard.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

describe('DiscoveryRestaurantCard ETA regression', () => {
  it('component source exists and re-exports OrderBhojanKitchenCard', () => {
    const srcPath = resolve(root, 'src/features/discovery/ui/DiscoveryRestaurantCard.tsx');
    const src = readFileSync(srcPath, 'utf8');
    assert.ok(src.length > 0, 'component source file should not be empty');
    assert.ok(src.includes('OrderBhojanKitchenCard'), 'should re-export OrderBhojanKitchenCard');
  });

  it('has NO hardcoded static ETA fallback like "25–35 min"', () => {
    const cardPath = resolve(root, 'src/presentation/discovery/OrderBhojanKitchenCard.tsx');
    const cardSrc = readFileSync(cardPath, 'utf8');
    assert.ok(!cardSrc.includes('25–35 min'), 'must not contain hardcoded ETA fallback');
    assert.ok(!cardSrc.includes('25-35 min'), 'must not contain hardcoded ETA fallback');
  });

  it('renders the backend-provided ETA when etaMinutes is present', () => {
    const cardPath = resolve(root, 'src/presentation/discovery/OrderBhojanKitchenCard.tsx');
    const cardSrc = readFileSync(cardPath, 'utf8');
    assert.ok(cardSrc.includes('kitchen.etaMins !== undefined'), 'must check kitchen.etaMins !== undefined');
    assert.ok(cardSrc.includes('{kitchen.etaMins} min'), 'must render {kitchen.etaMins} min');

    const mapped = mapRestaurantPublicToKitchenCard({
      restaurantId: 'test-1',
      restaurantSlug: 'test-slug',
      displayName: 'Test Kitchen',
      isOpen: true,
      badges: [],
      cuisines: ['South Indian'],
      etaMinutes: { min: 20, max: 30 },
    } as any);
    assert.equal(mapped.etaMins, 25);
  });

  it('omits ETA when backend etaMinutes is absent or null', () => {
    const mapped = mapRestaurantPublicToKitchenCard({
      restaurantId: 'test-2',
      restaurantSlug: 'test-slug-2',
      displayName: 'Test Kitchen 2',
      isOpen: true,
      badges: [],
      cuisines: ['South Indian'],
      etaMinutes: null,
    } as any);
    assert.equal(mapped.etaMins, undefined);
  });
});
