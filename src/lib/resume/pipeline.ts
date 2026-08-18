// The full run: resume + job description in, before/after scores and a
// rewritten resume out.
//
// Stage order matches what the UI shows top to bottom, and each stage is a
// module that can be tested on its own:
//
//   requirements → score(before) → optimize → score(after) → gap → evidence
//
// Scoring runs twice against the SAME function (scoring.ts) — see that file's
// header for why that symmetry is the whole point of the before/after claim.

import { buildEvidenceReport } from "./evidence";
import { analyzeGap } from "./gap";
import { computeKeywordCoverage } from "./keyword-coverage";
import { optimizeResume } from "./optimize";
import { optimizeDeterministically } from "./rewrite";
import { extractRequirements } from "./requirements";
import { rankSkillGaps, scoreResume } from "./scoring";
import type { OptimizationResult, ResumeSections } from "./types";

export interface RunOptions {
  sections: ResumeSections;
  /** The verbatim original text — the evidence base for the trust score. */
  originalText: string;
  jdText: string;
  extraNotes?: string;
}

export async function runOptimization({ sections, originalText, jdText, extraNotes = "" }: RunOptions): Promise<OptimizationResult> {
  const requirements = extractRequirements({ kind: "text", jdText });

  const before = scoreResume(sections, requirements, jdText);

  const { sections: modelSections, usedFallback } = await optimizeResume(sections, requirements, jdText, extraNotes);

  // An optimizer must never hand back something worse than it was given. A
  // model rewrite can lose ground — dropping a keyword, flattening a bullet
  // that already had a number — and shipping that produced the nonsense of a
  // "-2 pts improvement" badge. Score the candidates and keep the best; the
  // safe deterministic pass is always in the running, and so is doing nothing.
  const safeSections = optimizeDeterministically(sections, requirements);
  const candidates: ResumeSections[] = [modelSections, safeSections, sections];

  let optimizedSections = candidates[0];
  let after = scoreResume(optimizedSections, requirements, jdText);
  for (const candidate of candidates.slice(1)) {
    const score = scoreResume(candidate, requirements, jdText);
    if (score.overall > after.overall) {
      optimizedSections = candidate;
      after = score;
    }
  }

  // Gap and coverage are reported against the OPTIMIZED resume: that is what
  // the student is about to send, so "still missing" has to mean still missing
  // after the rewrite, not before it.
  const { matchedSkills, missingSkills } = analyzeGap(optimizedSections, requirements);
  const keywordCoverage = computeKeywordCoverage(optimizedSections, requirements);

  return {
    before,
    after,
    optimizedSections,
    matchedSkills,
    missingSkills,
    keywordCoverage,
    skillGaps: rankSkillGaps(missingSkills, jdText),
    evidence: buildEvidenceReport(optimizedSections, originalText, requirements.skills),
    usedFallback,
  };
}
