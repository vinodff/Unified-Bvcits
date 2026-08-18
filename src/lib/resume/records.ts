// Row → domain mapping, same reasoning as src/lib/opportunities/records.ts:
// defined once so a row in a shape the app doesn't expect (a jsonb column
// missing a field a later version added) is patched with defaults rather than
// rendered as `undefined` throughout the UI.

import { EVIDENCE_LEVELS, GAP_SEVERITIES, sanitizeSections } from "./types";
import type {
  EvidenceItem,
  EvidenceReport,
  KeywordCoverage,
  Resume,
  ScoreResult,
  SkillGap,
  StoredOptimization,
  SubScores,
} from "./types";

export const RESUME_COLUMNS = "id, student_id, title, original_text, sections, created_at, updated_at";

export const OPTIMIZATION_COLUMNS =
  "id, resume_id, jd_text, jd_url, extra_notes, before_score, after_score, before_subscores, after_subscores, matched_skills, missing_skills, keyword_coverage, trust_score, evidence, skill_gaps, optimized_sections, created_at";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function fromResumeRow(row: Record<string, unknown>): Resume | null {
  if (typeof row.id !== "string" || typeof row.student_id !== "string") return null;
  return {
    id: row.id,
    studentId: row.student_id,
    title: typeof row.title === "string" ? row.title : "My Resume",
    originalText: typeof row.original_text === "string" ? row.original_text : "",
    sections: sanitizeSections(row.sections),
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}

function asSubScores(value: unknown): SubScores {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<SubScores>;
  return {
    keywordMatch: num(raw.keywordMatch),
    atsCompatibility: num(raw.atsCompatibility),
    impactLanguage: num(raw.impactLanguage),
    roleAlignment: num(raw.roleAlignment),
  };
}

function asKeywordCoverage(value: unknown): KeywordCoverage {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<KeywordCoverage>;
  return {
    totalKeywords: num(raw.totalKeywords),
    coveredKeywords: num(raw.coveredKeywords),
    coveragePercent: num(raw.coveragePercent),
    missingKeywords: asStringArray(raw.missingKeywords),
  };
}

function asEvidenceItems(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Partial<EvidenceItem>;
    if (typeof raw.claim !== "string") return [];
    const level = (EVIDENCE_LEVELS as readonly string[]).includes(raw.level as string) ? (raw.level as EvidenceItem["level"]) : "weak";
    return [{ claim: raw.claim, level, detail: typeof raw.detail === "string" ? raw.detail : "" }];
  });
}

function asSkillGaps(value: unknown): SkillGap[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Partial<SkillGap>;
    if (typeof raw.skill !== "string") return [];
    const severity = (GAP_SEVERITIES as readonly string[]).includes(raw.severity as string) ? (raw.severity as SkillGap["severity"]) : "moderate";
    return [{ skill: raw.skill, severity, reason: typeof raw.reason === "string" ? raw.reason : "" }];
  });
}

export function fromOptimizationRow(row: Record<string, unknown>): StoredOptimization | null {
  if (typeof row.id !== "string" || typeof row.resume_id !== "string") return null;

  const before: ScoreResult = { overall: num(row.before_score), subScores: asSubScores(row.before_subscores) };
  const after: ScoreResult = { overall: num(row.after_score), subScores: asSubScores(row.after_subscores) };
  const evidence: EvidenceReport = { trustScore: num(row.trust_score), items: asEvidenceItems(row.evidence) };

  return {
    id: row.id,
    resumeId: row.resume_id,
    jdText: typeof row.jd_text === "string" ? row.jd_text : "",
    jdUrl: typeof row.jd_url === "string" ? row.jd_url : null,
    extraNotes: typeof row.extra_notes === "string" ? row.extra_notes : null,
    before,
    after,
    matchedSkills: asStringArray(row.matched_skills),
    missingSkills: asStringArray(row.missing_skills),
    keywordCoverage: asKeywordCoverage(row.keyword_coverage),
    evidence,
    skillGaps: asSkillGaps(row.skill_gaps),
    optimizedSections: sanitizeSections(row.optimized_sections),
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}
