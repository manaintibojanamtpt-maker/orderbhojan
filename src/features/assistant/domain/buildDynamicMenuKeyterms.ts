/**
 * Dynamic Menu Keyterms Builder for Sarvam Saaras v4 STT Biasing
 *
 * Grounded in Sarvam AI Saaras v4 requirements:
 * - Max 50 keyterms
 * - Max 64 characters per keyterm
 * - Case-insensitive deduplication
 * - Multilingual food vocabulary for Telugu, Hindi, Marathi, and Indian English
 */

export interface RestaurantContextForKeyterms {
  restaurantName?: string;
  cuisineTypes?: readonly string[];
  dishes?: ReadonlyArray<{ name: string; category?: string }>;
  cartItems?: ReadonlyArray<{ name: string }>;
  searchCategories?: readonly string[];
}

/**
 * Standard Indic food vocabulary and conversational ordering verbs.
 * Biases ASR to accurately capture code-mixed and vernacular orders.
 */
export const CORE_ORDERING_VOCABULARY: readonly string[] = Object.freeze([
  // Common Dishes
  'Biryani',
  'Chicken Biryani',
  'Mutton Biryani',
  'Dum Biryani',
  'Masala Dosa',
  'Ghee Roast Dosa',
  'Plain Dosa',
  'Idli',
  'Sambar Vada',
  'Poori Masala',
  'Curd Rice',
  'Paneer Butter Masala',
  'Butter Naan',
  'Roti',
  'Veg Meals',
  'South Indian Thali',
  'Filter Coffee',
  'Masala Chai',
  'Thums Up',
  'Gulab Jamun',
  // Multilingual ordering verbs & modifiers (Telugu, Hindi, English)
  'kavali',
  'chahiye',
  'parcel',
  'pack cheyyandi',
  'order cheyyi',
  'rendu',
  'moodu',
  'okati',
  'do',
  'teen',
  'ek',
  'extra spicy',
  'less spicy',
  'without onion',
]);

/**
 * Sanitizes and enforces Saaras v4 keyterm bounds:
 * - String trimming and control char removal
 * - Max 64 chars per term
 * - Case-insensitive deduplication
 * - Max 50 items
 */
export function sanitizeKeyterms(
  candidates: readonly string[],
  maxCount = 50,
  maxChars = 64,
): string[] {
  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;

    // Clean whitespace and control chars
    const clean = raw.replace(/[\r\n\t\0]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) continue;

    // Cap at maxChars (64)
    const truncated = clean.length > maxChars ? clean.slice(0, maxChars).trim() : clean;
    if (!truncated) continue;

    const lower = truncated.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      sanitized.push(truncated);
      if (sanitized.length >= maxCount) {
        break;
      }
    }
  }

  return sanitized;
}

/**
 * Constructs a prioritized keyterms list dynamically from active context and core food vocabulary.
 */
export function buildDynamicMenuKeyterms(
  context?: RestaurantContextForKeyterms,
  customKeyterms?: readonly string[],
): string[] {
  const candidates: string[] = [];

  // 1. Highest Priority: Active cart items and specific restaurant name
  if (context?.restaurantName) {
    candidates.push(context.restaurantName);
  }
  if (context?.cartItems) {
    for (const item of context.cartItems) {
      if (item.name) candidates.push(item.name);
    }
  }

  // 2. High Priority: Caller-supplied custom keyterms
  if (customKeyterms && customKeyterms.length > 0) {
    candidates.push(...customKeyterms);
  }

  // 3. Medium Priority: Active dishes from current restaurant
  if (context?.dishes) {
    for (const dish of context.dishes) {
      if (dish.name) candidates.push(dish.name);
      if (dish.category) candidates.push(dish.category);
    }
  }

  // 4. Cuisine categories
  if (context?.cuisineTypes) {
    candidates.push(...context.cuisineTypes);
  }
  if (context?.searchCategories) {
    candidates.push(...context.searchCategories);
  }

  // 5. Core Ordering Vocabulary (Telugu, Hindi, English)
  candidates.push(...CORE_ORDERING_VOCABULARY);

  // Sanitize, deduplicate, and bound strictly to 50 terms, 64 chars
  return sanitizeKeyterms(candidates, 50, 64);
}
