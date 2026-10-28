import { expandIndicOrderingUtterance } from './orderingTextNormalize';

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  won: 1,
  two: 2,
  to: 2,
  too: 2,
  tu: 2,
  tow: 2,
  three: 3,
  tree: 3,
  four: 4,
  for: 4,
  fore: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  ate: 8,
  nine: 9,
  ten: 10,
  a: 1,
  an: 1,
  okati: 1,
  ఒకటి: 1,
  rendu: 2,
  రెండు: 2,
  moodu: 3,
  మూడు: 3,
  nalugu: 4,
  నాలుగు: 4,
  aidu: 5,
  ఐదు: 5,
  ek: 1,
  do: 2,
  teen: 3,
  chaar: 4,
  char: 4,
  paanch: 5,
};

export function parseQuantityToken(token: string | undefined): number | null {
  if (!token) return null;
  const t = token.trim().toLowerCase();
  const direct = NUMBER_WORDS[t];
  if (direct != null) return direct;
  const n = parseInt(t, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= 99) return n;
  return null;
}

/** Normalize ASR homophones where "to" meant number 2 in genuine quantity contexts only. */
export function normalizeQuantityAsr(raw: string): string {
  const expanded = expandIndicOrderingUtterance(raw);
  return expanded
    .replace(
      /\b(?:to|too)\s+(quantity|qty|plates?|cups?|pieces?|nos?|number|portions?|servings?)\b/gi,
      'two $1',
    )
    .replace(/\b(?:make|set|change|update)\s+it\s+(?:to|too)\b/gi, 'make it 2')
    .replace(/\bfor\s+(?:quantity|qty)\b/gi, '4')
    .replace(/\s+/g, ' ')
    .trim();
}

const WORD_ALT = Object.keys(NUMBER_WORDS)
  .sort((a, b) => b.length - a.length)
  .join('|');

/**
 * True when the utterance is only (or mainly) setting or correcting a quantity —
 * e.g. “two”, “2 quantity”, “make it 2”, “actually make that three”, “make that 3 dosas”.
 */
export function parseQuantityOnlyMessage(message: string): number | null {
  const trimmed = message.replace(/\s+/g, ' ').trim();
  // Bare ASR homophones while clarifying qty on a pending plan (“to” / “too”).
  if (/^(to|too|tu|tow)$/i.test(trimmed)) return 2;
  if (/^(for|fore|fur)$/i.test(trimmed)) return 4;

  const text = normalizeQuantityAsr(message);
  if (!text || text.length > 60) return null;

  const patterns: RegExp[] = [
    // actually make that 3 / make that 3 dosas / change it to 3
    new RegExp(
      String.raw`^(?:actually,?\s*)?(?:make\s+that|make\s+it|set\s+it|change\s+it|update(?:\s+it)?)\s+(\d+|${WORD_ALT})(?:\s+(?:dosas?|rotis?|items?|biryanis?|plates?|cups?|[a-zA-Z]+))?\.?$`,
      'i',
    ),
    new RegExp(
      String.raw`^(?:actually,?\s*)?(?:set|change|update)\s+(?:to\s+)?(\d+|${WORD_ALT})\s*(?:x|×|times|quantity|qty)?\.?$`,
      'i',
    ),
    new RegExp(
      String.raw`^(?:actually,?\s*)?(\d+|${WORD_ALT})\s+(?:dosas?|rotis?|items?|biryanis?|plates?|cups?)\.?$`,
      'i',
    ),
    new RegExp(
      String.raw`^(\d+|${WORD_ALT})\s*(?:x|×|times|quantity|qty|pieces?|nos?|number)?\.?$`,
      'i',
    ),
    new RegExp(
      String.raw`^(?:quantity|qty)\s*(?:is|=|:)?\s*(\d+|${WORD_ALT})\.?$`,
      'i',
    ),
    new RegExp(String.raw`^(\d+|${WORD_ALT})\s*(?:of\s+them)?\.?$`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const qty = parseQuantityToken(match[1]);
    if (qty == null) continue;
    return qty;
  }

  return null;
}

export { NUMBER_WORDS as QUANTITY_NUMBER_WORDS };
