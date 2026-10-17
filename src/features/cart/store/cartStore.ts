import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getActiveMenuRouteSlug, menuRouteRestaurantId } from '@/features/food/engine/foodMenuRouteContext';
import { useRestaurantContextStore } from '@/features/restaurant/store/restaurantContextStore';
import { notifyToast } from '@/shared/providers/BdsToastProvider';

export interface CartLineAddon {
  readonly id: string;
  readonly label: string;
  readonly price: number;
}

export interface CartLineInput {
  readonly foodId: string;
  readonly name: string;
  readonly price: number;
  readonly variantId?: string;
  readonly variantLabel?: string;
  readonly addons?: readonly CartLineAddon[];
  readonly instructions?: string;
}

export interface CartLine extends CartLineInput {
  readonly lineId: string;
  readonly quantity: number;
  readonly restaurantSlug: string;
  readonly restaurantId: string;
}

export interface AtomicPlanCommitParams {
  readonly proposalId: string;
  readonly restaurantId: string;
  readonly restaurantSlug?: string;
  readonly userSessionId?: string | null;
  readonly expectedCartRevision?: number;
  readonly expiresAt?: number;
  readonly actions: readonly {
    readonly type: string;
    readonly payload?: Readonly<Record<string, unknown>>;
  }[];
}

export interface AtomicPlanCommitResult {
  readonly success: boolean;
  readonly appliedCount: number;
  readonly reason?: string;
  readonly newRevision?: number;
  readonly error?: string;
}

interface CartState {
  readonly lines: readonly CartLine[];
  readonly restaurantSlug: string | null;
  readonly visible: boolean;
  readonly revision: number;
  readonly userSessionId: string | null;
  /** True once zustand persist has finished rehydrating from storage. */
  _hasHydrated: boolean;
  setRestaurant: (slug: string) => void;
  setUserSessionId: (id: string | null) => void;
  addItem: (line: CartLineInput, quantity?: number) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  clear: () => void;
  _setHasHydrated: (value: boolean) => void;
  commitAtomicBatchPlan: (params: AtomicPlanCommitParams) => AtomicPlanCommitResult;
}

const CROSS_RESTAURANT_TOAST =
  'Your cart was cleared because items can only be ordered from one restaurant at a time.';

function readRestaurantContext(): { restaurantSlug: string; restaurantId: string } | null {
  const ctx = useRestaurantContextStore.getState();
  if (ctx.restaurantSlug && ctx.restaurantId) {
    return { restaurantSlug: ctx.restaurantSlug, restaurantId: ctx.restaurantId };
  }

  const cartSlug = useCartStore.getState().restaurantSlug;
  if (cartSlug) {
    return { restaurantSlug: cartSlug, restaurantId: menuRouteRestaurantId(cartSlug) };
  }

  const menuRouteSlug = getActiveMenuRouteSlug();
  if (menuRouteSlug) {
    return {
      restaurantSlug: menuRouteSlug,
      restaurantId: menuRouteRestaurantId(menuRouteSlug),
    };
  }

  return null;
}

export function buildCartLineId(
  input: Pick<CartLineInput, 'foodId' | 'variantId' | 'addons' | 'instructions'>,
): string {
  const addonIds = (input.addons ?? []).map((addon) => addon.id).sort().join(',');
  const instructions = input.instructions?.trim() ?? '';
  const hasExtras = Boolean(input.variantId || addonIds || instructions);
  if (!hasExtras) return input.foodId;
  return `${input.foodId}:${input.variantId ?? ''}:${addonIds}:${instructions}`;
}

function notifyCrossRestaurantSwitch(): void {
  notifyToast(CROSS_RESTAURANT_TOAST, 'warning');
}

/**
 * Determines if a cross-restaurant clear should be allowed.
 * Returns true ONLY if both cart and restaurant context stores are hydrated
 * AND there is a confirmed restaurant mismatch.
 *
 * UNKNOWN context (null/undefined during hydration) MUST NOT trigger a clear.
 */
function canClearForRestaurantMismatch(
  currentSlug: string | null,
  newSlug: string,
  hasItems: boolean
): boolean {
  // Check hydration state
  // useRestaurantContextStore.persist.hasHydrated
  // useCartStore.persist.hasHydrated
  // Don't clear during hydration race
  const contextPersist = (useRestaurantContextStore as unknown as { persist?: { hasHydrated?: () => boolean } }).persist;
  const cartPersist = (useCartStore as unknown as { persist?: { hasHydrated?: () => boolean } }).persist;

  const contextHydrated =
    typeof contextPersist?.hasHydrated === 'function'
      ? contextPersist.hasHydrated()
      : Boolean(useRestaurantContextStore.getState().restaurantSlug && useRestaurantContextStore.getState().contextToken);

  const cartHydrated =
    typeof cartPersist?.hasHydrated === 'function'
      ? cartPersist.hasHydrated()
      : Boolean(useCartStore.getState().restaurantSlug || useCartStore.getState().lines.length > 0);

  if (!contextHydrated || !cartHydrated) {
    return false; // Don't clear during hydration race / unknown state
  }

  // Only clear if there's a CONFIRMED mismatch
  return hasItems && Boolean(currentSlug && currentSlug !== newSlug);
}

const appliedProposalIds = new Set<string>();

export function _resetAppliedProposalIdsForTesting(): void {
  appliedProposalIds.clear();
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      restaurantSlug: null,
      visible: false,
      revision: 1,
      userSessionId: null,
      _hasHydrated: false,

      _setHasHydrated: (value) => set({ _hasHydrated: value }),
      setUserSessionId: (id) => set({ userSessionId: id }),

      setRestaurant: (slug) => {
        const prev = get();
        if (prev.restaurantSlug !== slug) {
          // Only clear cart if BOTH stores are hydrated AND there's a confirmed mismatch
          if (canClearForRestaurantMismatch(prev.restaurantSlug, slug, prev.lines.length > 0)) {
            notifyCrossRestaurantSwitch();
            set({ restaurantSlug: slug, lines: [], revision: (prev.revision || 1) + 1, visible: false });
          } else {
            // Just update the slug, keep existing cart items
            set({ restaurantSlug: slug });
          }
        }
      },

      addItem: (line, quantity = 1) => {
        const ctx = readRestaurantContext();
        if (!ctx) {
          notifyToast('Open a restaurant menu before adding items to cart.', 'warning');
          return;
        }

        let current = get().lines;
        // Only clear for mismatch if both stores are hydrated and confirmed mismatch
        if (
          current.length > 0 &&
          current[0].restaurantSlug !== ctx.restaurantSlug &&
          canClearForRestaurantMismatch(current[0].restaurantSlug, ctx.restaurantSlug, true)
        ) {
          notifyCrossRestaurantSwitch();
          current = [];
        }

        const nextRev = (get().revision || 1) + 1;
        const lineId = buildCartLineId(line);
        const existing = current.find((l) => l.lineId === lineId);
        if (existing) {
          set({
            restaurantSlug: ctx.restaurantSlug,
            revision: nextRev,
            lines: current.map((l) =>
              l.lineId === lineId
                ? { ...l, quantity: l.quantity + quantity }
                : l,
            ),
            visible: true,
          });
          return;
        }

        set({
          restaurantSlug: ctx.restaurantSlug,
          revision: nextRev,
          lines: [
            ...current,
            {
              ...line,
              lineId,
              quantity,
              restaurantSlug: ctx.restaurantSlug,
              restaurantId: ctx.restaurantId,
            },
          ],
          visible: true,
        });
      },

      setQuantity: (lineId, quantity) => {
        const nextRev = (get().revision || 1) + 1;
        if (quantity <= 0) {
          const next = get().lines.filter((l) => l.lineId !== lineId);
          set({ lines: next, revision: nextRev, visible: next.length > 0 });
          return;
        }
        set({
          revision: nextRev,
          lines: get().lines.map((l) =>
            l.lineId === lineId ? { ...l, quantity } : l,
          ),
          visible: true,
        });
      },

      clear: () => set({ lines: [], revision: (get().revision || 1) + 1, visible: false }),

      commitAtomicBatchPlan: (params) => {
        const current = get();

        // 1. Replay protection
        if (appliedProposalIds.has(params.proposalId)) {
          return {
            success: false,
            appliedCount: 0,
            reason: 'PROPOSAL_REPLAYED',
            error: 'This proposed change has already been confirmed and applied.',
          };
        }

        // 2. Expiry protection
        if (params.expiresAt && Date.now() > params.expiresAt) {
          return {
            success: false,
            appliedCount: 0,
            reason: 'PROPOSAL_EXPIRED',
            error: 'This proposed plan has expired. Please review and reconfirm.',
          };
        }

        // 3. Stale revision protection
        const currentRev = current.revision || 1;
        if (params.expectedCartRevision !== undefined && params.expectedCartRevision !== currentRev) {
          return {
            success: false,
            appliedCount: 0,
            reason: 'CART_REVISION_MISMATCH',
            error: 'Cart contents were modified since proposal was created. Please reconfirm.',
          };
        }

        // 4. Restaurant context binding:
        // If cart already has items, they must belong to the same restaurant
        if (current.lines.length > 0) {
          const cartRestId = current.lines[0].restaurantId;
          const cartRestSlug = current.lines[0].restaurantSlug;
          if (
            (params.restaurantId && cartRestId && cartRestId !== params.restaurantId) ||
            (params.restaurantSlug && cartRestSlug && cartRestSlug !== params.restaurantSlug)
          ) {
            return {
              success: false,
              appliedCount: 0,
              reason: 'RESTAURANT_MISMATCH',
              error: 'Proposal restaurant does not match active restaurant cart.',
            };
          }
        }

        // 5. User or guest session identity binding
        if (
          params.userSessionId &&
          current.userSessionId &&
          params.userSessionId !== current.userSessionId
        ) {
          return {
            success: false,
            appliedCount: 0,
            reason: 'SESSION_MISMATCH',
            error: 'Account or session has changed. Proposal cannot be applied across sessions.',
          };
        }

        // 6. Atomically compute candidate next state in memory with deep isolation
        // If ANY action cannot be computed, NOT A SINGLE LINE or nested addon is mutated!
        const deepCloneCartLines = (lines: readonly CartLine[]): CartLine[] =>
          lines.map((l) => ({
            ...l,
            addons: l.addons ? l.addons.map((a) => ({ ...a })) : undefined,
          }));

        let candidate: CartLine[] = deepCloneCartLines(current.lines);
        const targetSlug =
          params.restaurantSlug ||
          current.restaurantSlug ||
          readRestaurantContext()?.restaurantSlug ||
          (current.lines.length > 0 ? current.lines[0].restaurantSlug : 'default');
        const targetRestId =
          params.restaurantId ||
          (current.lines.length > 0 ? current.lines[0].restaurantId : 'default');

        for (const action of params.actions) {
          if (action.type === 'cart_add_plan') {
            const p = action.payload || {};
            const foodId = String(p.foodId || p.itemId || p.menuItemId || '').trim();
            const name = String(p.name || p.title || '').trim();
            const rawPrice = p.price !== undefined ? p.price : p.unitPrice;
            const price = typeof rawPrice === 'number' && Number.isFinite(rawPrice) ? rawPrice : Number(rawPrice);
            const rawQty = p.quantity !== undefined ? p.quantity : 1;
            const quantity = Math.max(1, Math.round(Number(rawQty) || 1));

            if (!foodId || !name || isNaN(price) || price < 0) {
              return {
                success: false,
                appliedCount: 0,
                reason: 'VALIDATION_FAILED',
                error: 'Invalid cart_add_plan payload: missing foodId, name, or valid price',
              };
            }

            const lineInput: CartLineInput = {
              foodId,
              name,
              price,
              ...(typeof p.variantId === 'string' && p.variantId ? { variantId: p.variantId } : {}),
              ...(typeof p.variantLabel === 'string' && p.variantLabel ? { variantLabel: p.variantLabel } : {}),
              ...(typeof p.instructions === 'string' && p.instructions ? { instructions: p.instructions } : {}),
            };
            const lineId = buildCartLineId(lineInput);
            const existingIdx = candidate.findIndex((l) => l.lineId === lineId);
            if (existingIdx >= 0) {
              candidate[existingIdx] = {
                ...candidate[existingIdx],
                quantity: candidate[existingIdx].quantity + quantity,
              };
            } else {
              candidate.push({
                ...lineInput,
                lineId,
                quantity,
                restaurantSlug: targetSlug,
                restaurantId: targetRestId,
              });
            }
          } else if (action.type === 'cart_update_plan') {
            const p = action.payload || {};
            const lineId = String(p.lineId || p.foodId || p.itemId || '').trim();
            const rawQty = p.quantity !== undefined ? p.quantity : NaN;
            const quantity = typeof rawQty === 'number' ? rawQty : Number(rawQty);
            if (!lineId || isNaN(quantity)) {
              return {
                success: false,
                appliedCount: 0,
                reason: 'VALIDATION_FAILED',
                error: 'Invalid cart_update_plan payload: missing lineId or quantity',
              };
            }
            const existingIdx = candidate.findIndex(
              (l) => l.lineId === lineId || l.foodId === lineId,
            );
            if (existingIdx === -1) {
              return {
                success: false,
                appliedCount: 0,
                reason: 'TARGET_LINE_NOT_FOUND',
                error: `Line ${lineId} not found in cart for update`,
              };
            }
            const newQty = Math.max(0, Math.round(quantity));
            if (newQty === 0) {
              candidate = candidate.filter((_, idx) => idx !== existingIdx);
            } else {
              candidate[existingIdx] = {
                ...candidate[existingIdx],
                quantity: newQty,
              };
            }
          } else if (action.type === 'cart_remove_plan') {
            const p = action.payload || {};
            const lineId = String(p.lineId || p.foodId || p.itemId || '').trim();
            if (!lineId) {
              return {
                success: false,
                appliedCount: 0,
                reason: 'VALIDATION_FAILED',
                error: 'Invalid cart_remove_plan payload: missing lineId',
              };
            }
            const existingIdx = candidate.findIndex(
              (l) => l.lineId === lineId || l.foodId === lineId,
            );
            if (existingIdx === -1) {
              return {
                success: false,
                appliedCount: 0,
                reason: 'TARGET_LINE_NOT_FOUND',
                error: `Line ${lineId} not found in cart for removal`,
              };
            }
            candidate = candidate.filter((_, idx) => idx !== existingIdx);
          } else {
            return {
              success: false,
              appliedCount: 0,
              reason: 'UNSUPPORTED_ACTION',
              error: `Unsupported action type: ${(action as any).type}`,
            };
          }
        }

        // 7. Success: All actions validated, single atomic state transition committed!
        appliedProposalIds.add(params.proposalId);
        const nextRevision = (current.revision || 1) + 1;
        set({
          lines: candidate,
          revision: nextRevision,
          restaurantSlug: candidate.length > 0 ? candidate[0].restaurantSlug : current.restaurantSlug,
          visible: candidate.length > 0,
        });

        return {
          success: true,
          appliedCount: params.actions.length,
          newRevision: nextRevision,
        };
      },
    }),
    { name: 'ob-cart-m7',
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true;
          if (state.lines.length > 0) {
            useCartStore.setState({ visible: true });
          }
        }
      },
    },
  ),
);

export function cartLineUnitPrice(line: CartLine): number {
  const addonsTotal = line.addons?.reduce((sum, addon) => sum + addon.price, 0) ?? 0;
  return line.price + addonsTotal;
}

export function cartSubtotal(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + cartLineUnitPrice(line) * line.quantity, 0);
}

export function cartItemCount(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function formatCartLineTotal(line: CartLine): string {
  return `₹${cartLineUnitPrice(line) * line.quantity}`;
}
