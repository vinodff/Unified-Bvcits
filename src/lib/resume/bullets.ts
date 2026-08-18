// Bullet improvement (pipeline stage 5): flags weak bullets and says exactly
// why, instead of silently rewriting them for the student.
//
// Deliberately NOT an LLM rewrite step. The two failure modes an LLM
// introduces here — inventing a metric the student never measured, or
// quietly changing what they claim they did — are worse than a student
// seeing "add a number" and writing their own true one. Detection is
// perfectly suited to being deterministic (a verb list, a digit regex); only
// the *fix* would need judgement, and that's left to the student.

const STRONG_ACTION_VERBS = [
  "built", "developed", "designed", "implemented", "created", "led", "managed",
  "launched", "improved", "optimized", "reduced", "increased", "automated",
  "architected", "deployed", "integrated", "migrated", "refactored", "wrote",
  "engineered", "delivered", "collaborated", "mentored", "presented",
  "researched", "analyzed", "resolved", "streamlined", "coordinated",
  "founded", "organized", "trained", "spearheaded", "achieved", "won",
  "published", "tested", "debugged", "scaled", "established",
] as const;

const WEAK_OPENERS = ["responsible for", "worked on", "helped with", "involved in", "assisted with", "was part of"];

const HAS_DIGIT = /\d/;

export interface BulletFeedback {
  bullet: string;
  issues: string[];
}

function startsWithStrongVerb(bullet: string): boolean {
  const firstWord = bullet.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "");
  return !!firstWord && (STRONG_ACTION_VERBS as readonly string[]).includes(firstWord);
}

function startsWeak(bullet: string): boolean {
  const lower = bullet.trim().toLowerCase();
  return WEAK_OPENERS.some((opener) => lower.startsWith(opener));
}

/** Reviews one bullet; returns an empty issues array when it's already strong. */
export function reviewBullet(bullet: string): BulletFeedback {
  const issues: string[] = [];
  const trimmed = bullet.trim();

  if (!trimmed) return { bullet, issues };

  if (startsWeak(trimmed)) {
    issues.push('Starts with a passive phrase ("responsible for" / "worked on") — open with what you actually did.');
  } else if (!startsWithStrongVerb(trimmed)) {
    issues.push("Doesn't open with a strong action verb (e.g. Built, Led, Improved, Automated).");
  }

  if (!HAS_DIGIT.test(trimmed)) {
    issues.push("Has no number — a scale, count, percentage or time saved makes impact concrete.");
  }

  return { bullet, issues };
}

/** Reviews every experience/project bullet; returns only the ones with something to fix. */
export function reviewBullets(bullets: readonly string[]): BulletFeedback[] {
  return bullets.map(reviewBullet).filter((feedback) => feedback.issues.length > 0);
}

/**
 * Graded strength of one bullet, 0-100.
 *
 * Deliberately NOT pass/fail. The first version of the Impact Language score
 * counted a bullet as good only when it had BOTH a strong opening verb AND a
 * number, which scored a genuinely decent resume at 0% — "Designed and
 * developed a full-stack web platform for college operations" is a real
 * accomplishment written in the right voice, and calling it worthless because
 * it lacks a digit is not useful feedback, it is just a wrong measurement.
 *
 * Verb choice is the larger share because it is the part a rewrite can
 * legitimately fix; a missing number needs a fact only the student has.
 */
export function bulletStrength(bullet: string): number {
  const trimmed = bullet.trim();
  if (!trimmed) return 0;

  let score = 0;
  if (startsWeak(trimmed)) score += 0;
  else if (startsWithStrongVerb(trimmed)) score += 60;
  else score += 30; // neutral opener: not passive, but not a strong verb either

  if (HAS_DIGIT.test(trimmed)) score += 40;

  // A one-clause fragment describes nothing regardless of how it opens.
  if (trimmed.split(/\s+/).length < 6) score = Math.min(score, 40);

  return Math.min(100, score);
}
