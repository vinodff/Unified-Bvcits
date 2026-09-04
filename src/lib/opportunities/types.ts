// Shared contracts for the opportunity discovery pipeline.
//
// As in src/lib/auth/roles.ts, every union is DERIVED from a runtime array so
// the list the UI renders, the type the code checks, and the Postgres enum in
// supabase/migrations/0006_opportunities.sql cannot drift apart. Adding a kind
// here also needs `alter type public.opportunity_kind add value`.

export const OPPORTUNITY_KINDS = [
  "internship",
  "job",
  "hackathon",
  "competition",
  "event",
  "webinar",
  "workshop",
  "ambassador",
  "scholarship",
  "fellowship",
] as const;

export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export function isOpportunityKind(value: unknown): value is OpportunityKind {
  return typeof value === "string" && (OPPORTUNITY_KINDS as readonly string[]).includes(value);
}

export const KIND_LABELS: Record<OpportunityKind, string> = {
  internship: "Internship",
  job: "Job",
  hackathon: "Hackathon",
  competition: "Competition",
  event: "Event",
  webinar: "Webinar",
  workshop: "Workshop",
  ambassador: "Campus Ambassador",
  scholarship: "Scholarship",
  fellowship: "Fellowship",
};

export const WORK_MODES = ["onsite", "remote", "hybrid"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

/**
 * Pipeline status.
 *
 * `pending` is the honest default: a row that has been extracted but has not
 * cleared verification is NOT shown to students. Only `verified` reaches the
 * portal — see the RLS policy in 0006. `rejected` rows are kept rather than
 * deleted so the same scam URL discovered again can be dropped without
 * re-running the checks, and so a human can audit what the filter threw away.
 */
export const OPPORTUNITY_STATUSES = ["pending", "verified", "rejected"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

/** Trust tier of the domain an opportunity was found on. See sources.ts. */
export const SOURCE_TIERS = ["official", "aggregator", "unknown", "blocked"] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];

/**
 * What a discovery agent hands to verification — deliberately loose, because it
 * comes from the open web. Nothing here is trusted until verify.ts says so.
 */
export interface OpportunityCandidate {
  title: string;
  organization: string;
  kind: OpportunityKind;
  applyUrl: string;
  sourceUrl?: string | null;
  location?: string | null;
  workMode?: WorkMode | null;
  eligibility?: string | null;
  skills?: readonly string[];
  description?: string | null;
  /** ISO date (YYYY-MM-DD). Null when the source states no deadline. */
  deadline?: string | null;
  postedAt?: string | null;
}

/**
 * A stored row, as the portal reads it back.
 *
 * Narrows two fields that are optional on a candidate: once a row exists,
 * `skills` is always an array (empty if none were extracted) and `deadline` is
 * always either a date or an explicit null. That distinction is the difference
 * between "the scraper did not report this" and "this posting has no deadline",
 * and keeping it in the type means the UI never has to guard for `undefined`.
 */
export interface OpportunityRecord extends OpportunityCandidate {
  id: string;
  skills: readonly string[];
  deadline: string | null;
  status: OpportunityStatus;
  sourceTier: SourceTier;
  signals: readonly string[];
  discoveredAt: string;
  /**
   * How many distinct sources carried this same listing. 1 means "seen once";
   * higher is corroboration, and is worth showing a student.
   */
  corroborations: number;
  /** When the liveness sweep last proved this link still works. */
  lastCheckedAt: string | null;
}

/** The slice of a student's profile that ranking actually uses. */
export interface StudentContext {
  department: string | null;
  studyYear?: number | null;
}
