/**
 * Letter grade -> grade point, and the credit-weighted SGPA built on it.
 *
 * This runs in the OPPOSITE direction to
 * `src/app/dashboard/classes/[slotId]/results/grading.ts`, which turns marks a
 * faculty member typed into a grade. Here the university has already published
 * the letter and it is authoritative — an uploaded sheet's grade is never
 * recomputed from its marks, because the sheet may reflect moderation,
 * revaluation or a grace mark that the raw marks do not show.
 *
 * The point values match that module's scale for every letter they share
 * (O=10, A+=9, A=8, B+=7, B=6, C=5) so the two never disagree about a grade
 * they both understand. `D` is added at 4 as the lowest passing band, which the
 * marks-based scale has no equivalent for.
 */

import { RESULT_ABSENT, RESULT_FAIL, RESULT_WITHHELD, type LookupSubject } from "./types";

const GRADE_POINTS: Record<string, number> = {
  O: 10,
  "A+": 9,
  A: 8,
  "B+": 7,
  B: 6,
  C: 5,
  D: 4,
  E: 4,
  P: 4,
  F: 0,
  AB: 0,
  ABSENT: 0,
};

/**
 * The point value for a printed grade, or null when the letter is unknown.
 *
 * Null matters: it is what stops SGPA being quietly computed from an
 * incomplete picture. An unrecognised grade suppresses the SGPA for that
 * semester rather than being treated as a zero, which would understate it.
 */
export function gradePointFor(grade: string | null | undefined): number | null {
  if (!grade) return null;
  const key = grade.trim().toUpperCase();
  return key in GRADE_POINTS ? GRADE_POINTS[key] : null;
}

export interface SgpaResult {
  /** Credit-weighted average, or null when it cannot be computed honestly. */
  sgpa: number | null;
  /** Credits actually earned — the sheet's own credits column, summed. */
  creditsEarned: number;
  /** Credits sat for, including failed subjects (which earn 0). */
  creditsAttempted: number;
  backlogs: number;
}

/**
 * SGPA over one batch.
 *
 * Uses each subject's CREDIT WEIGHT for the attempted total, not the credits
 * column, because the sheet writes 0.0 credits for a failed subject — summing
 * that column would drop failures out of the denominator entirely and inflate
 * the SGPA of exactly the students whose SGPA matters most.
 *
 * The credit weight for a failed subject is unknown from the row itself (the
 * sheet zeroed it), so it is inferred from what the same subject was worth to
 * students who passed it. When that is unavailable, the subject is excluded
 * and `sgpa` is returned as null rather than as a number computed from a
 * partial denominator.
 */
export function computeSgpa(subjects: readonly LookupSubject[], creditWeights?: ReadonlyMap<string, number>): SgpaResult {
  let weightedPoints = 0;
  let creditsAttempted = 0;
  let creditsEarned = 0;
  let backlogs = 0;
  let gradeable = 0;
  let ungradeable = 0;

  for (const subject of subjects) {
    creditsEarned += subject.credits;

    const failed =
      subject.result === RESULT_FAIL || subject.result === RESULT_ABSENT || subject.result === RESULT_WITHHELD;
    if (failed) backlogs += 1;

    const weight = subject.credits > 0 ? subject.credits : (creditWeights?.get(subject.subjectCode) ?? 0);
    const point = gradePointFor(subject.grade);

    if (point === null || weight <= 0) {
      ungradeable += 1;
      continue;
    }

    gradeable += 1;
    creditsAttempted += weight;
    weightedPoints += weight * point;
  }

  // Refuse to publish a number built on some of the subjects. A student
  // comparing an SGPA here against their marks memo must not find a third
  // value that neither source agrees with.
  const sgpa = gradeable > 0 && ungradeable === 0 && creditsAttempted > 0 ? weightedPoints / creditsAttempted : null;

  return { sgpa, creditsEarned, creditsAttempted, backlogs };
}

/**
 * What each subject code is worth, learned from the rows that passed it.
 *
 * Built across the whole batch so a failed row (credits zeroed) can still be
 * weighted correctly in its own student's SGPA.
 */
export function creditWeightsFrom(rows: readonly { subjectCode: string; credits: number }[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const row of rows) {
    if (row.credits <= 0) continue;
    const existing = weights.get(row.subjectCode);
    // Max rather than first-seen: if one row is a partial credit award, the
    // subject's real weight is the largest value anyone earned for it.
    if (existing === undefined || row.credits > existing) weights.set(row.subjectCode, row.credits);
  }
  return weights;
}
