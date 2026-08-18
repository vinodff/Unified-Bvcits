// Skill gap analysis (pipeline stage 2): diffs a resume's own skills against
// a RequirementSet. Pure and deterministic — no LLM involved, so a "missing
// skill" result is always traceable back to an actual absence in the
// resume's text, never a model's opinion.

import { extractSkillsFromText, normalizeSkill } from "./skills";
import type { GapResult, RequirementSet, ResumeSections } from "./types";

/**
 * Every skill the resume itself demonstrates: the explicit `skills` list plus
 * anything the skills dictionary recognizes inside experience/project bullets,
 * project stacks and the summary. A student who wrote "Built a REST API with
 * Django" in a bullet but forgot to also list "django" under Skills should
 * not be told they're missing it.
 */
export function resumeSkillSet(sections: ResumeSections): string[] {
  const explicit = sections.skills.map(normalizeSkill).filter(Boolean);

  const freeText = [
    sections.summary,
    ...sections.experience.flatMap((e) => e.bullets),
    ...sections.projects.flatMap((p) => [p.stack, ...p.bullets]),
  ].join(" \n ");

  const fromText = extractSkillsFromText(freeText);

  return [...new Set([...explicit, ...fromText])];
}

export function analyzeGap(sections: ResumeSections, requirements: RequirementSet): GapResult {
  const resumeSkills = new Set(resumeSkillSet(sections));

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const skill of requirements.skills) {
    if (resumeSkills.has(skill)) matchedSkills.push(skill);
    else missingSkills.push(skill);
  }

  return { matchedSkills, missingSkills };
}
