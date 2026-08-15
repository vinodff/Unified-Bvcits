// Query normalisation and safe matching.
//
// WHY THIS EXISTS: the previous engine matched intents with bare `String.includes()` on
// two-letter keys. `includes("ai")` fired on "em-ai-l", "av-ai-lable", "det-ai-l", and
// `includes("ds")` fired on "nee-ds" — so unrelated questions were answered as AI & DS.
// Everything here matches on token boundaries instead, which removes that whole class of bug.

/**
 * Word characters: letters, digits, and combining marks.
 *
 * `\p{M}` is essential and easy to miss. Telugu vowel signs and the virama (ఫ + ీ = ఫీ)
 * are Unicode Mark characters, NOT Letters — so a `[^\p{L}\p{N}]` separator silently
 * shreds every Telugu word into consonant fragments and no Telugu query ever matches.
 * ZWNJ/ZWJ are kept for the same reason: they appear inside words like "ప్లేస్‌మెంట్స్".
 */
const SEPARATOR = /[^\p{L}\p{N}\p{M}‌‍]+/gu;

/** Collapses whitespace, strips punctuation, lowercases Latin text. */
export function normalize(raw: string): string {
  return raw.toLowerCase().replace(SEPARATOR, " ").trim();
}

/** Splits a query into comparable tokens. */
export function tokenize(raw: string): string[] {
  const normalized = normalize(raw);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

/**
 * True when `alias` appears in `tokens` as a whole token, or — for multi-word aliases —
 * as a contiguous token run. Never a substring of a longer word.
 */
export function hasAlias(tokens: string[], alias: string): boolean {
  const parts = alias.split(" ").filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.length === 1) return tokens.includes(parts[0]);

  for (let i = 0; i <= tokens.length - parts.length; i++) {
    let matched = true;
    for (let j = 0; j < parts.length; j++) {
      if (tokens[i + j] !== parts[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Telugu is agglutinative: "ఫీజు" (fee) appears as "ఫీజులు", "ఫీజెంత", "ఫీజు" etc. Exact
 * token equality would miss those, so Telugu aliases also match as a token *prefix*.
 * Latin aliases stay exact to preserve the boundary guarantee above.
 */
const TELUGU_RANGE = /[ఀ-౿]/;

export function isTelugu(text: string): boolean {
  return TELUGU_RANGE.test(text);
}

/** Prefix match, used only for Telugu aliases of 3+ characters. */
export function hasTeluguStem(tokens: string[], stem: string): boolean {
  if (stem.length < 3) return tokens.includes(stem);
  return tokens.some((t) => t.startsWith(stem));
}

/**
 * Scores one alias against the query. Multi-word and longer aliases score higher because
 * they are more specific: "hod phone" should beat a lone "phone".
 */
export function scoreAlias(tokens: string[], alias: string): number {
  const isTe = isTelugu(alias);
  const matched = isTe
    ? alias.split(" ").every((part) => hasTeluguStem(tokens, part))
    : hasAlias(tokens, alias);

  if (!matched) return 0;

  const wordCount = alias.split(" ").filter(Boolean).length;
  // Specificity bonus: multi-word phrases and long single tokens are stronger signals.
  return 1 + (wordCount - 1) * 0.75 + Math.min(alias.length / 20, 0.5);
}

/** Detects the language the user actually typed/spoke, independent of the UI toggle. */
export function detectLang(raw: string): "te" | "en" {
  return isTelugu(raw) ? "te" : "en";
}
