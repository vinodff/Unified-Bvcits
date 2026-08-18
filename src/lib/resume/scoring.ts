// Resume scoring: the headline 0-100 plus the four dimensions shown as bars.
//
// The single most important property here is that BEFORE and AFTER go through
// the identical function. A "+58 pts" claim is only meaningful if both sides
// were measured the same way — score the original with one rubric and the
// rewrite with a friendlier one and the improvement is just an artifact of the
// scoring, which is exactly the trick this feature exists to avoid.
//
// Pure and deterministic, like scoreOpportunity() in
// src/lib/opportunities/score.ts: every number is reproducible from the inputs
// and explainable by the breakdown returned beside it.

import { checkAts } from "./ats";
import { bulletStrength } from "./bullets";
import { analyzeGap } from "./gap";
import { computeKeywordCoverage } from "./keyword-coverage";
import { normalizeSkill } from "./skills";
import type { RequirementSet, ResumeSections, ScoreResult, SubScores } from "./types";

/**
 * Weights. Keyword match and ATS compatibility dominate because they are what
 * actually gates a resume in an automated screen; impact language and role
 * alignment are what a human reviewer responds to once it gets through.
 */
const WEIGHTS: Record<keyof SubScores, number> = {
  keywordMatch: 0.35,
  atsCompatibility: 0.25,
  impactLanguage: 0.2,
  roleAlignment: 0.2,
};

/** Words that describe the job itself rather than a skill — used for role alignment. */
const ROLE_STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "will", "our", "are", "job", "role", "work",
  "team", "we", "a", "an", "to", "of", "in", "on", "at", "is", "as", "be", "or",
  "this", "that", "have", "has", "your", "their", "from", "by", "who", "all",
  "must", "should", "can", "may", "any", "more", "than", "into", "about",
  "candidate", "candidates", "applicant", "applicants", "responsibilities",
  "requirements", "qualifications", "experience", "skills", "ability", "strong",
  "good", "excellent", "years", "year", "plus", "preferred", "required",
]);

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !ROLE_STOPWORDS.has(w));
}

/**
 * How much of the target's own vocabulary the resume speaks back.
 *
 * Distinct from keyword match, which only looks at extracted *skills*. A
 * resume can list every required technology and still read as though it were
 * written for a different job — this is the dimension that catches that.
 */
function roleAlignmentScore(sections: ResumeSections, targetText: string): number {
  const targetWords = [...new Set(significantWords(targetText))];
  if (targetWords.length === 0) return 100;

  const resumeText = [
    sections.summary,
    ...sections.experience.map((e) => `${e.role} ${e.organization} ${e.bullets.join(" ")}`),
    ...sections.projects.map((p) => `${p.name} ${p.stack} ${p.bullets.join(" ")}`),
    ...sections.skills,
  ]
    .join(" ")
    .toLowerCase();

  const hits = targetWords.filter((w) => resumeText.includes(w)).length;

  // Overlap with a full JD's vocabulary is naturally low even for an excellent
  // resume — a JD contains company boilerplate no resume would ever echo. 45%
  // raw overlap is treated as a perfect alignment so the bar reads honestly
  // instead of pinning every real resume in the red.
  const raw = hits / targetWords.length;
  return Math.round(Math.min(100, (raw / 0.45) * 100));
}

/**
 * Average bullet strength.
 *
 * Uses the graded bulletStrength() rather than a pass/fail count — see that
 * function's note on why an all-or-nothing rule scored real resumes at 0%.
 */
function impactLanguageScore(sections: ResumeSections): number {
  const bullets = [...sections.experience.flatMap((e) => e.bullets), ...sections.projects.flatMap((p) => p.bullets)]
    .map((b) => b.trim())
    .filter(Boolean);

  if (bullets.length === 0) return 0;

  const total = bullets.reduce((sum, b) => sum + bulletStrength(b), 0);
  return Math.round(total / bullets.length);
}

function keywordMatchScore(sections: ResumeSections, requirements: RequirementSet): number {
  if (requirements.skills.length === 0) {
    // Nothing extractable to match against — fall back to raw keyword coverage
    // rather than awarding a free 100, which would flatter an empty resume.
    return computeKeywordCoverage(sections, requirements).coveragePercent;
  }
  const { matchedSkills } = analyzeGap(sections, requirements);
  return Math.round((matchedSkills.length / requirements.skills.length) * 100);
}

export function scoreResume(sections: ResumeSections, requirements: RequirementSet, targetText: string): ScoreResult {
  const subScores: SubScores = {
    keywordMatch: keywordMatchScore(sections, requirements),
    atsCompatibility: checkAts(sections).score,
    impactLanguage: impactLanguageScore(sections),
    roleAlignment: roleAlignmentScore(sections, targetText),
  };

  const overall = Math.round(
    (Object.keys(WEIGHTS) as (keyof SubScores)[]).reduce((sum, key) => sum + subScores[key] * WEIGHTS[key], 0)
  );

  return { overall: Math.max(0, Math.min(100, overall)), subScores };
}

/**
 * Ranks the skills a resume is missing.
 *
 * Severity comes from how central the skill is to the posting, approximated by
 * how often the JD repeats it: a requirement mentioned four times is the job,
 * one mentioned once is a nice-to-have. Counting mentions beats asking a model
 * to rate importance — it is reproducible and the student can verify it by
 * searching the posting themselves.
 */
export function rankSkillGaps(missingSkills: readonly string[], targetText: string) {
  const haystack = targetText.toLowerCase();

  return missingSkills.map((skill) => {
    const normalized = normalizeSkill(skill);
    const mentions = normalized ? haystack.split(normalized).length - 1 : 0;

    if (mentions >= 3) {
      return { skill, severity: "critical" as const, reason: `Named ${mentions} times in the posting — this is central to the role.` };
    }
    if (mentions === 2) {
      return { skill, severity: "high" as const, reason: "Named twice in the posting — treat this as a real requirement." };
    }
    return { skill, severity: "moderate" as const, reason: "Mentioned once — worth adding if you genuinely have it." };
  });
}
