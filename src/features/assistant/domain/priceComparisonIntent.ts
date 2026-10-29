/**
 * Detects price comparison intents (e.g. "which is cheaper?").
 */

export function isPriceComparisonMessage(message: string): boolean {
  const text = message.trim().toLowerCase();
  return (
    /^(?:which|what|which\s+one)\s+(?:is\s+)?(?:cheaper|less\s+expensive|more\s+affordable|lower\s+price)\??$/i.test(
      text,
    ) ||
    /^(?:compare|check)\s+(?:the\s+)?prices?\??$/i.test(text) ||
    /\b(which\s+(?:one\s+)?is\s+cheaper)\b/i.test(text)
  );
}
