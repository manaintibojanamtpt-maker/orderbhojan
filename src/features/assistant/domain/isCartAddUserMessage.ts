/** Free-form cart-add intent — builds non-executable plans for validate + confirm. */

import { expandIndicOrderingUtterance, canonicalizeOrderingText } from './orderingTextNormalize';
import type { CartPlanAction } from './cartPlanContract';
import { normalizeKitchenAsr } from './kitchenAsrNormalize';
import {
  normalizeQuantityAsr,
  parseQuantityToken,
} from './quantityAsrNormalize';

export interface ParsedCartAddIntent {
  readonly quantity: number;
  readonly itemName: string;
  readonly kitchenHint?: string;
  readonly instructions?: string;
}

/** ASR-tolerant “from” separator (from / feom / fom / form / nundi). */
const FROM_SEP = String.raw`(?:from|feom|fom|form|fro|nundi|నుండి|నుంచి)\s+`;

const QTY_WORD =
  'one|won|two|three|tree|four|five|six|seven|eight|ate|nine|ten|a|an|rendu|moodu|nalugu|రెండు|మూడు|నాలుగు';

const ORDER_INTENT_PREFIX =
  String.raw`(?:i\s+want(?:\s+to)?(?:\s+(?:order|have|eat|get|add|buy))?|i'?d\s+like(?:\s+to)?(?:\s+(?:order|have|eat|get|add|buy))?|get\s+me|give\s+me|order)`;

const ADD_PATTERNS: readonly RegExp[] = [
  // add 2 quantity Masala Dosa from Inti bhojanam
  new RegExp(
    String.raw`^(?:please\s+)?add\s+(\d+)\s*(?:x|×|times|quantity|qty)?\s+(.+?)\s+${FROM_SEP}(.+)$`,
    'i',
  ),
  new RegExp(
    String.raw`^(?:please\s+)?add\s+(\d+)\s*(?:x|×|times|quantity|qty)?\s+(.+)$`,
    'i',
  ),
  // add two / to quantity Masala Dosa from Inti…
  new RegExp(
    String.raw`^(?:please\s+)?add\s+(${QTY_WORD})\s*(?:x|×|times|quantity|qty)?\s+(.+?)\s+${FROM_SEP}(.+)$`,
    'i',
  ),
  new RegExp(
    String.raw`^(?:please\s+)?add\s+(${QTY_WORD})\s*(?:x|×|times|quantity|qty)?\s+(.+)$`,
    'i',
  ),
  /^(?:please\s+)?add\s+(\d+)\s+(.+?)\s+to\s+(?:my\s+)?cart\s*[.!]?$/i,
  /^(?:please\s+)?add\s+(.+?)\s+to\s+(?:my\s+)?cart\s*[.!]?$/i,
  /^(?:please\s+)?(?:put|include)\s+(\d+)\s+(.+?)\s+in\s+(?:my\s+)?cart\s*[.!]?$/i,
  // I want 2 Andhra Veg Thali from …
  new RegExp(
    String.raw`^(?:please\s+)?${ORDER_INTENT_PREFIX}\s+(\d+)\s+(.+?)\s+${FROM_SEP}(.+)$`,
    'i',
  ),
  new RegExp(
    String.raw`^(?:please\s+)?${ORDER_INTENT_PREFIX}\s+(\d+)\s+(.+)$`,
    'i',
  ),
  new RegExp(
    String.raw`^(?:please\s+)?${ORDER_INTENT_PREFIX}\s+(${QTY_WORD})\s+(.+?)\s+${FROM_SEP}(.+)$`,
    'i',
  ),
  new RegExp(
    String.raw`^(?:please\s+)?${ORDER_INTENT_PREFIX}\s+(${QTY_WORD})\s+(.+)$`,
    'i',
  ),
  // I want Andhra Veg Thali / order masala dosa from …
  new RegExp(
    String.raw`^(?:please\s+)?${ORDER_INTENT_PREFIX}\s+(.+?)\s+${FROM_SEP}(.+)$`,
    'i',
  ),
  new RegExp(
    String.raw`^(?:please\s+)?${ORDER_INTENT_PREFIX}\s+(.+)$`,
    'i',
  ),
  // add Masala Dosa from Inti bhojanam
  new RegExp(String.raw`^(?:please\s+)?add\s+(.+?)\s+${FROM_SEP}(.+)$`, 'i'),
  // add Masala Dosa
  /^(?:please\s+)?add\s+(.+)$/i,
  /^(\d+)\s*[x×]\s*(.+)$/i,
  // Telugu / Hinglish waiter style
  new RegExp(
    String.raw`^(rendu|two|2|రెండు|moodu|three|3|మూడు|nalugu|four|4|నాలుగు)\s+(.+?)\s+${FROM_SEP}(.+)$`,
    'i',
  ),
  /^(rendu|two|2|రెండు|moodu|three|3|మూడు)\s+(.+)$/iu,
];

export function cleanItemName(raw: string): string {
  return raw
    .replace(/\bto\s+(?:my\s+)?cart\b/gi, '')
    .replace(/\b(?:naa\s+cart\s*ki|naa\s*kaki|cart\s*ki|cart\s*lo|cart\s*mein|cart\s*me|kaki)\b/gi, '')
    .replace(/\b(?:add\s*cheyi|add\s*cheyyi|pettandi|vei|kavali|kavale|dalo|daalo|add\s*karo|kardo|rakho)\b/gi, '')
    .replace(/\b(?:please|quantity|qty)\b/gi, '')
    // Normalize food plurals to singular menu forms
    .replace(/\b(dosas|rotis|biryanis|idlis|vadas|parathas|thalis|coffees|teas)\b/gi, (m) => m.slice(0, -1))
    .replace(/\bcurries\b/gi, 'curry')
    // Strip leading verbs if residual
    .replace(/^(?:to\s+)?(?:order|have|eat|get|add|buy)\s+/i, '')
    // ASR often prefixes dishes with articles: “An Andhra Veg Thali”.
    .replace(/^(?:a|an|the)\s+/i, '')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize common ASR typos before regex parse. */
function normalizeAddUtterance(raw: string): string {
  return normalizeKitchenAsr(normalizeQuantityAsr(expandIndicOrderingUtterance(raw)))
    .replace(/\b(feom|fom|frm|fro|form)\b/gi, 'from')
    .replace(/\b(masla|masaala|malasa)\b/gi, 'masala')
    .replace(/\b(naa\s*kaki|na\s*kaki|kaki)\b/gi, 'cart ki')
    .replace(/\b(inti\s*bojanam|intibojanam|inti\s*bhojan|antibody)\b/gi, 'inti bhojanam')
    .replace(/\s+/g, ' ')
    .trim();
}

function isQuantityToken(token: string | undefined): boolean {
  if (!token) return false;
  return parseQuantityToken(token) != null;
}

/**
 * Telugu / Tanglish / Hindi SOV order:
 * "2 Masala Dosa add cheyi"
 * "masala dosa rendu add cheyi"
 * "2 Veg Meals cart mein dalo"
 * "chicken biryani okati kavali"
 * "idli 2 pettandi"
 */
function parseTeluguAddOrder(text: string): ParsedCartAddIntent | null {
  // Pattern 1: <dish> <quantity> [naa cart ki|cart ki|cart lo]? (add cheyi|pettandi|vei|kavali|kavale)
  const teluguMatch = text.match(
    /^(.+?)\s+(rendu|two|2|రెండు|moodu|three|3|మూడు|nalugu|four|4|నాలుగు|okati|one|1|ఒకటి|aidu|five|5|ఐదు)(?:\s+(?:naa\s+cart\s*ki|cart\s*ki|cart\s*lo|to\s+(?:my\s+)?cart))?\s+(?:add\s*cheyi|add\s*cheyyi|pettandi|vei|kavali|kavale|add)\s*$/iu,
  );
  if (teluguMatch) {
    const itemName = cleanItemName(teluguMatch[1] ?? '');
    const quantity = parseQuantityToken(teluguMatch[2]);
    if (quantity != null && itemName.length >= 2) {
      return { quantity, itemName };
    }
  }

  // Pattern 2: [quantity]? <dish> (add cheyi|pettandi|vei|kavali|kavale|dalo|daalo|add karo)
  const teluguVerbMatch = text.match(
    /^(.+?)(?:\s+(?:naa\s+cart\s*ki|cart\s*ki|cart\s*lo|to\s+(?:my\s+)?cart|cart\s*mein|cart\s*me))?\s+(?:add\s*cheyi|add\s*cheyyi|pettandi|vei|kavali|kavale|dalo|daalo|add\s*karo|kardo|rakho)\s*$/iu,
  );
  if (teluguVerbMatch) {
    let rawItem = teluguVerbMatch[1] ?? '';
    let quantity = 1;
    // Check if the item starts with a quantity token (e.g. "2 Masala Dosa", "rendu Dosa", "2 Veg Meals")
    const leadingQty = rawItem.match(
      /^(rendu|two|2|రెండు|moodu|three|3|మూడు|nalugu|four|4|నాలుగు|okati|one|1|ఒకటి|aidu|five|5|ఐదు|ek|do|teen|chaar|char|\d+)\s+(.+)$/iu,
    );
    if (leadingQty) {
      const parsedQty = parseQuantityToken(leadingQty[1]);
      if (parsedQty != null) {
        quantity = parsedQty;
        rawItem = leadingQty[2] ?? '';
      }
    }
    const itemName = cleanItemName(rawItem);
    if (itemName.length >= 2) {
      return { quantity, itemName };
    }
  }

  return null;
}

/** Telugu/SOV: “రెండు మసాలా దోశ ఇంటి భోజనం నుండి” / “two masala dosa inti bhojanam”. */
function parseIndicSovOrder(text: string): ParsedCartAddIntent | null {
  const sov = text.match(
    /^(rendu|two|2|రెండు|moodu|three|3|మూడు|nalugu|four|4|నాలుగు)\s+(.+?)\s+(inti\s*bhojanam|ఇంటి\s*భోజనం|mana\s*inti|మన\s*ఇంటి)(?:\s*(?:నుండి|నుంచి|from))?.*$/iu,
  );
  if (!sov) return null;
  const quantity = parseQuantityToken(sov[1]);
  const itemName = cleanItemName(sov[2] ?? '');
  const kitchenHint = cleanItemName(sov[3] ?? '');
  if (quantity == null || itemName.length < 2) return null;
  return {
    quantity,
    itemName,
    ...(kitchenHint ? { kitchenHint } : {}),
  };
}

export function parseCartAddUserMessage(message: string): ParsedCartAddIntent | null {
  const text = normalizeAddUtterance(message);
  if (!text || text.length > 200) return null;

  const teluguOrder = parseTeluguAddOrder(text);
  if (teluguOrder) return teluguOrder;

  const sov = parseIndicSovOrder(text);
  if (sov) return sov;

  for (const pattern of ADD_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    // Patterns with qty in group 1 and item in group 2 (+ optional kitchen 3)
    const qtyFromFirst = parseQuantityToken(match[1]);
    if (qtyFromFirst != null && match[2]) {
      let itemName = cleanItemName(match[2]);
      let kitchenHint = match[3] ? cleanItemName(match[3]) : undefined;
      // Strip trailing kitchen tokens glued into the dish name.
      const kitchenTrail = itemName.match(
        /^(.*?)\s+(inti\s*bhojanam|ఇంటి\s*భోజనం|antibody)\s*$/iu,
      );
      if (kitchenTrail && !kitchenHint) {
        itemName = cleanItemName(kitchenTrail[1] ?? itemName);
        kitchenHint = 'inti bhojanam';
      }
      if (itemName.length >= 2) {
        return {
          quantity: qtyFromFirst,
          itemName,
          ...(kitchenHint ? { kitchenHint } : {}),
        };
      }
      continue;
    }

    // add X to cart / add X from kitchen — item in group 1
    if (match[1] && !isQuantityToken(match[1])) {
      const itemName = cleanItemName(match[1]);
      const kitchenHint = match[2] ? cleanItemName(match[2]) : undefined;
      // Avoid treating pure confirm/discard as dish names via the bare "from" pattern.
      if (/^(yes|no|ok|okay|confirm|discard|stop)$/i.test(itemName)) continue;
      if (itemName.length >= 2) {
        return {
          quantity: 1,
          itemName,
          ...(kitchenHint ? { kitchenHint } : {}),
        };
      }
    }
  }

  return null;
}

/**
 * Supports compound multi-item requests, e.g.
 * "I want two masala dosas and one cold coffee"
 * "add 2 chicken biryani, 1 thums up and 2 butter naan"
 */
export function parseMultiCartAddUserMessage(message: string): ParsedCartAddIntent[] {
  const single = parseCartAddUserMessage(message);

  // If message contains compound connectors "and", "aur", "mariyu", or commas separating items
  const compoundPattern = /\b(?:and|aur|mariyu)\b|,/i;
  if (!compoundPattern.test(message)) {
    return single ? [single] : [];
  }

  // Strip leading prefixes like "i want", "please add", "order"
  const stripped = message
    .replace(/^(?:please\s+)?(?:i\s+want|i'?d\s+like|get\s+me|give\s+me|order|add|put)\s+/i, '')
    .trim();

  // Split on connectors
  const parts = stripped.split(/\s+(?:and|aur|mariyu)\s+|,\s*/i);
  const results: ParsedCartAddIntent[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Try parsing as an add utterance
    const parsed = parseCartAddUserMessage(`add ${trimmed}`) || parseCartAddUserMessage(trimmed);
    if (parsed) {
      results.push(parsed);
    }
  }

  if (results.length > 1) {
    return results;
  }

  return single ? [single] : [];
}

/** Short reply that is likely a dish name clarifying a pending cart plan. */
export function parseDishClarificationMessage(message: string): string | null {
  const text = message.trim();
  if (!text || text.length > 80) return null;
  if (/^(yes|yeah|yep|yup|ok|okay|sure|confirm|no|nope|cancel|discard|stop)\b/i.test(text)) {
    return null;
  }
  if (/^(add|find|search|open|show|track|order)\b/i.test(text)) return null;
  const cleaned = cleanItemName(text.replace(/\bfrom\s+.+$/i, ''));
  if (cleaned.length < 2 || cleaned.split(/\s+/).length > 6) return null;
  return cleaned;
}


/**
 * Match a proposed cart plan's dish name against parsed utterance items.
 * Uses canonicalization, substring containment, and token overlap.
 */
export function matchParsedCartIntentForPlan(
  planName: string | undefined,
  parsedItems: readonly ParsedCartAddIntent[],
): ParsedCartAddIntent | undefined {
  if (!planName || parsedItems.length === 0) return undefined;
  const canonicalPlan = canonicalizeOrderingText(planName);
  if (!canonicalPlan) return undefined;
  const planTokens = canonicalPlan.split(' ').filter(Boolean);

  // 1. Exact canonical match
  const exact = parsedItems.find(
    (item) => canonicalizeOrderingText(item.itemName) === canonicalPlan,
  );
  if (exact) return exact;

  // 2. Substring containment match (e.g. "dosa" in "masala dosa" or "coffee" in "cold coffee")
  const substringMatch = parsedItems.find((item) => {
    const itemCanonical = canonicalizeOrderingText(item.itemName);
    if (!itemCanonical) return false;
    return canonicalPlan.includes(itemCanonical) || itemCanonical.includes(canonicalPlan);
  });
  if (substringMatch) return substringMatch;

  // 3. Token overlap match (e.g. token "dosa" in ["masala", "dosa"])
  const tokenMatch = parsedItems.find((item) => {
    const itemTokens = canonicalizeOrderingText(item.itemName).split(' ').filter(Boolean);
    return itemTokens.some((tok) => planTokens.includes(tok));
  });
  if (tokenMatch) return tokenMatch;

  return undefined;
}

/**
 * Hydrates cart plans from parsed voice utterances with precise 1-to-1 name matching.
 * Preserves explicit quantities (including 1) for matched items, preserves valid
 * existing plan quantities for unmatched items, and avoids indiscriminate quantity propagation.
 */
export function hydrateCartPlansFromUtterance(params: {
  readonly proposedCartActions: readonly CartPlanAction[];
  readonly multiAdds: readonly ParsedCartAddIntent[];
  readonly preferRestaurantId?: string | null;
  readonly restaurantSlug?: string | null;
}): CartPlanAction[] {
  const { proposedCartActions, multiAdds, preferRestaurantId, restaurantSlug } = params;

  if (proposedCartActions.length > 0) {
    const matchedIndices = new Set<number>();

    return proposedCartActions.map((plan, planIdx) => {
      if (plan.type !== 'cart_add_plan' && plan.type !== 'cart_update_plan') {
        return plan;
      }

      const rawPlanName =
        typeof plan.payload?.name === 'string' && plan.payload.name.trim()
          ? plan.payload.name.trim()
          : undefined;

      let matchedItem: ParsedCartAddIntent | undefined;
      if (rawPlanName) {
        matchedItem = matchParsedCartIntentForPlan(rawPlanName, multiAdds);
        if (matchedItem) {
          const idx = multiAdds.indexOf(matchedItem);
          if (idx !== -1) matchedIndices.add(idx);
        }
      } else {
        const unusedIdx = multiAdds.findIndex((_, i) => !matchedIndices.has(i));
        const targetIdx = unusedIdx !== -1 ? unusedIdx : planIdx;
        matchedItem = multiAdds[targetIdx];
        if (matchedItem) matchedIndices.add(targetIdx);
      }

      const name = rawPlanName || matchedItem?.itemName || '';

      // Quantity resolution:
      // 1. If an item matches by normalized name, use that item's parsed quantity (including 1).
      // 2. If no item matches, preserve the plan's valid quantity or use safe default 1.
      // Never apply the first parsed item's quantity indiscriminately.
      let qty: number;
      if (matchedItem && typeof matchedItem.quantity === 'number' && matchedItem.quantity > 0) {
        qty = matchedItem.quantity;
      } else if (typeof plan.payload?.quantity === 'number' && plan.payload.quantity > 0) {
        qty = plan.payload.quantity;
      } else {
        qty = 1;
      }

      const instructions =
        matchedItem?.instructions ||
        (typeof plan.payload?.instructions === 'string' ? plan.payload.instructions : undefined);

      return {
        ...plan,
        payload: {
          ...(plan.payload ?? {}),
          ...(name ? { name } : {}),
          quantity: qty,
          ...(instructions ? { instructions } : {}),
          ...(preferRestaurantId ? { restaurantId: preferRestaurantId } : {}),
          ...(restaurantSlug ? { restaurantSlug } : {}),
        },
      };
    });
  }

  if (multiAdds.length > 0) {
    return multiAdds.map((item) => ({
      type: 'cart_add_plan' as const,
      requiresConfirmation: true,
      executable: false,
      payload: {
        name: item.itemName,
        quantity: item.quantity,
        ...(item.instructions ? { instructions: item.instructions } : {}),
        ...(preferRestaurantId ? { restaurantId: preferRestaurantId } : {}),
        ...(restaurantSlug ? { restaurantSlug } : {}),
      },
      reason: 'client_hydrated_from_utterance',
    }));
  }

  return [];
}

export function isCartAddUserMessage(message: string): boolean {
  return parseCartAddUserMessage(message) != null;
}

export {
  normalizeQuantityAsr,
  parseQuantityOnlyMessage,
  parseQuantityToken,
} from './quantityAsrNormalize';
