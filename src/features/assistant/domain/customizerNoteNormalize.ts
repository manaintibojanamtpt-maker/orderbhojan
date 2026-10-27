/**
 * Normalizes customer customizer and spice notes (e.g., "make one of them without much spice").
 */

export interface ParsedCustomizerIntent {
  readonly customizer: string;
  readonly targetDish?: string;
  readonly quantity?: number;
}

const CUSTOMIZER_PATTERN =
  /\b(without\s+much\s+spice|less\s+spic(?:e|y)|no\s+spic(?:e|y)|not\s+spicy|extra\s+spic(?:e|y)|extra\s+chutney|extra\s+sambar|no\s+onions?|no\s+garlic|mild|medium\s+spicy|jain\s+preparation)\b/i;

export function parseCustomizerNote(message: string): ParsedCustomizerIntent | null {
  const text = message.trim();
  if (!text || text.length > 120) return null;

  // Patterns like: "make one of them without much spice"
  const oneOfThemMatch = text.match(
    /\b(?:make|keep|prepare)\s+(?:one|1)\s+(?:of\s+them\s+)?(?:with\s+)?(without\s+much\s+spice|less\s+spic(?:e|y)|no\s+spic(?:e|y)|not\s+spicy|extra\s+spic(?:e|y)|mild)/i,
  );
  if (oneOfThemMatch?.[1]) {
    return {
      customizer: oneOfThemMatch[1].trim(),
      quantity: 1,
    };
  }

  // General customizer request
  const directMatch = text.match(CUSTOMIZER_PATTERN);
  if (directMatch?.[1]) {
    return {
      customizer: directMatch[1].trim(),
    };
  }

  return null;
}
