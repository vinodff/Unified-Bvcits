// Public surface of the opportunity pipeline.

export * from "./types";
export { classifyHost, TIER_WEIGHT } from "./sources";
export {
  canonicalizeUrl,
  contentFingerprint,
  isDeadlineSane,
  isStudentLevel,
  urlFingerprint,
  verifyCandidate,
  type Reachability,
  type VerificationResult,
  type VerifyOptions,
} from "./verify";
export {
  daysUntil,
  rankOpportunities,
  scoreOpportunity,
  type ScoreBreakdown,
  type ScoredOpportunity,
} from "./score";
export { fromRow, OPPORTUNITY_COLUMNS } from "./records";
