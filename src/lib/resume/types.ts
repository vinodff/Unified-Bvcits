// Shared contracts for the resume optimizer.
//
// As in src/lib/opportunities/types.ts, unions are derived from a runtime
// array so the Postgres enum in supabase/migrations/0008_resume_optimizer.sql
// cannot drift from what the UI renders and the code checks.

/** Severity of a skill gap, ordered most-urgent first. */
export const GAP_SEVERITIES = ["critical", "high", "moderate"] as const;
export type GapSeverity = (typeof GAP_SEVERITIES)[number];

/** How well a claim in the optimized resume is backed by the original. */
export const EVIDENCE_LEVELS = ["verified", "partial", "weak"] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export interface ResumeEducationEntry {
  institution: string;
  degree: string;
  /** e.g. "2022 – 2026" — free text, not a date range, since a student mid-degree has no end date. */
  years: string;
  detail: string;
}

export interface ResumeExperienceEntry {
  organization: string;
  role: string;
  years: string;
  bullets: string[];
}

export interface ResumeProjectEntry {
  name: string;
  bullets: string[];
  /** Comma-separated tech list as the student typed it, kept separate from `skills` below. */
  stack: string;
}

export interface ResumeCertificationEntry {
  name: string;
  issuer: string;
  year: string;
}

/** The structured content a resume is built from. Stored as `resumes.sections` jsonb. */
export interface ResumeSections {
  contact: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
  };
  summary: string;
  education: ResumeEducationEntry[];
  experience: ResumeExperienceEntry[];
  projects: ResumeProjectEntry[];
  skills: string[];
  certifications: ResumeCertificationEntry[];
}

export function emptySections(): ResumeSections {
  return {
    contact: { fullName: "", email: "", phone: "", location: "" },
    summary: "",
    education: [],
    experience: [],
    projects: [],
    skills: [],
    certifications: [],
  };
}

const MAX_ENTRIES = 12;
const MAX_BULLETS = 10;
const MAX_SHORT = 160;
const MAX_LONG = 1000;
const MAX_BULLET = 400;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function strArray(value: unknown, maxItems: number, maxLen: number): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, maxItems).map((v) => v.slice(0, maxLen)) : [];
}

/**
 * Merges a possibly-partial, possibly-untrusted value onto the default shape
 * and enforces size caps. Used for both DB rows (records.ts, where caps are a
 * no-op on legitimate data) and incoming form submissions (actions.ts, where
 * they're the actual boundary check — nothing else validates resume content
 * size before it reaches Postgres).
 */
export function sanitizeSections(value: unknown): ResumeSections {
  const fallback = emptySections();
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<ResumeSections> & { contact?: Partial<ResumeSections["contact"]> };

  const contact: Partial<ResumeSections["contact"]> = raw.contact && typeof raw.contact === "object" ? raw.contact : {};
  const education = Array.isArray(raw.education) ? raw.education : [];
  const experience = Array.isArray(raw.experience) ? raw.experience : [];
  const projects = Array.isArray(raw.projects) ? raw.projects : [];
  const certifications = Array.isArray(raw.certifications) ? raw.certifications : [];

  return {
    contact: {
      fullName: str(contact.fullName, MAX_SHORT),
      email: str(contact.email, MAX_SHORT),
      phone: str(contact.phone, MAX_SHORT),
      location: str(contact.location, MAX_SHORT),
    },
    summary: str(raw.summary, MAX_LONG),
    education: education.slice(0, MAX_ENTRIES).map((e) => ({
      institution: str(e?.institution, MAX_SHORT),
      degree: str(e?.degree, MAX_SHORT),
      years: str(e?.years, 40),
      detail: str(e?.detail, MAX_LONG),
    })),
    experience: experience.slice(0, MAX_ENTRIES).map((e) => ({
      organization: str(e?.organization, MAX_SHORT),
      role: str(e?.role, MAX_SHORT),
      years: str(e?.years, 40),
      bullets: strArray(e?.bullets, MAX_BULLETS, MAX_BULLET),
    })),
    projects: projects.slice(0, MAX_ENTRIES).map((p) => ({
      name: str(p?.name, MAX_SHORT),
      stack: str(p?.stack, MAX_SHORT),
      bullets: strArray(p?.bullets, MAX_BULLETS, MAX_BULLET),
    })),
    skills: strArray(raw.skills, 60, 60),
    certifications: certifications.slice(0, MAX_ENTRIES).map((c) => ({
      name: str(c?.name, MAX_SHORT),
      issuer: str(c?.issuer, MAX_SHORT),
      year: str(c?.year, 40),
    })),
  };
}

export interface Resume {
  id: string;
  studentId: string;
  title: string;
  /** Verbatim source text — the evidence base every trust score is graded against. */
  originalText: string;
  sections: ResumeSections;
  createdAt: string;
  updatedAt: string;
}

/** What a target (a saved opportunity or pasted JD) reduces to before scoring. */
export interface RequirementSet {
  skills: string[];
  keywords: string[];
}

export interface KeywordCoverage {
  totalKeywords: number;
  coveredKeywords: number;
  coveragePercent: number;
  missingKeywords: string[];
}

export interface AtsResult {
  score: number;
  issues: string[];
}

export interface GapResult {
  matchedSkills: string[];
  missingSkills: string[];
}

export type AnalysisTarget =
  | { kind: "opportunity"; opportunityId: string; title: string; organization: string; skills: readonly string[]; description: string | null }
  | { kind: "text"; jdText: string };

/** The four dimensions shown as bars under the headline score. */
export interface SubScores {
  keywordMatch: number;
  atsCompatibility: number;
  impactLanguage: number;
  roleAlignment: number;
}

export interface ScoreResult {
  overall: number;
  subScores: SubScores;
}

/** One skill the target wants that the resume does not evidence. */
export interface SkillGap {
  skill: string;
  severity: GapSeverity;
  /** Why it was ranked this way — shown to the student, never a bare label. */
  reason: string;
}

/** One row of the evidence map: a claim, and how well the original backs it. */
export interface EvidenceItem {
  claim: string;
  level: EvidenceLevel;
  /** The supporting text found in the original, or why nothing was found. */
  detail: string;
}

export interface EvidenceReport {
  trustScore: number;
  items: EvidenceItem[];
}

/** Everything one optimization run produces. */
export interface OptimizationResult {
  before: ScoreResult;
  after: ScoreResult;
  optimizedSections: ResumeSections;
  matchedSkills: string[];
  missingSkills: string[];
  keywordCoverage: KeywordCoverage;
  skillGaps: SkillGap[];
  evidence: EvidenceReport;
  /** True when the rewrite came from the deterministic fallback, not a model. */
  usedFallback: boolean;
}

/** One persisted optimization run, as the history list reads it back. */
export interface StoredOptimization {
  id: string;
  resumeId: string;
  jdText: string;
  jdUrl: string | null;
  extraNotes: string | null;
  before: ScoreResult;
  after: ScoreResult;
  matchedSkills: string[];
  missingSkills: string[];
  keywordCoverage: KeywordCoverage;
  evidence: EvidenceReport;
  skillGaps: SkillGap[];
  optimizedSections: ResumeSections;
  createdAt: string;
}
