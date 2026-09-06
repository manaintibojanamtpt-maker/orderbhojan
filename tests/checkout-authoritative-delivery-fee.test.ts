import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

describe('checkout authoritative delivery fee — server quote is the only fee source', () => {
  const flow = readFileSync(join(root, 'src/features/checkout/hooks/useCheckoutFlow.ts'), 'utf8');
  const page = readFileSync(join(root, 'src/presentation/checkout/OrderBhojanCheckoutPage.tsx'), 'utf8');
  const estimator = readFileSync(join(root, 'src/features/checkout/domain/deliveryFeeEstimator.ts'), 'utf8');
  const payload = readFileSync(join(root, 'src/features/checkout/domain/checkoutPayload.ts'), 'utf8');

  it('pre-quote checkout does not compute or surface a local delivery fee estimate', () => {
    assert.doesNotMatch(flow, /estimateLocalDeliveryFee|getCachedDeliveryFeeEstimate/);
    assert.doesNotMatch(flow, /localDeliveryFeeEstimate/);
    // The dangerous (0,0) fallback must not exist in the checkout fee path.
    assert.doesNotMatch(flow, /restaurantLat \?\? 0|restaurantLng \?\? 0/);
  });

  it('pre-quote bill shows "Delivery fee — Calculating…" instead of a fabricated fee', () => {
    assert.doesNotMatch(page, /Delivery fee \(estimated\)/);
    assert.doesNotMatch(page, /localDeliveryFeeEstimate/);
    assert.match(page, /\{ label: 'Delivery fee', amountLabel: 'Calculating…' \}/);
    assert.match(page, /Delivery fee — Calculating…/);
    // Estimated total must not be inflated by a guessed fee.
    assert.doesNotMatch(page, /estimatedSubtotal \+ \(localDeliveryFeeEstimate/);
  });

  it('renders the authoritative quote delivery fee after prepare succeeds', () => {
    assert.match(page, /quote\.lineItems/);
    assert.match(page, /totalLabel: `₹\$\{quote\.grandTotal\}`/);
    assert.match(page, /quote\.deliveryPending/);
  });

  it('Place Order CTA uses only the server-authoritative quote total', () => {
    // Pre-quote CTA: no fabricated amount.
    assert.match(page, /if \(!quoteReady\) \{/);
    assert.match(page, /'Updating total…'/);
    // Post-quote CTA: quote.grandTotal only.
    assert.match(page, /const total = quote \? `₹\$\{quote\.grandTotal\}`/);
    assert.doesNotMatch(page, /Place order · ~|~₹/);
  });

  it('missing or zero restaurant coordinates never become a priced (0,0) route', () => {
    assert.match(estimator, /restaurantLat === 0 && restaurantLng === 0/);
    assert.match(estimator, /\(0,0\) origin/);
    assert.match(estimator, /Number\.isFinite\(restaurantLat\)/);
    assert.match(estimator, /Number\.isFinite\(restaurantLng\)/);
  });

  it('cached delivery-fee estimates cannot override a fresh authoritative quote', () => {
    // The checkout flow never reads the estimator cache for the quote path.
    assert.doesNotMatch(flow, /getCachedDeliveryFeeEstimate/);
    // The quote itself always wins: it is read straight from the prepare query/session.
    assert.match(flow, /prepareQuery\.data/);
  });

  it('final order payload never sends a client delivery fee', () => {
    assert.doesNotMatch(payload, /deliveryFee/);
    // grand total authority lives server-side (quote + recompute at place).
    assert.match(payload, /deliveryAddress/);
  });

  it('server-authoritative grand total = subtotal + deliveryFee + packaging + taxes (documented by quote lineItems)', () => {
    // The authoritative bill is assembled from quote.lineItems + quote.grandTotal;
    // the frontend never re-sums a guessed fee into the total.
    assert.match(page, /\.\.\.quote\.lineItems\.map/);
    assert.match(page, /quote\.grandTotal/);
  });
});