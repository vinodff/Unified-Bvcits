/**
 * Shared limits for the spoken-reply path.
 *
 * These live in their own module because the producer and the consumer sit on opposite
 * sides of the client/server boundary: the voice hook (`useCampusVoice`, a client hook)
 * splits an answer into chunks, and the TTS route (server) synthesises each one. When the
 * two disagreed, the route silently truncated whatever the hook sent — a 183-character
 * Telugu chunk lost its final 33 characters, which was the college phone number. Nothing
 * failed; the sentence just stopped early. Keep them in one place so that cannot recur.
 */

/**
 * Longest chunk the client will send in one request.
 *
 * Must stay at or below `GOOGLE_TTS_MAX_CHARS`: anything above it is truncated by the
 * fallback. Measured against the *expanded* text — see `expandForSpeech`, which the
 * chunker applies before measuring so that a chunk cannot grow after it has been sized.
 */
export const TTS_CHUNK_LIMIT = 180;

/**
 * Hard service limit of Google's `translate_tts` endpoint. Text beyond this is dropped by
 * Google itself, so the route trims at a word boundary rather than letting it cut mid-word.
 */
export const GOOGLE_TTS_MAX_CHARS = 200;

/**
 * Ceiling on a single TTS request, independent of the chunker.
 *
 * The route is a GET with user-controlled `text`, so this bounds what an arbitrary caller
 * can ask the upstream service to synthesise. Well above `TTS_CHUNK_LIMIT`, so it never
 * affects real traffic.
 */
export const TTS_REQUEST_MAX_CHARS = 600;

/**
 * Trims to `max` characters without splitting a word.
 *
 * Falls back to a hard slice when there is no space to break on, which is the normal case
 * for scripts that do not use spaces the way Latin text does.
 */
export function trimToWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const hard = text.slice(0, max);
  const lastSpace = hard.lastIndexOf(" ");
  // Only honour the boundary if it keeps most of the budget; otherwise a single long
  // token would collapse the chunk to almost nothing.
  if (lastSpace > max * 0.6) return hard.slice(0, lastSpace);
  return hard;
}

/**
 * Rewrites symbols a speech engine would read out wrong.
 *
 * This *grows* the text — "₹" becomes seven characters, "LPA" becomes thirteen — so it has
 * to run before anything measures a chunk against a budget. Expanding on the server
 * afterwards is what let a chunk sized at the limit arrive over it.
 *
 * Idempotent: applying it to already-expanded text is a no-op, so the route can run it
 * again on input that never went through the chunker (a direct or cached request).
 */
export function expandForSpeech(text: string): string {
  return text.replace(/₹/g, "రూపాయలు ").replace(/LPA/gi, "లక్షల రూపాయలు");
}

/** Strips markup and emoji, then expands symbols. Shared by the chunker and the route. */
export function cleanForSpeech(text: string): string {
  return expandForSpeech(
    text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // markdown links → label
      .replace(/[*_#`~>•]/g, "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ""), // emoji
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits an answer into speakable chunks, none longer than `TTS_CHUNK_LIMIT`.
 *
 * Lives here, beside the limit it has to respect, rather than in the voice hook. The two
 * drifting apart is precisely how the truncation bug happened, and a chunker that does not
 * sit next to its own budget is free to drift again.
 *
 * Sentences are kept intact; only a sentence that is itself over the limit gets split.
 * "।" is the Devanagari danda, used as a full stop in Indic text.
 */
export function chunkForSpeech(text: string): string[] {
  const clean = cleanForSpeech(text);

  if (!clean) return [];
  if (clean.length <= TTS_CHUNK_LIMIT) return [clean];

  const sentences = clean.split(/(?<=[.!?।])\s+/);
  const chunks: string[] = [];
  let buffer = "";

  const flushOversized = (sentence: string) => {
    // A single sentence longer than the budget still has to be broken up, and every piece
    // has to fit — the previous version kept only the first slice and dropped the rest of
    // the sentence outright.
    let rest = sentence;
    while (rest.length > TTS_CHUNK_LIMIT) {
      const piece = trimToWordBoundary(rest, TTS_CHUNK_LIMIT);
      chunks.push(piece);
      rest = rest.slice(piece.length).trim();
    }
    return rest;
  };

  for (const sentence of sentences) {
    if ((buffer + " " + sentence).trim().length <= TTS_CHUNK_LIMIT) {
      buffer = (buffer + " " + sentence).trim();
      continue;
    }
    if (buffer) chunks.push(buffer);
    buffer = sentence.length > TTS_CHUNK_LIMIT ? flushOversized(sentence) : sentence;
  }
  if (buffer) chunks.push(buffer);

  return chunks.filter(Boolean);
}
