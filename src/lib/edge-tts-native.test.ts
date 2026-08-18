import crypto from "crypto";
import { describe, expect, it } from "vitest";

import { securityToken } from "./edge-tts-native";

/**
 * Regression guard for the outage that made every neural-TTS request return HTTP 403.
 *
 * The route's "primary" voice never once played: the old client sent no `Sec-MS-GEC` token
 * at all, because it used Node's global WebSocket, which cannot set the headers the
 * endpoint also requires. These tests pin the token algorithm so a refactor cannot quietly
 * regress it back to something the service rejects. They are offline by design — the live
 * handshake is not something a unit test should depend on.
 */
describe("securityToken", () => {
  const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
  const WINDOWS_EPOCH_OFFSET_SECONDS = 11_644_473_600;

  /** The algorithm the service validates against, written out independently. */
  function expected(now: number): string {
    let ticks = Math.floor(now / 1000) + WINDOWS_EPOCH_OFFSET_SECONDS;
    ticks -= ticks % 300;
    ticks *= 10_000_000;
    return crypto
      .createHash("sha256")
      .update(`${ticks}${TRUSTED_CLIENT_TOKEN}`, "ascii")
      .digest("hex")
      .toUpperCase();
  }

  it("is an uppercase SHA-256 hex digest", () => {
    expect(securityToken()).toMatch(/^[0-9A-F]{64}$/);
  });

  it("matches the Windows-file-time algorithm the service expects", () => {
    const at = Date.UTC(2026, 7, 17, 12, 34, 56);
    expect(securityToken(at)).toBe(expected(at));
  });

  it("is stable within a five-minute window", () => {
    const base = Date.UTC(2026, 7, 17, 12, 30, 0);
    // Same window: 0s and 299s must produce the same token, or a chunk mid-answer could
    // be rejected while the one before it succeeded.
    expect(securityToken(base)).toBe(securityToken(base + 299_000));
  });

  it("rolls over to a new token in the next window", () => {
    const base = Date.UTC(2026, 7, 17, 12, 30, 0);
    expect(securityToken(base)).not.toBe(securityToken(base + 300_000));
  });
});
