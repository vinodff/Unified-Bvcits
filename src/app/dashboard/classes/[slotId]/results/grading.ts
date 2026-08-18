/**
 * Standard 10-point autonomous grading scale (matches the O/A+/A/B+/B/C/F
 * bands JNTUK-affiliated autonomous colleges use). Faculty enter marks only —
 * grade, grade point and pass/fail are derived, not typed in, so there is no
 * way for a subject's grade to disagree with its own marks.
 */
export interface GradeResult {
  grade: string;
  gradePoint: number;
  status: "pass" | "fail";
}

const SCALE: { floor: number; grade: string; gradePoint: number }[] = [
  { floor: 90, grade: "O", gradePoint: 10 },
  { floor: 80, grade: "A+", gradePoint: 9 },
  { floor: 70, grade: "A", gradePoint: 8 },
  { floor: 60, grade: "B+", gradePoint: 7 },
  { floor: 50, grade: "B", gradePoint: 6 },
  { floor: 40, grade: "C", gradePoint: 5 },
];

export function gradeFromMarks(totalMarks: number, maxMarks: number): GradeResult {
  const pct = maxMarks > 0 ? (totalMarks / maxMarks) * 100 : 0;
  const band = SCALE.find((b) => pct >= b.floor);
  if (!band) return { grade: "F", gradePoint: 0, status: "fail" };
  return { grade: band.grade, gradePoint: band.gradePoint, status: "pass" };
}
