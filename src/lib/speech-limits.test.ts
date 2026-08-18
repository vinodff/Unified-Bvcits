import { describe, expect, it } from "vitest";

import {
  chunkForSpeech,
  cleanForSpeech,
  expandForSpeech,
  GOOGLE_TTS_MAX_CHARS,
  TTS_CHUNK_LIMIT,
  trimToWordBoundary,
} from "./speech-limits";

/**
 * A real Telugu answer of the length that exposed the original bug: the chunker emitted
 * 183 characters and the route sent only the first 150 to Google, silently dropping the
 * phone number at the end.
 */
const TELUGU_ANSWER =
  "బీవీసీ ఇన్‌స్టిట్యూట్ ఆఫ్ టెక్నాలజీ అండ్ సైన్స్ అమలాపురంలో ఉంది. " +
  "ఇక్కడ సీఎస్‌ఈ, ఈసీఈ, ఈఈఈ, మెకానికల్, సివిల్ బ్రాంచ్‌లు ఉన్నాయి. " +
  "ఫీజు వివరాలు కావాలంటే మాకు ఫోన్ చేయండి తొంభై తొమ్మిది.";

describe("chunk limit contract", () => {
  // This is the regression guard for the truncation bug. The client chunked to 200 while
  // the route sent 200-char chunks through a 150-char slice, so every long chunk lost its
  // tail. Any future edit that lets the chunk budget exceed what the fallback can accept
  // fails here instead of silently cutting a sentence short in production.
  it("never emits a chunk the Google fallback would have to truncate", () => {
    expect(TTS_CHUNK_LIMIT).toBeLessThanOrEqual(GOOGLE_TTS_MAX_CHARS);
  });

  // Symbol expansion grows text ("₹" → 7 chars, "LPA" → 13). The chunker therefore has to
  // expand *before* it measures, or a chunk sized exactly at the budget arrives over it —
  // which is what an earlier version of this fix got wrong, caught by this test.
  it("expands symbols before sizing, so a fee-heavy chunk cannot overflow on the server", () => {
    const feeAnswer =
      "బీటెక్ ఫీజు ₹45,000, హాస్టల్ ₹60,000, బస్ ₹18,000, పరీక్ష ₹2,500. " +
      "ప్లేస్‌మెంట్ 12 LPA వరకు, సగటు 4 LPA. " +
      "మరిన్ని వివరాలకు కళాశాల కార్యాలయానికి ఫోన్ చేయండి, సమయం ఉదయం తొమ్మిది నుండి సాయంత్రం ఐదు వరకు.";

    for (const chunk of chunkForSpeech(feeAnswer)) {
      // Already expanded — the route's own cleaning must be a no-op on it.
      expect(cleanForSpeech(chunk)).toBe(chunk);
      expect(chunk.length).toBeLessThanOrEqual(GOOGLE_TTS_MAX_CHARS);
    }
  });
});

describe("expandForSpeech", () => {
  it("expands currency and package symbols", () => {
    expect(expandForSpeech("₹45,000")).toBe("రూపాయలు 45,000");
    expect(expandForSpeech("12 LPA")).toBe("12 లక్షల రూపాయలు");
  });

  // The route re-runs the cleaner on input the chunker already processed (and on cached or
  // direct requests that never went through it), so a second pass must change nothing.
  it("is idempotent", () => {
    const once = expandForSpeech("ఫీజు ₹45,000, ప్యాకేజీ 12 LPA");
    expect(expandForSpeech(once)).toBe(once);
  });
});

describe("chunkForSpeech", () => {
  it("keeps every chunk within the limit", () => {
    for (const chunk of chunkForSpeech(TELUGU_ANSWER)) {
      expect(chunk.length).toBeLessThanOrEqual(TTS_CHUNK_LIMIT);
    }
  });

  it("loses no words from a multi-sentence Telugu answer", () => {
    const spoken = chunkForSpeech(TELUGU_ANSWER).join(" ");
    // The final clause is the one the 150-char slice used to eat.
    expect(spoken).toContain("తొంభై తొమ్మిది");
    expect(spoken.replace(/\s+/g, "")).toBe(TELUGU_ANSWER.replace(/\s+/g, ""));
  });

  it("splits an oversized single sentence instead of dropping its tail", () => {
    // No sentence-ending punctuation, so this cannot be split on sentence boundaries.
    // The previous implementation kept `slice(0, LIMIT)` and discarded the remainder.
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    expect(long.length).toBeGreaterThan(TTS_CHUNK_LIMIT);

    const chunks = chunkForSpeech(long);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(TTS_CHUNK_LIMIT);
    expect(chunks.join(" ")).toContain("word59");
    expect(chunks.join(" ").split(/\s+/)).toHaveLength(60);
  });

  it("strips markdown, links and emoji before speaking", () => {
    const chunks = chunkForSpeech("See **[fees](/fees)** 🎓 now");
    expect(chunks).toEqual(["See fees now"]);
  });

  it("returns nothing for text with no speakable content", () => {
    expect(chunkForSpeech("   ")).toEqual([]);
    expect(chunkForSpeech("**")).toEqual([]);
  });
});

describe("trimToWordBoundary", () => {
  it("returns text untouched when it already fits", () => {
    expect(trimToWordBoundary("short text", 50)).toBe("short text");
  });

  it("never exceeds the maximum", () => {
    expect(trimToWordBoundary("a".repeat(300), 200).length).toBeLessThanOrEqual(200);
  });

  it("breaks on a space rather than mid-word", () => {
    const trimmed = trimToWordBoundary("alpha bravo charlie delta echo foxtrot", 25);
    expect(trimmed.endsWith(" ")).toBe(false);
    expect("alpha bravo charlie delta echo foxtrot".startsWith(trimmed)).toBe(true);
    // Whatever survives must be whole words.
    expect(trimmed.split(" ").every((w) => w.length > 0)).toBe(true);
  });

  it("falls back to a hard cut when no usable space exists", () => {
    // Telugu and other Indic scripts routinely produce long space-free runs.
    const unbroken = "అమలాపురంలోఉన్నబీవీసీఐటీఎస్కళాశాలవివరాలు";
    const trimmed = trimToWordBoundary(unbroken, 10);
    expect(trimmed).toHaveLength(10);
  });
});
