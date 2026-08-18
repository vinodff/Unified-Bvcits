import "server-only";

import { createHash } from "node:crypto";

/**
 * Best-effort abuse control for the public results lookup.
 *
 * Hall ticket + date of birth is guessable by design (it is what the
 * requirement asks for, and what university portals use), so the lookup needs
 * to cost something to hammer.
 *
 * HONEST LIMITATION: this counter lives in the process. On a serverless
 * deployment each instance keeps its own, and a cold start resets it, so a
 * determined attacker spread across instances gets more than `MAX_ATTEMPTS`
 * tries. It is a speed bump, not a wall. The real containment is elsewhere and
 * does not depend on this working:
 *
 *   * the endpoint returns one student's rows and nothing else — there is no
 *     listing, no pagination, no wildcard, so there is nothing to scrape in
 *     bulk even with unlimited attempts;
 *   * `anon` has no grant on any results table (0010_results_portal.sql), so
 *     the browser cannot go around this route;
 *   * every failure is written to `result_lookup_attempts`, which is what
 *     actually reveals a walk of the hall ticket range after the fact.
 *
 * If this ever needs to be a real wall, the replacement is a counter in
 * Postgres or Redis keyed the same way — the interface below would not change.
 */

/** Failures allowed per key inside one window before the caller is blocked. */
const MAX_ATTEMPTS = 8;

/** Rolling window length. */
const WINDOW_MS = 10 * 60 * 1000;

/** Cap on tracked keys, so a distributed probe cannot grow this map forever. */
const MAX_TRACKED_KEYS = 20_000;

interface Bucket {
  count: number;
  /** When the current window expires. */
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** Failures remaining before the caller is blocked. */
  remaining: number;
  /** Seconds until the window resets — surfaced as `Retry-After`. */
  retryAfterSeconds: number;
}

/**
 * Whether `key` may attempt a lookup now.
 *
 * Read-only: it reports the verdict but does not consume an attempt. Only
 * FAILED lookups count (see `recordFailure`), so a student checking three
 * semesters back to back is never throttled, while someone guessing dates of
 * birth is.
 */
export function checkRateLimit(key: string, now = Date.now()): RateLimitVerdict {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    return { allowed: true, remaining: MAX_ATTEMPTS, retryAfterSeconds: 0 };
  }
  const remaining = Math.max(0, MAX_ATTEMPTS - bucket.count);
  return {
    allowed: remaining > 0,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Charge one failed attempt against `key`. */
export function recordFailure(key: string, now = Date.now()): void {
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) sweep(now);
    // Still full after sweeping means every tracked window is live. Dropping
    // the new key is the right failure mode: it under-blocks rather than
    // letting the map grow without bound.
    if (buckets.size >= MAX_TRACKED_KEYS) return;
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  bucket.count += 1;
}

/** Clear a key's window after a successful lookup, so one typo is not punished. */
export function clearFailures(key: string): void {
  buckets.delete(key);
}

/** Test seam — never called by application code. */
export function resetRateLimiter(): void {
  buckets.clear();
}

/**
 * The client IP, from the proxy headers a Next.js deployment sits behind.
 *
 * `x-forwarded-for` is client-controllable when there is no trusted proxy in
 * front, so this is a heuristic for abuse accounting only and must never be
 * used for an authorization decision.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  // Left-most entry is the original client; the rest are proxies.
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Salted hash of an IP, for the failure log.
 *
 * The raw address is a personal identifier and the log has no use for it — a
 * hash is enough to answer "is this one source?". Without a configured salt the
 * hash is still useful for grouping but is not resistant to a dictionary attack
 * over the IPv4 space, so set `RESULTS_LOOKUP_SALT` in production.
 */
export function hashIp(ip: string): string {
  const salt = process.env.RESULTS_LOOKUP_SALT ?? "bvcits-results-lookup";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
