// Ranking.
//
// The score answers one question: "of everything currently open, what should
// THIS student look at first?" It is computed at read time from the student's
// profile rather than stored on the row, because the same internship ranks
// differently for a final-year CSE student and a second-year Civil student.
//
// Every component is bounded and the breakdown is returned alongside the total
// so the UI can explain a ranking instead of presenting a magic number.

import { TIER_WEIGHT } from "./sources";
import type { OpportunityKind, OpportunityRecord, StudentContext } from "./types";

/**
 * Keywords that indicate an opportunity is aimed at a department.
 *
 * Deliberately plain-text matching over the title and skills rather than
 * embeddings: it is inspectable, it costs nothing per request, and when it is
 * wrong a human can see exactly which word did it.
 */
const DEPARTMENT_KEYWORDS: Record<string, readonly string[]> = {
  CSE: ["software", "sde", "developer", "backend", "frontend", "full stack", "python", "java", "web", "cloud", "devops", "computer science"],
  "CSE (AI & ML)": ["machine learning", "ml", "ai", "deep learning", "nlp", "computer vision", "data science", "python", "llm"],
  "AI & DS": ["data science", "data analyst", "machine learning", "ai", "analytics", "python", "sql", "statistics"],
  ECE: ["embedded", "vlsi", "iot", "electronics", "firmware", "signal processing", "rf", "semiconductor", "hardware"],
  EEE: ["electrical", "power", "energy", "plc", "scada", "grid", "renewable", "control systems"],
  Mechanical: ["mechanical", "cad", "manufacturing", "thermal", "automobile", "design engineer", "solidworks", "ansys"],
  Civil: ["civil", "structural", "construction", "autocad", "surveying", "geotechnical", "estimation"],
  MBA: ["marketing", "finance", "human resources", "business analyst", "sales", "operations", "consulting", "strategy"],
  MCA: ["software", "developer", "java", "python", "full stack", "database", "application", "dotnet"],
  "Basic Sciences & Humanities": ["research", "fellowship", "teaching", "physics", "chemistry", "mathematics", "communication"],
};

/** How much a kind is worth to a student, before any personalisation. */
const KIND_WEIGHT: Record<OpportunityKind, number> = {
  internship: 15,
  job: 15,
  hackathon: 12,
  scholarship: 12,
  fellowship: 12,
  competition: 10,
  ambassador: 10,
  workshop: 8,
  event: 7,
  webinar: 6,
};

export interface ScoreBreakdown {
  source: number;
  urgency: number;
  profile: number;
  kind: number;
  freshness: number;
}

export interface ScoredOpportunity {
  total: number;
  breakdown: ScoreBreakdown;
  /** Short reasons shown on the card: "Closes in 3 days", "Matches CSE". */
  reasons: string[];
}

/**
 * Whole days from `now` until `deadline`; null when there is no deadline.
 *
 * Compares calendar days rather than subtracting instants. Doing it by instant
 * makes a deadline of *today* come out as a fraction that rounds to 1 — so the
 * last day of an application window would announce itself as "closes in 1 day"
 * and never as "closes today", in the one feature whose entire promise is that
 * a student does not miss the deadline.
 */
export function daysUntil(deadline: string | null | undefined, now: Date): number | null {
  if (!deadline) return null;
  const parsed = new Date(`${deadline}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((parsed.getTime() - today) / 86_400_000);
}

/**
 * Urgency is front-loaded on purpose.
 *
 * The product promise is "never miss a deadline", so a posting closing in two
 * days must outrank a better-matched one closing in three months — the student
 * can still act on the second one tomorrow.
 */
function urgencyPoints(days: number | null): number {
  if (days === null) return 4;
  if (days < 0) return 0;
  if (days <= 3) return 20;
  if (days <= 7) return 17;
  if (days <= 14) return 13;
  if (days <= 30) return 9;
  if (days <= 60) return 6;
  return 3;
}

function profilePoints(
  opportunity: OpportunityRecord,
  student: StudentContext
): { points: number; matched: string[] } {
  const keywords = student.department ? DEPARTMENT_KEYWORDS[student.department] : undefined;
  if (!keywords) return { points: 0, matched: [] };

  const haystack = [opportunity.title, ...(opportunity.skills ?? []), opportunity.eligibility ?? ""]
    .join(" ")
    .toLowerCase();

  const matched = keywords.filter((keyword) => haystack.includes(keyword));

  // Diminishing returns: three matching keywords is a strong signal, ten is
  // not three times stronger — it usually means the posting lists every
  // technology it has ever heard of.
  const points = Math.min(30, matched.length * 10);
  return { points, matched };
}

/** Recently discovered rows rank slightly higher — the feed should feel live. */
function freshnessPoints(discoveredAt: string, now: Date): number {
  const parsed = new Date(discoveredAt);
  if (Number.isNaN(parsed.getTime())) return 0;
  const ageDays = (now.getTime() - parsed.getTime()) / 86_400_000;
  if (ageDays <= 3) return 10;
  if (ageDays <= 7) return 7;
  if (ageDays <= 30) return 3;
  return 0;
}

export function scoreOpportunity(
  opportunity: OpportunityRecord,
  student: StudentContext,
  now: Date = new Date()
): ScoredOpportunity {
  const days = daysUntil(opportunity.deadline, now);
  const { points: profile, matched } = profilePoints(opportunity, student);

  const breakdown: ScoreBreakdown = {
    source: TIER_WEIGHT[opportunity.sourceTier],
    urgency: urgencyPoints(days),
    profile,
    kind: KIND_WEIGHT[opportunity.kind],
    freshness: freshnessPoints(opportunity.discoveredAt, now),
  };

  const total = Math.min(
    100,
    breakdown.source + breakdown.urgency + breakdown.profile + breakdown.kind + breakdown.freshness
  );

  const reasons: string[] = [];
  if (days !== null && days >= 0 && days <= 7) {
    reasons.push(days === 0 ? "Closes today" : `Closes in ${days} day${days === 1 ? "" : "s"}`);
  }
  if (matched.length > 0 && student.department) {
    reasons.push(`Matches ${student.department}`);
  }
  if (opportunity.sourceTier === "official") {
    reasons.push("Official source");
  }

  return { total, breakdown, reasons };
}

/** Highest score first; ties broken by the nearer deadline. */
export function rankOpportunities(
  opportunities: readonly OpportunityRecord[],
  student: StudentContext,
  now: Date = new Date()
): { opportunity: OpportunityRecord; score: ScoredOpportunity }[] {
  return opportunities
    .map((opportunity) => ({ opportunity, score: scoreOpportunity(opportunity, student, now) }))
    .sort((a, b) => {
      if (b.score.total !== a.score.total) return b.score.total - a.score.total;
      const aDays = daysUntil(a.opportunity.deadline, now) ?? Number.MAX_SAFE_INTEGER;
      const bDays = daysUntil(b.opportunity.deadline, now) ?? Number.MAX_SAFE_INTEGER;
      return aDays - bDays;
    });
}
