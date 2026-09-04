// Verification: the gate between "found on the web" and "shown to a student".
//
// Everything here is a PURE function of the candidate plus an injected `now`
// and an optional reachability result. Network I/O lives in the discovery
// script, not in this module — that is what makes the scam rules testable
// without hitting the internet, and what lets the same rules run server-side
// on a row that was inserted by some other path.
//
// Design stance: this filter is intentionally biased toward rejecting. A
// student who misses one real opportunity loses one opportunity; a student who
// pays ₹2,000 to a fake "placement drive" loses money and trust in the portal.

import { classifyHost } from "./sources";
import { regionVerdict } from "./region";
import type { OpportunityCandidate, OpportunityStatus, SourceTier } from "./types";

/** Query parameters that carry no identity — dropped before fingerprinting. */
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
  "src",
  "source",
  "trk",
  "trackingId",
  "originalSubdomain",
];

/**
 * Reduce a URL to a stable identity string.
 *
 * The same posting reaches us as `.../job/123?utm_source=linkedin`, as
 * `.../job/123/`, and as `HTTPS://WWW.Host/job/123#apply`. Without this all
 * three are different rows and the student sees the same internship three
 * times. Returns null for anything that is not http(s) — a `javascript:` or
 * `data:` "apply link" is not a URL we will ever render.
 */
export function canonicalizeUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

  for (const param of TRACKING_PARAMS) parsed.searchParams.delete(param);
  parsed.searchParams.sort();

  const path = parsed.pathname.replace(/\/+$/, "");
  const query = parsed.searchParams.toString();

  return `${host}${path}${query ? `?${query}` : ""}`;
}

/**
 * Identity used for the unique index.
 *
 * Deliberately ignores the scheme, so an http and an https copy of the same
 * posting collide into one row rather than both being stored.
 */
export function urlFingerprint(raw: string): string | null {
  return canonicalizeUrl(raw);
}

/**
 * Secondary identity for the case the URLs genuinely differ — the same drive
 * posted on the company site and on Internshala. Normalising away punctuation,
 * years and role noise makes "Google STEP Internship 2026" and
 * "google step internship" collide.
 */
export function contentFingerprint(title: string, organization: string): string {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\b(20\d{2}|batch|hiring|apply|now|off\s*campus)\b/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");

  return `${normalize(organization)}::${normalize(title)}`;
}

/**
 * Phrases that mark an advance-fee or credential-harvesting scam.
 *
 * These are matched against title + description only. Every one of them
 * describes something a legitimate employer never asks a candidate for:
 * an employer pays you, and never needs your Aadhaar to schedule an interview.
 */
const FEE_PATTERNS: readonly RegExp[] = [
  /\b(registration|application|processing|training|security|joining)\s*(fee|charge|deposit|amount)/i,
  /\bpay\s*(?:just|only)?\s*(?:₹|rs\.?|inr)\s*\d/i,
  /\brefundable\s+deposit\b/i,
  /\bpaid\s+(?:training|certification)\s+(?:required|mandatory)\b/i,
];

const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /\b(aadhaar|aadhar|pan\s*card|passport\s*number)\b/i,
  /\b(bank|account)\s*(details|number)\b/i,
  /\b(upi|paytm|gpay|phonepe)\b/i,
  /\bcvv\b/i,
];

const TOO_GOOD_PATTERNS: readonly RegExp[] = [
  /\b(100%|guaranteed|assured)\s*(job|placement|selection|offer)/i,
  /\bno\s+interview\s+(required|needed)\b/i,
  /\bwork\s+from\s+home.*\b(₹|rs\.?)\s*\d{4,}\s*(?:\/|per\s*)?day\b/i,
  /\bearn\s*(?:₹|rs\.?)\s*\d+.*\b(daily|per\s*day)\b/i,
];

const CHAT_ONLY_PATTERNS: readonly RegExp[] = [
  /\b(?:dm|whatsapp|telegram)\s*(?:me|us)?\s*(?:on|at|to)?\s*(?:\+?\d[\d\s-]{7,})/i,
  /\bjoin\s+(?:our\s+)?(?:whatsapp|telegram)\s+(?:group|channel)\s+to\s+apply/i,
];

/**
 * Titles that mark a posting as aimed at students or new graduates. Any of
 * these wins outright — "Lead Generation Intern" is an internship, whatever the
 * word "Lead" would otherwise suggest.
 */
const STUDENT_MARKERS =
  /\b(intern|internship|trainee|fresher|graduate|new\s*grad|campus|student|apprentice|entry[\s-]level|co-?op)\b/i;

/** Titles that mark a posting as requiring an established career. */
const SENIOR_MARKERS =
  /\b(senior|sr\.?|principal|staff\s+engineer|lead\s+engineer|director|head\s+of|manager|architect|vp|chief)\b/i;

/** "5 years of experience" and friends. Two or fewer is still reachable. */
const EXPERIENCE_MARKERS = /\b([3-9]|[1-9]\d)\+?\s*(?:\+\s*)?years?\s+(?:of\s+)?(?:relevant\s+)?experience/i;

/**
 * Is this something a current student could actually take?
 *
 * Added after the second live run, which published "Principal Software
 * Engineer — Site Reliability" and "Sr. AI Engineer" to a student board. Both
 * were real, official and open — the trust checks were right about them and
 * still produced a useless card, because trustworthiness and relevance are
 * different questions and only the first was being asked.
 *
 * Non-employment kinds skip the check: a hackathon or a scholarship has no
 * seniority to speak of.
 */
export function isStudentLevel(candidate: OpportunityCandidate): boolean {
  if (candidate.kind !== "job" && candidate.kind !== "internship") return true;
  if (STUDENT_MARKERS.test(candidate.title)) return true;
  if (SENIOR_MARKERS.test(candidate.title)) return false;

  const requirements = `${candidate.eligibility ?? ""} ${candidate.description ?? ""}`;
  return !EXPERIENCE_MARKERS.test(requirements);
}

export interface VerificationResult {
  status: OpportunityStatus;
  sourceTier: SourceTier;
  /** Human-readable reasons, stored on the row so a reviewer can audit calls. */
  signals: string[];
  canonicalUrl: string | null;
}

/**
 * Outcome of the HTTP probe on the apply URL.
 *
 * `blocked` exists because collapsing it into `dead` was measurably wrong: a
 * real corporate careers site (cummins.com, in the first live run) answers an
 * unknown bot with 403 while serving the page perfectly to a browser. The
 * server responded — that is the opposite of a dead link — so treating the two
 * alike rejected precisely the official sources this pipeline most wants.
 */
export type Reachability = "ok" | "blocked" | "dead" | "unchecked";

export interface VerifyOptions {
  now: Date;
  /** Result of the HTTP probe. Defaults to "unchecked", which holds at pending. */
  reachability?: Reachability;
  /** Number of independent sources that reported this opportunity. */
  corroborations?: number;
}

/** Deadlines further out than this are almost always a parsing error. */
const MAX_DEADLINE_MONTHS = 18;

export function isDeadlineSane(deadline: string | null | undefined, now: Date): boolean {
  if (!deadline) return true; // a missing deadline is not an error, just unknown

  const parsed = new Date(`${deadline}T23:59:59Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  if (parsed.getTime() < now.getTime()) return false;

  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + MAX_DEADLINE_MONTHS);
  return parsed.getTime() <= horizon.getTime();
}

/**
 * Run every check and decide whether a student may see this.
 *
 * Promotion to `verified` requires ALL of:
 *   - a resolvable https(-capable) URL on a non-blocked host
 *   - a known-good domain tier (official, or aggregator with corroboration)
 *   - no fee / credential / too-good-to-be-true / chat-only signal
 *   - a deadline that is either absent or in the future
 *   - a successful reachability probe
 *
 * Anything merely unproven lands at `pending`, not `rejected`: "we have not
 * checked this yet" and "we believe this is a scam" are different claims and
 * the pipeline should not conflate them.
 */
export function verifyCandidate(
  candidate: OpportunityCandidate,
  options: VerifyOptions
): VerificationResult {
  const signals: string[] = [];
  const canonicalUrl = canonicalizeUrl(candidate.applyUrl);

  if (!canonicalUrl) {
    return {
      status: "rejected",
      sourceTier: "blocked",
      signals: ["apply URL is not a valid http(s) address"],
      canonicalUrl: null,
    };
  }

  const host = canonicalUrl.split("/")[0];
  const sourceTier = classifyHost(host);

  if (sourceTier === "blocked") {
    return {
      status: "rejected",
      sourceTier,
      signals: [`apply URL points at a link shortener or chat invite (${host})`],
      canonicalUrl,
    };
  }

  const haystack = `${candidate.title} ${candidate.description ?? ""} ${candidate.eligibility ?? ""}`;

  if (FEE_PATTERNS.some((re) => re.test(haystack))) {
    signals.push("asks the applicant for a fee or deposit");
  }
  if (CREDENTIAL_PATTERNS.some((re) => re.test(haystack))) {
    signals.push("requests financial or identity credentials up front");
  }
  if (TOO_GOOD_PATTERNS.some((re) => re.test(haystack))) {
    signals.push("guarantees placement or unrealistic pay");
  }
  if (CHAT_ONLY_PATTERNS.some((re) => re.test(haystack))) {
    signals.push("routes applications through a personal chat");
  }

  // Any of the above is disqualifying on its own — these are not "score it
  // lower" signals, they are the fraud pattern itself.
  if (signals.length > 0) {
    return { status: "rejected", sourceTier, signals, canonicalUrl };
  }

  // Not a fraud signal — just not for this audience. Stored as rejected so the
  // dedup index remembers it and the next run does not re-extract it.
  if (!isStudentLevel(candidate)) {
    return {
      status: "rejected",
      sourceTier,
      signals: ["requires professional experience — not a student-level opportunity"],
      canonicalUrl,
    };
  }

  // Wrong country is the same class of miss as wrong seniority: everything
  // about the listing is true, it just is not reachable by the student reading
  // it. See region.ts for why `unknown` is held rather than dropped.
  const region = regionVerdict(candidate);
  if (!region.acceptable) {
    return {
      status: "rejected",
      sourceTier,
      signals: [region.signal ?? "outside India"],
      canonicalUrl,
    };
  }
  if (region.signal) signals.push(region.signal);

  if (!isDeadlineSane(candidate.deadline, options.now)) {
    return {
      status: "rejected",
      sourceTier,
      signals: [`deadline ${candidate.deadline} is in the past or implausible`],
      canonicalUrl,
    };
  }

  if (!candidate.organization.trim() || !candidate.title.trim()) {
    return {
      status: "pending",
      sourceTier,
      signals: ["missing title or organisation"],
      canonicalUrl,
    };
  }

  const reachability = options.reachability ?? "unchecked";

  if (reachability === "dead") {
    return {
      status: "rejected",
      sourceTier,
      signals: ["apply URL is dead or returned a server error"],
      canonicalUrl,
    };
  }

  if (reachability === "unchecked") {
    signals.push("reachability not yet checked");
    return { status: "pending", sourceTier, signals, canonicalUrl };
  }

  if (reachability === "blocked") {
    // Not disqualifying — see the Reachability doc comment. Recorded so the
    // card can say the link was not machine-confirmed.
    signals.push("apply URL is behind bot protection — not machine-verified");
  }

  if (sourceTier === "unknown") {
    signals.push("source domain is not a known employer, ATS or job board");
    return { status: "pending", sourceTier, signals, canonicalUrl };
  }

  // An aggregator repost is real often enough to publish, but we say so on the
  // card rather than pretending it came from the employer.
  if (sourceTier === "aggregator") {
    signals.push("second-hand listing — confirm on the employer's own site");
    if ((options.corroborations ?? 1) < 1) {
      return { status: "pending", sourceTier, signals, canonicalUrl };
    }
  }

  // A listing that never said where it is has cleared every other check, so it
  // is probably fine — but "probably" is not good enough to put in front of a
  // student as an Indian opportunity. A human decides.
  if (region.needsReview) {
    return { status: "pending", sourceTier, signals, canonicalUrl };
  }

  return { status: "verified", sourceTier, signals, canonicalUrl };
}
