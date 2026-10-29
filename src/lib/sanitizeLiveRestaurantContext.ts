import { isFeatureEnabled, loadFeatureFlags } from '@/featureFlags';
import { useRestaurantContextStore } from '@/features/restaurant/store/restaurantContextStore';
import { useCartStore } from '@/features/cart/store/cartStore';
import { notifyToast } from '@/shared/providers/BdsToastProvider';

const MOCK_RESTAURANT_SLUGS = new Set([
  'mana-inti-kitchen',
  'demo-biryani-house',
  'demo-dosa-corner',
  'demo-cloud-kitchen',
]);

export const RESTAURANT_SLUG_MISMATCH_TOAST =
  'Your cart was cleared because items can only be ordered from one restaurant at a time.';

/** Clears mock/demo cart + restaurant context when live Firestore sync is active. */
export function sanitizeLiveRestaurantContext(): void {
  const flags = loadFeatureFlags();
  if (!isFeatureEnabled(flags, 'FF_OB_FIRESTORE')) return;

  const ctx = useRestaurantContextStore.getState();
  const staleSyntheticId = ctx.restaurantId?.startsWith('rest_') ?? false;
  const mockSlug = ctx.restaurantSlug ? MOCK_RESTAURANT_SLUGS.has(ctx.restaurantSlug) : false;

  if (staleSyntheticId || mockSlug) {
    useRestaurantContextStore.getState().clear();
  }

  const cart = useCartStore.getState();
  if (cart.restaurantSlug && MOCK_RESTAURANT_SLUGS.has(cart.restaurantSlug)) {
    cart.clear();
  }
}

/**
 * Clears persisted restaurant context and cart when the user opens a different
 * restaurant than the one stored locally. Always warns before clearing.
 *
 * CRITICAL: Only clears if BOTH cart and context are confirmed/hydrated.
 * UNKNOWN context (null/undefined during hydration) MUST NOT trigger a clear.
 */
export function sanitizeRestaurantSlugContext(routeSlug: string): void {
  if (!routeSlug) return;

  const ctx = useRestaurantContextStore.getState();
  const cart = useCartStore.getState();

  // Check if stores are hydrated - if not, DO NOT clear (hydration race)
  // If either store hasn't hydrated, we cannot trust the comparison - defer
  // UNKNOWN context (null/undefined during hydration) MUST NOT trigger a clear.
  // const contextHydrated = useRestaurantContextStore.persist.hasHydrated;
  // const cartHydrated = useCartStore.persist.hasHydrated;
  // if (!contextHydrated || !cartHydrated) {
  //   return;
  // }
  const contextPersist = (useRestaurantContextStore as unknown as { persist?: { hasHydrated?: () => boolean } }).persist;
  const cartPersist = (useCartStore as unknown as { persist?: { hasHydrated?: () => boolean } }).persist;

  const contextHydrated =
    typeof contextPersist?.hasHydrated === 'function'
      ? contextPersist.hasHydrated()
      : true;

  const cartHydrated =
    typeof cartPersist?.hasHydrated === 'function'
      ? cartPersist.hasHydrated()
      : true;

  // Context mismatch: stored context exists AND differs from route
  // Requires CONFIRMED non-null restaurantSlug — impossible if truly unhydrated
  const contextMismatch = Boolean(ctx.restaurantSlug && ctx.restaurantSlug !== routeSlug);
  // Cart mismatch: cart has items AND its restaurant differs from route
  // Requires CONFIRMED non-null restaurantSlug AND non-empty lines — impossible if truly unhydrated
  const cartMismatch = Boolean(
    cart.restaurantSlug && cart.restaurantSlug !== routeSlug && cart.lines.length > 0,
  );

  // If there's a mismatch but the corresponding store isn't hydrated, defer
  if (contextMismatch && !contextHydrated) return;
  if (cartMismatch && !cartHydrated) return;

  if (!contextMismatch && !cartMismatch) return;

  // If there's a mismatch but the corresponding store isn't hydrated, defer
  if (contextMismatch && !contextHydrated) return;
  if (cartMismatch && !cartHydrated) return;

  if (!contextMismatch && !cartMismatch) return;

  notifyToast(RESTAURANT_SLUG_MISMATCH_TOAST, 'warning');
  useRestaurantContextStore.getState().clear();
  cart.clear();
}

export function resolveCheckoutRestaurantId(
  restaurantId: string | null,
  restaurantSlug: string | null,
): string {
  if (restaurantId?.startsWith('obr_')) return restaurantId;
  if (restaurantId && !restaurantId.startsWith('rest_')) return restaurantId;
  if (restaurantSlug) return restaurantSlug;
  return restaurantId ?? '';
}
