// Pure URL-safety and HTML-to-text logic for the JD fetcher.
//
// Split out of jd-fetch.ts so it is testable without network I/O and without
// the "server-only" import that module carries — the same separation
// verify.ts keeps from the discovery script in the opportunity pipeline. The
// SSRF rules are the part most worth testing, and they must not require a
// running server to exercise.

/**
 * Hosts a server-side fetch must never be pointed at.
 *
 * This is the SSRF guard. The server can reach things the student's browser
 * cannot — cloud metadata at 169.254.169.254, the database, anything on the
 * deploy host's private network — so these ranges are refused outright.
 */
const PRIVATE_HOST_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe80:/i,
  /\.local$/i,
  /\.internal$/i,
];

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isDisallowedHost(hostname: string): boolean {
  if (PRIVATE_HOST_PATTERNS.some((p) => p.test(hostname))) return true;
  // A bare IP is never a legitimate job posting and is the usual SSRF vector.
  if (IPV4_RE.test(hostname)) return true;
  if (hostname.includes(":")) return true; // bare IPv6
  return !hostname.includes(".");
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

export function checkJdUrl(rawUrl: string): UrlCheck {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Only https:// links can be fetched." };
  }
  if (isDisallowedHost(parsed.hostname)) {
    return { ok: false, error: "That host isn't allowed. Paste the job description text instead." };
  }
  return { ok: true, url: parsed };
}

/** Strips tags, scripts and styles. Downstream only ever sees text, never markup. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|li|br|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
