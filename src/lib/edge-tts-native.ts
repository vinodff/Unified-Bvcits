// Microsoft Edge "read aloud" neural TTS over WebSocket.
//
// ── Why this file looks the way it does ───────────────────────────────────────
//
// This endpoint is undocumented and gated by three separate checks. Miss any one
// of them and the handshake is rejected with a bare HTTP 403 — no body, no hint.
// Measured, one axis at a time:
//
//   no token, no headers ............ 403   (what this file used to send)
//   Sec-MS-GEC only ................. 403
//   headers only .................... 403
//   both, Sec-MS-GEC-Version 1-130 .. 403
//   both, Sec-MS-GEC-Version 1-131 .. 403
//   both, Sec-MS-GEC-Version 1-132+ .. connects, returns valid mp3
//
// So all three are required together:
//
//   1. AN `Origin` HEADER. Node's global `WebSocket` (undici) accepts only
//      `protocols` as its second argument and cannot set headers at all, which is
//      why this imports the `ws` package instead. A previous revision dropped the
//      headers to satisfy the global constructor and left a comment claiming auth
//      travelled entirely in `TrustedClientToken`. That was wrong, and the result
//      was that every neural-TTS call 403'd and the route silently served the
//      lower-quality Google fallback for every single reply.
//
//   2. `Sec-MS-GEC` — a rolling token, not a secret: SHA-256 of the current time
//      in Windows file-time ticks (floored to a 5-minute window) concatenated
//      with the public TrustedClientToken. See `securityToken()`.
//
//   3. `Sec-MS-GEC-Version` — must claim a recent-enough Chromium. Old values are
//      rejected outright, so `CHROMIUM_VERSION` needs bumping if 403s ever return.
//
// TROUBLESHOOTING: a sudden run of 403s almost certainly means CHROMIUM_VERSION
// has aged out. Bump it to a current Edge build before suspecting anything else.

import crypto from "crypto";
import WebSocket from "ws";

const SYNTHESIS_URL =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";

/** Public constant baked into Edge, not a credential. */
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

/** Seconds between the Windows file-time epoch (1601-01-01) and the Unix epoch. */
const WINDOWS_EPOCH_OFFSET_SECONDS = 11_644_473_600;

/** The token is only granular to 5 minutes, so it is stable within that window. */
const TOKEN_WINDOW_SECONDS = 300;

/** Must claim a recent Chromium — see the header note. Bump this if 403s return. */
const CHROMIUM_VERSION = "1-142.0.3595.60";

/** Identifies as the Edge read-aloud extension, which is what the endpoint expects. */
const HANDSHAKE_HEADERS = {
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "en-US,en;q=0.9",
} as const;

/**
 * Ceiling for one synthesis. A voice caller is waiting in silence for this, so it is
 * deliberately tight: a healthy request measures around 2s, and anything past 6s is
 * worth abandoning for the fallback rather than continuing to wait.
 */
const SYNTHESIS_TIMEOUT_MS = 6000;

/**
 * Builds the `Sec-MS-GEC` token: SHA-256 over the current Windows file-time ticks,
 * floored to a 5-minute window, concatenated with the public client token.
 */
export function securityToken(now: number = Date.now()): string {
  let ticks = Math.floor(now / 1000) + WINDOWS_EPOCH_OFFSET_SECONDS;
  // Floor to the 5-minute window the service validates against.
  ticks -= ticks % TOKEN_WINDOW_SECONDS;
  // Windows file time counts 100-nanosecond intervals.
  ticks *= 10_000_000;
  return crypto
    .createHash("sha256")
    .update(`${ticks}${TRUSTED_CLIENT_TOKEN}`, "ascii")
    .digest("hex")
    .toUpperCase();
}

/** SSML is XML: unescaped user text would break the document or inject markup. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Each binary frame is `[uint16 header length][header text][audio bytes]`. Only frames
 * whose header says `Path:audio` carry audio; the rest are metadata.
 */
function extractAudio(frame: Buffer): Buffer | null {
  if (frame.length <= 2) return null;
  const headerLength = frame.readUInt16BE(0);
  if (frame.length <= 2 + headerLength) return null;
  const header = frame.subarray(2, 2 + headerLength).toString("utf8");
  if (!header.includes("Path:audio")) return null;
  const audio = frame.subarray(2 + headerLength);
  return audio.length > 0 ? audio : null;
}

/**
 * Synthesises `text` and resolves with the raw mp3 bytes.
 *
 * Rejects rather than resolving empty, so the caller can fall back explicitly instead of
 * shipping a zero-byte response that the browser would treat as a broken audio element.
 */
export async function generateEdgeTTS(
  text: string,
  voice = "te-IN-ShrutiNeural",
  lang = "te-IN",
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const requestId = crypto.randomBytes(16).toString("hex");
    const url =
      `${SYNTHESIS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&ConnectionId=${requestId}` +
      `&Sec-MS-GEC=${securityToken()}` +
      `&Sec-MS-GEC-Version=${CHROMIUM_VERSION}`;

    const socket = new WebSocket(url, { headers: HANDSHAKE_HEADERS });
    const audioChunks: Buffer[] = [];

    // Every exit path funnels through here. Without the guard, closing the socket
    // inside a handler re-enters that handler and settles the promise twice.
    let settled = false;
    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Already closing — the promise is settled either way.
      }
      const audio = Buffer.concat(audioChunks);
      // Partial audio still beats no audio: a clipped sentence is recoverable, silence
      // in the middle of a spoken answer is not.
      if (audio.length > 0) resolve(audio);
      else reject(error ?? new Error("Edge TTS returned no audio"));
    };

    const timer = setTimeout(
      () => finish(new Error(`Edge TTS timed out after ${SYNTHESIS_TIMEOUT_MS}ms`)),
      SYNTHESIS_TIMEOUT_MS,
    );

    socket.on("open", () => {
      socket.send(
        "Content-Type:application/json; charset=utf-8\r\n" +
          "Path:speech.config\r\n\r\n" +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: "false",
                    wordBoundaryEnabled: "false",
                  },
                  outputFormat: "audio-24khz-48kbitrate-mono-mp3",
                },
              },
            },
          }),
      );

      socket.send(
        `X-RequestId:${requestId}\r\n` +
          "Content-Type:application/ssml+xml\r\n" +
          "Path:ssml\r\n\r\n" +
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
          `<voice name='${voice}'>${escapeXml(text)}</voice>` +
          "</speak>",
      );
    });

    socket.on("message", (data: Buffer, isBinary: boolean) => {
      if (!isBinary) {
        // `turn.end` is the service saying the utterance is complete.
        if (data.toString("utf8").includes("Path:turn.end")) finish(null);
        return;
      }
      const audio = extractAudio(Buffer.isBuffer(data) ? data : Buffer.from(data));
      if (audio) audioChunks.push(audio);
    });

    // Fires for a rejected handshake (the 403 case) as well as transport failures.
    socket.on("error", (error: Error) => finish(error));

    socket.on("unexpected-response", (_request, response) => {
      finish(
        new Error(
          `Edge TTS handshake rejected with HTTP ${response.statusCode}. ` +
            "If this is a 403, CHROMIUM_VERSION in this file is likely stale.",
        ),
      );
    });

    // A close before `turn.end` means the service hung up mid-utterance.
    socket.on("close", () => finish(new Error("Edge TTS closed before completing")));
  });
}
