// Liveness re-verification — "is this opportunity still actually open?"
//
// The discovery pipeline probes a URL once, at insert. That is the wrong number
// of times to check something that expires: a listing verified in August is
// still in the feed in September, and a row with no deadline never leaves at
// all. This module is what the daily sweep runs against every published row.
//
// The hard part is not fetching the page — it is deciding what a response
// MEANS. Two mistakes are easy and both are costly:
//
//   * Treating 403 as dead. Corporate career sites answer an unknown
//     User-Agent with 403 while serving browsers perfectly — cummins.com did
//     exactly this in an early run. Retiring on 403 removes precisely the
//     official sources this feed exists to carry.
//
//   * Treating 200 as alive. A "soft 404" returns 200 with a "no longer
//     available" body, or silently redirects to the careers homepage. Trusting
//     the status code alone leaves dead listings in the feed forever.
//
// So verdicts are graded by how much they actually prove, and only DEFINITIVE
// evidence retires a row on sight. Everything ambiguous takes two consecutive
// days to act on — see shouldRetire().

/** What a single liveness check concluded. */
export const LIVENESS_VERDICTS = ["ok", "blocked", "expired", "gone", "unreachable"] as const;
export type LivenessVerdict = (typeof LIVENESS_VERDICTS)[number];

export interface LivenessResult {
  verdict: LivenessVerdict;
  /** Human-readable proof, surfaced as `retired_reason` and in the console. */
  evidence: string[];
  httpStatus: number | null;
  checkedAt: string;
}

/**
 * Verdicts backed by an explicit statement that the posting is over: the site
 * returned 410 Gone, published a `validThrough` in the past, or said so in
 * words. These retire immediately — waiting a second day adds no information.
 */
const DEFINITIVE: ReadonlySet<LivenessVerdict> = new Set(["gone", "expired"]);

/** Consecutive ambiguous failures before an opportunity is retired. */
export const FAILURE_LIMIT = 2;

/**
 * Statuses that mean "the server is alive and declined to serve a robot".
 * Deliberately NOT dead — see the module header.
 */
const BLOCKED_STATUSES = new Set([401, 403, 405, 406, 429]);

/**
 * Phrases sites use to say a posting is closed while still returning 200.
 * Matched against visible text only, lowercased. Kept narrow on purpose: a
 * loose pattern like /closed/ would match "closed captioning" in a page footer
 * and retire a live listing.
 */
const TOMBSTONE_PATTERNS: readonly RegExp[] = [
  /no longer accept(?:ing|s) applications?/i,
  /this (?:job|position|role|posting|opportunity) (?:has )?(?:is )?(?:no longer|has been) (?:available|closed|filled|removed)/i,
  /(?:job|position|role|posting|vacancy) (?:has )?expired/i,
  /applications? (?:are |is )?(?:now )?closed/i,
  /position has been filled/i,
  /this posting is closed/i,
  /registration(?:s)? (?:is |are )?closed/i,
];

/**
 * Extract `validThrough` from JSON-LD JobPosting markup.
 *
 * This is the highest-quality signal available, because it is the mechanism
 * Google's JobPosting spec sanctions for marking a posting expired without
 * taking the page down — so a site following the spec is telling us directly
 * rather than being inferred about.
 *
 * Returns null when there is no JobPosting block or no parseable date, which
 * is the common case: most Indian student platforms ship no JSON-LD at all.
 * That is why the status/tombstone tiers below still exist.
 */
export function extractValidThrough(html: string): string | null {
  for (const node of jobPostingNodes(html)) {
    const validThrough = node.validThrough;
    if (typeof validThrough === "string" && validThrough.trim()) return validThrough.trim();
  }
  return null;
}

/**
 * Every JSON-LD `JobPosting` object on the page.
 *
 * Shared with discovery, which reads the whole posting rather than just its
 * expiry: an applicant tracking system renders its listing client-side, so the
 * visible text is often empty, but nearly all of them still emit this block
 * server-side for Google. Reading it is both more reliable than asking a model
 * to interpret stripped markup and completely free.
 */
export function jobPostingNodes(html: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  for (const block of blocks) {
    const raw = block[1]?.trim();
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue; // Malformed JSON-LD is common; it is not evidence of anything.
    }

    // A page may ship one object, an array, or an @graph wrapper.
    const candidates: unknown[] = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed["@graph"])
        ? (parsed["@graph"] as unknown[])
        : [parsed];

    for (const node of candidates) {
      if (!isRecord(node)) continue;
      const type = node["@type"];
      const isJobPosting = Array.isArray(type)
        ? type.some((t) => String(t) === "JobPosting")
        : String(type) === "JobPosting";
      if (isJobPosting) found.push(node);
    }
  }

  return found;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep quoted page copy short enough to store in `retired_reason` and read. */
function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Strip tags so tombstone matching runs on visible copy, not markup. */
export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

export function findTombstone(html: string): string | null {
  const text = visibleText(html);
  for (const pattern of TOMBSTONE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

/**
 * The response facts a verdict is derived from. Passed in rather than fetched
 * here so the ladder is pure and directly testable — the network lives in
 * checkLiveness() below.
 */
export interface ProbeOutcome {
  /** Null when the request never completed (timeout, DNS failure, reset). */
  status: number | null;
  html: string;
  /** Did a sibling URL known not to exist ALSO return 2xx? */
  hostSoft404s: boolean | null;
  /** Set when the request threw rather than responding. */
  networkError?: string;
}

/**
 * The ladder. Order matters: the most explicit evidence is consulted first, so
 * a page that both 200s and declares itself expired is correctly read as
 * expired rather than alive.
 */
export function judge(outcome: ProbeOutcome, now: Date = new Date()): LivenessResult {
  const checkedAt = now.toISOString();
  const evidence: string[] = [];
  const at = (verdict: LivenessVerdict): LivenessResult => ({
    verdict,
    evidence,
    httpStatus: outcome.status,
    checkedAt,
  });

  // 1. The posting's own declared expiry, wherever the page still renders.
  if (outcome.html) {
    const validThrough = extractValidThrough(outcome.html);
    if (validThrough) {
      const expiry = new Date(validThrough);
      if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < now.getTime()) {
        evidence.push(`JobPosting.validThrough was ${validThrough}`);
        return at("expired");
      }
    }
  }

  // 2. Explicitly gone. 410 means the publisher removed it on purpose.
  if (outcome.status === 410) {
    evidence.push("HTTP 410 Gone");
    return at("gone");
  }

  // 3. The page says so in words.
  if (outcome.html) {
    const tombstone = findTombstone(outcome.html);
    if (tombstone) {
      evidence.push(`Page states: "${truncate(tombstone, 120)}"`);
      return at("expired");
    }
  }

  // 4/5. 404 — trustworthy only from a host that returns real 404s.
  if (outcome.status === 404) {
    if (outcome.hostSoft404s === true) {
      // The host 200s for URLs that cannot exist, so its 404 is not meaningful
      // either way. Ambiguous, not dead.
      evidence.push("HTTP 404, but this host also returns 2xx for made-up URLs");
      return at("unreachable");
    }
    evidence.push(
      outcome.hostSoft404s === false
        ? "HTTP 404, confirmed against a control URL on the same host"
        : "HTTP 404"
    );
    return at("gone");
  }

  // 6. Alive but declining robots. Never a retirement.
  if (outcome.status !== null && BLOCKED_STATUSES.has(outcome.status)) {
    evidence.push(`HTTP ${outcome.status} — server responded but refused this client`);
    return at("blocked");
  }

  // 7. Never got an answer, or the server is broken right now.
  if (outcome.status === null) {
    evidence.push(outcome.networkError ? `Request failed: ${outcome.networkError}` : "Request failed");
    return at("unreachable");
  }
  if (outcome.status >= 500) {
    evidence.push(`HTTP ${outcome.status} — server error`);
    return at("unreachable");
  }

  // 8. Anything else 2xx/3xx with no expiry signal is treated as live.
  if (outcome.status >= 200 && outcome.status < 400) {
    evidence.push(`HTTP ${outcome.status}, no expiry signal found`);
    return at("ok");
  }

  evidence.push(`HTTP ${outcome.status}`);
  return at("unreachable");
}

/**
 * The two-strike rule.
 *
 * A definitive verdict retires on sight. An ambiguous one only counts once the
 * SAME row has failed on two consecutive sweeps — a single site outage or
 * rate-limit must not delete a real opportunity, because the cost of that
 * mistake falls on a student who never sees the listing.
 *
 * `priorFailures` is the row's stored `check_failures` BEFORE this check.
 */
export function shouldRetire(verdict: LivenessVerdict, priorFailures: number): boolean {
  if (DEFINITIVE.has(verdict)) return true;
  if (verdict === "unreachable") return priorFailures + 1 >= FAILURE_LIMIT;
  return false; // ok, blocked
}

/** How `check_failures` moves after a check. Success forgives past failures. */
export function nextFailureCount(verdict: LivenessVerdict, priorFailures: number): number {
  if (verdict === "ok" || verdict === "blocked") return 0;
  if (DEFINITIVE.has(verdict)) return priorFailures; // retiring anyway
  return priorFailures + 1;
}

// ---------------------------------------------------------------------------
// Network layer
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 12_000;
/** Identifies the crawler honestly so a site can allow or block it on purpose. */
const USER_AGENT = "BVCITS-OpportunityBot/1.0 (+https://bvcits.edu.in)";
/** Only read enough of the page to find JSON-LD and tombstone copy. */
const MAX_HTML_BYTES = 400_000;

async function fetchPage(url: string): Promise<{ status: number | null; html: string; error?: string }> {
  try {
    const response = await fetch(url, {
      // GET, not HEAD: a soft-404 is only visible in the body, and some hosts
      // answer HEAD with 405 while serving GET fine.
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    let html = "";
    try {
      html = (await response.text()).slice(0, MAX_HTML_BYTES);
    } catch {
      // A body that fails to read does not invalidate the status line.
    }
    return { status: response.status, html };
  } catch (error) {
    return { status: null, html: "", error: error instanceof Error ? error.message : "unknown error" };
  }
}

/**
 * Does this host return a real 404 for a URL that cannot exist?
 *
 * Only asked when the real URL 404s, because that is the only case where the
 * answer changes the verdict — and it costs a second request, so it is not
 * worth spending on every row.
 */
async function detectSoft404(url: string): Promise<boolean | null> {
  try {
    const parsed = new URL(url);
    const probe = new URL(parsed.toString());
    const suffix = `bvcits-liveness-probe-${Math.random().toString(36).slice(2, 10)}`;
    probe.pathname = `${parsed.pathname.replace(/\/+$/, "")}/${suffix}`;

    const response = await fetch(probe.toString(), {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.status >= 200 && response.status < 300;
  } catch {
    return null; // Inconclusive — judge() treats this as a plain 404.
  }
}

/** Fetch a URL and grade it. The one function the sweep calls per row. */
export async function checkLiveness(url: string, now: Date = new Date()): Promise<LivenessResult> {
  const page = await fetchPage(url);
  const hostSoft404s = page.status === 404 ? await detectSoft404(url) : null;

  return judge(
    { status: page.status, html: page.html, hostSoft404s, networkError: page.error },
    now
  );
}
