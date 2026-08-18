// Keyword coverage (pipeline stage 3): what fraction of the target's
// keywords appear literally in the resume's rendered text. Deterministic
// substring scoring — the same "scoring is a pure function, not an LLM call"
// convention as scoreOpportunity() in src/lib/opportunities/score.ts.
//
// This is a different question from gap analysis: gap analysis asks "which
// required skills does the resume demonstrate at all" (dictionary-matched),
// while coverage asks "would an ATS keyword scanner actually find this term
// in the document text" (literal substring). A resume can demonstrate a
// skill in spirit while phrasing it differently than the JD does — coverage
// is what tells the student to fix the wording, not just the substance.

import { normalizeSkill } from "./skills";
import type { KeywordCoverage, RequirementSet, ResumeSections } from "./types";

/** Every field an ATS scanner would actually see, flattened into one lowercased string. */
export function renderedResumeText(sections: ResumeSections): string {
  return [
    sections.summary,
    ...sections.skills,
    ...sections.education.map((e) => `${e.institution} ${e.degree} ${e.detail}`),
    ...sections.experience.flatMap((e) => [e.organization, e.role, ...e.bullets]),
    ...sections.projects.flatMap((p) => [p.name, p.stack, ...p.bullets]),
    ...sections.certifications.map((c) => `${c.name} ${c.issuer}`),
  ]
    .join(" \n ")
    .toLowerCase();
}

export function computeKeywordCoverage(sections: ResumeSections, requirements: RequirementSet): KeywordCoverage {
  const text = renderedResumeText(sections);
  const keywords = [...new Set(requirements.keywords.map(normalizeSkill).filter(Boolean))];

  if (keywords.length === 0) {
    return { totalKeywords: 0, coveredKeywords: 0, coveragePercent: 100, missingKeywords: [] };
  }

  const missingKeywords = keywords.filter((keyword) => !text.includes(keyword));
  const coveredKeywords = keywords.length - missingKeywords.length;

  return {
    totalKeywords: keywords.length,
    coveredKeywords,
    coveragePercent: Math.round((coveredKeywords / keywords.length) * 100),
    missingKeywords,
  };
}
