// Requirement extraction (pipeline stage 1): turns a target — a saved
// opportunity or pasted JD text — into a flat RequirementSet the gap and
// keyword-coverage stages compare a resume against.
//
// Deliberately deterministic, same reasoning as context-agent.ts in the
// marketing pipeline: this feeds the grounding layer every later stage is
// checked against, so it must never guess or hallucinate a requirement that
// isn't actually in the source text.

import { extractSkillsFromText, normalizeSkill } from "./skills";
import type { AnalysisTarget, RequirementSet } from "./types";

/**
 * A saved opportunity already carries a structured `skills[]` column (see
 * 0006_opportunities.sql) — curated by the discovery pipeline's verifier, not
 * scraped free text. There is nothing to parse; the only extraction step is
 * pulling extra keywords out of the description for coverage scoring.
 */
function requirementsFromOpportunity(skills: readonly string[], description: string | null): RequirementSet {
  const baseSkills = [...new Set(skills.map(normalizeSkill).filter(Boolean))];
  const descriptionSkills = description ? extractSkillsFromText(description) : [];
  const keywords = [...new Set([...baseSkills, ...descriptionSkills])];
  return { skills: baseSkills, keywords };
}

/** Free-text JD: every requirement has to be found via the skills dictionary. */
function requirementsFromText(jdText: string): RequirementSet {
  const skills = extractSkillsFromText(jdText);
  return { skills, keywords: skills };
}

export function extractRequirements(target: AnalysisTarget): RequirementSet {
  if (target.kind === "opportunity") {
    return requirementsFromOpportunity(target.skills, target.description);
  }
  return requirementsFromText(target.jdText);
}
