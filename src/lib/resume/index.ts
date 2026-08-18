// Public surface of the resume optimizer.
//
// Server-only modules (llm, jd-fetch, extract-file) are deliberately NOT
// re-exported here: this barrel is imported by client components for its
// types, and pulling a "server-only" module into that graph is a build error.
// Import those three directly from their own paths in server code.

export * from "./types";
export { runOptimization, type RunOptions } from "./pipeline";
export { scoreResume, rankSkillGaps } from "./scoring";
export { buildEvidenceReport } from "./evidence";
export { optimizeDeterministically, mergeModelRewrite } from "./rewrite";
export { extractRequirements } from "./requirements";
export { analyzeGap, resumeSkillSet } from "./gap";
export { computeKeywordCoverage, renderedResumeText } from "./keyword-coverage";
export { checkAts } from "./ats";
export { reviewBullet, reviewBullets, type BulletFeedback } from "./bullets";
export { parsePastedResume } from "./parse-paste";
export { extractSkillsFromText, splitSkillList, isKnownSkill, normalizeSkill, KNOWN_SKILLS } from "./skills";
export { fromResumeRow, fromOptimizationRow, RESUME_COLUMNS, OPTIMIZATION_COLUMNS } from "./records";
