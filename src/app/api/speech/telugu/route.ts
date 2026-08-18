import { NextRequest, NextResponse } from "next/server";
import { generateEdgeTTS } from "@/lib/edge-tts-native";
import {
  cleanForSpeech,
  GOOGLE_TTS_MAX_CHARS,
  TTS_REQUEST_MAX_CHARS,
  trimToWordBoundary,
} from "@/lib/speech-limits";

export const dynamic = "force-dynamic";

/**
 * How long to stop attempting Edge TTS after it fails.
 *
 * Edge is the good voice, so this is not a circuit breaker that gives up — it just stops
 * paying the failure cost on every chunk. A rejected handshake costs roughly 600ms, and an
 * answer is several chunks, so without this a single outage adds seconds of dead air to
 * every reply while the visitor waits in silence. One probe per window is enough to notice
 * the service coming back.
 */
const EDGE_COOLDOWN_MS = 60_000;

/** Timestamp after which Edge TTS is worth trying again. Process-local by design. */
let edgeRetryAt = 0;

/** Below this an "mp3" is a truncated or empty response, not audio. */
const MIN_AUDIBLE_BYTES = 500;

function audioResponse(body: ArrayBuffer | Buffer, engine: "edge" | "google"): NextResponse {
  const length = Buffer.isBuffer(body) ? body.length : body.byteLength;
  return new NextResponse(body as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": length.toString(),
      // Greetings and stock phrases repeat constantly. A cached chunk starts instantly
      // instead of re-fetching mid-conversation, which is heard as a pause between
      // sentences.
      "Cache-Control": "public, max-age=86400",
      // Lets the voice engine actually in use be seen from the network tab. Edge silently
      // failing for every request went unnoticed for a long time precisely because the
      // response looked identical either way.
      "X-TTS-Engine": engine,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const text = searchParams.get("text") || "";
    const lang = searchParams.get("lang") || "te-IN";

    if (!text.trim()) {
      return new NextResponse("Missing text parameter", { status: 400 });
    }

    const clean = cleanForSpeech(text).slice(0, TTS_REQUEST_MAX_CHARS);
    if (!clean) {
      return new NextResponse("Nothing speakable in text parameter", { status: 400 });
    }

    const isEnglish = lang.startsWith("en");
    const voice = isEnglish ? "en-IN-NeerjaNeural" : "te-IN-ShrutiNeural";
    const targetLang = isEnglish ? "en-IN" : "te-IN";

    // 1. PRIMARY: Microsoft Edge neural TTS. Handles the full chunk without truncation,
    //    which is why it is tried first for correctness as well as for voice quality.
    if (Date.now() >= edgeRetryAt) {
      try {
        const audioBuffer = await generateEdgeTTS(clean, voice, targetLang);
        if (audioBuffer.length > MIN_AUDIBLE_BYTES) {
          edgeRetryAt = 0;
          return audioResponse(audioBuffer, "edge");
        }
        throw new Error(`Edge TTS returned only ${audioBuffer.length} bytes`);
      } catch (edgeErr) {
        edgeRetryAt = Date.now() + EDGE_COOLDOWN_MS;
        console.warn(
          `[tts] Edge neural TTS failed, using Google fallback for ${EDGE_COOLDOWN_MS / 1000}s:`,
          edgeErr instanceof Error ? edgeErr.message : edgeErr,
        );
      }
    }

    // 2. FALLBACK: Google translate_tts. Hard-capped by the service, so trim at a word
    //    boundary — the previous 150-character slice cut mid-word and dropped the tail of
    //    every long chunk, phone numbers included.
    const googleText = trimToWordBoundary(clean, GOOGLE_TTS_MAX_CHARS);
    if (googleText.length < clean.length) {
      console.warn(
        `[tts] Google fallback trimmed ${clean.length - googleText.length} chars ` +
          `(${clean.length} → ${googleText.length}); chunker should keep chunks shorter.`,
      );
    }

    const gttsUrl =
      "https://translate.google.com/translate_tts?ie=UTF-8" +
      `&q=${encodeURIComponent(googleText)}` +
      `&tl=${isEnglish ? "en" : "te"}` +
      // Must describe the text actually sent, or Google's prosody is computed for a
      // length it never received.
      `&total=1&idx=0&textlen=${googleText.length}&client=tw-ob`;

    const gRes = await fetch(gttsUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Referer: "https://translate.google.com/",
      },
    });

    if (gRes.ok) {
      return audioResponse(await gRes.arrayBuffer(), "google");
    }

    console.error(`[tts] Google fallback responded ${gRes.status}`);
    return new NextResponse("TTS service unavailable", { status: 502 });
  } catch (error) {
    console.error("TTS Route Error:", error);
    return new NextResponse("Internal Server Error in TTS", { status: 500 });
  }
}
