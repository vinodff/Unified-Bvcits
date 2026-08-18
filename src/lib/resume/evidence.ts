// Trust & Evidence: how well the optimized resume's claims are backed by the
// student's original.
//
// This is the safety mechanism that makes an LLM rewrite acceptable at all.
// The model is told not to invent anything, but "told not to" is not a
// control — this module independently checks each claim in the rewrite against
// the original text and grades it. A skill the model added out of thin air
// surfaces as WEAK with "no mention in your original", which is the honest
// answer, and the student decides whether to keep it.
//
// Deliberately reports rather than deletes. Silently stripping unbacked claims
// would hide the model's behaviour from the person who has to defend the
// resume in an interview; showing them is what lets them catch it.

import { resumeSkillSet } from "./gap";
import { normalizeSkill } from "./skills";
import type { EvidenceItem, EvidenceLevel, EvidenceReport, ResumeSections } from "./types";

/** Contribution of each level to the overall trust score. */
const LEVEL_WEIGHT: Record<EvidenceLevel, number> = {
  verified: 1,
  partial: 0.6,
  weak: 0.1,
};

/** Sentences/bullets from the original that mention a term, for the "detail" line. */
function findSupportingText(original: string, term: string): string | null {
  const normalized = normalizeSkill(term);
  if (!normalized) return null;

  const fragments = original
    .split(/[\n•●▪]|(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter(Boolean);

  const match = fragments.find((f) => f.toLowerCase().includes(normalized));
  if (!match) return null;

  return match.length > 160 ? `${match.slice(0, 157)}…` : match;
}

/**
 * Grades one claim.
 *
 * The distinction between verified and partial is whether the original shows
 * the skill being *used* or merely *listed*. A resume that says "Skills:
 * Docker" is weaker evidence than one with a bullet describing a container
 * deployment, and an interviewer will find that difference immediately — so
 * the map draws it before they do.
 */
function gradeClaim(claim: string, originalText: string): EvidenceItem {
  const support = findSupportingText(originalText, claim);

  if (!support) {
    return {
      claim,
      level: "weak",
      detail: "No mention in your original resume — only keep this if you can back it up in an interview.",
    };
  }

  // A short fragment that is mostly a comma-separated list is a listing, not a
  // demonstration. Anything longer that mentions the term is treated as real
  // usage evidence.
  const looksLikeBareList = support.length < 80 && support.split(",").length >= 3;
  const level: EvidenceLevel = looksLikeBareList ? "partial" : "verified";

  return {
    claim,
    level,
    detail: looksLikeBareList ? `Listed in your original, but not demonstrated: "${support}"` : support,
  };
}

/**
 * Builds the evidence map for an optimized resume.
 *
 * `focusSkills` narrows the map to what the reader cares about — the skills
 * the target job asked for — rather than grading all forty terms on the
 * resume. Skills the rewrite claims that the job never asked about are still
 * included when unbacked, because an invented claim matters regardless of
 * whether the job wanted it.
 */
export function buildEvidenceReport(
  optimized: ResumeSections,
  originalText: string,
  focusSkills: readonly string[]
): EvidenceReport {
  const optimizedSkills = resumeSkillSet(optimized);
  const focus = new Set(focusSkills.map(normalizeSkill));

  const graded = optimizedSkills.map((skill) => gradeClaim(skill, originalText));

  // Show every job-relevant skill, plus any unbacked claim regardless of
  // relevance — an invention is worth surfacing even off-target.
  const items = graded.filter((item) => focus.has(normalizeSkill(item.claim)) || item.level === "weak");

  const scored = items.length > 0 ? items : graded;
  const trustScore =
    scored.length === 0
      ? 100
      : Math.round((scored.reduce((sum, item) => sum + LEVEL_WEIGHT[item.level], 0) / scored.length) * 100);

  // Weakest first: the rows that need the student's attention lead the list.
  const order: Record<EvidenceLevel, number> = { weak: 0, partial: 1, verified: 2 };
  const sorted = [...items].sort((a, b) => order[a.level] - order[b.level]);

  return { trustScore, items: sorted };
}
