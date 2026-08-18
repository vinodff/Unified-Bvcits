/**
 * Column recognition and cell coercion for uploaded results sheets.
 *
 * Every function here is pure and takes primitives — no `xlsx`, no I/O — so
 * the awkward half of importing (a header spelled six ways, a date in three
 * formats, "0.0" vs "" vs "-") is unit-testable without fixture files.
 *
 * The guiding rule: an unrecognised sheet should FAIL LOUDLY with a row number,
 * and a recognisable-but-untidy sheet should IMPORT. An admin dragging in the
 * exam section's file cannot edit its headers, so tolerance here is the whole
 * point of the feature.
 */

import type { ResultColumn, ResultOutcome } from "./types";
import { RESULT_ABSENT, RESULT_FAIL, RESULT_PASS, RESULT_WITHHELD } from "./types";

/**
 * Header text reduced to a comparison key: lowercased, every non-alphanumeric
 * character dropped. So "Hall Ticket No", "HALL_TICKET_NO", "Hall-Ticket No."
 * and "hallticketno" all collapse to the same key, and the alias table below
 * only needs one entry per genuinely different name.
 */
export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Aliases per column, as normalised keys.
 *
 * Ordering matters for the longest-match rule in `matchColumn`: "totalmarks"
 * must win over "marks" when a header contains both, otherwise a "Total Marks"
 * column binds to whichever alias happened to be tested first.
 */
const COLUMN_ALIASES: Record<ResultColumn, readonly string[]> = {
  serial: ["sno", "slno", "sino", "serialno", "serial", "sinumber", "no"],
  hallTicket: [
    "hallticketno",
    "hallticketnumber",
    "hallticket",
    "htno",
    "htnumber",
    "rollno",
    "rollnumber",
    "rollnum",
    "roll",
    "regdno",
    "regno",
    "registerno",
    "registrationno",
    "registernumber",
    "admissionno",
    "studentid",
    "pinno",
    "pin",
  ],
  studentName: [
    "studentname",
    "nameofthestudent",
    "nameofstudent",
    "studentsname",
    "candidatename",
    "name",
  ],
  branch: ["branch", "branchcode", "department", "dept", "course", "programme", "program", "stream"],
  subjectCode: ["subjectcode", "subcode", "subjcode", "papercode", "coursecode", "code"],
  subjectName: [
    "subjectname",
    "subjecttitle",
    "nameofthesubject",
    "subname",
    "papername",
    "papertitle",
    "coursename",
    "coursetitle",
    "subject",
    "paper",
  ],
  internalMarks: [
    "internalmarks",
    "internalmark",
    "internals",
    "internal",
    "intmarks",
    "int",
    "sessionalmarks",
    "sessionals",
    "sessional",
    "cie",
    "midmarks",
  ],
  externalMarks: [
    "externalmarks",
    "externalmark",
    "externals",
    "external",
    "extmarks",
    "ext",
    "semendmarks",
    "semesterendmarks",
    "theorymarks",
    "see",
    "endexammarks",
  ],
  totalMarks: ["totalmarks", "grandtotal", "marksobtained", "obtainedmarks", "total", "marks"],
  grade: ["lettergrade", "gradeletter", "gradeobtained", "grade"],
  credits: ["creditsobtained", "creditsearned", "credits", "credit", "cr"],
  result: ["resultstatus", "passfail", "remarks", "status", "result"],
  dateOfBirth: ["dateofbirth", "dob", "birthdate", "dateofbirthddmmyyyy", "bdate"],
};

/**
 * Which column a header cell denotes, or null.
 *
 * Exact alias match first, then longest containing alias. The containment pass
 * is what lets "Internal Marks (30)" and "Subject Name / Title" bind — real
 * sheets annotate their headers. Longest-first prevents "Total Marks" binding
 * to `totalMarks` via the shorter "marks" alias on a column that also contains
 * a more specific alias.
 */
export function matchColumn(header: unknown): ResultColumn | null {
  const key = normalizeHeader(header);
  if (!key) return null;

  for (const [column, aliases] of Object.entries(COLUMN_ALIASES) as [ResultColumn, readonly string[]][]) {
    if (aliases.includes(key)) return column;
  }

  let best: { column: ResultColumn; length: number } | null = null;
  for (const [column, aliases] of Object.entries(COLUMN_ALIASES) as [ResultColumn, readonly string[]][]) {
    for (const alias of aliases) {
      // Aliases under 4 characters ("no", "cr", "int", "ext") are far too
      // collision-prone to match by containment — "no" appears inside
      // "rollno" and would steal the hall ticket column.
      if (alias.length < 4) continue;
      if (key.includes(alias) && (!best || alias.length > best.length)) {
        best = { column, length: alias.length };
      }
    }
  }
  return best?.column ?? null;
}

/** Trimmed cell text, or null for blank and the dashes sheets use to mean blank. */
export function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  if (!text || text === "-" || text === "--" || text === "N/A" || text === "NA") return null;
  return text;
}

/**
 * A numeric cell, or null.
 *
 * Returns null rather than 0 for "AB"/"ABSENT"/blank: an absent student scored
 * nothing, which is not the same fact as scoring zero, and storing 0 would
 * silently drag their average down. Only actual numbers become numbers.
 */
export function cellNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = cellText(value);
  if (text === null) return null;
  // Strip a trailing "/100" style denominator and any stray currency/percent.
  const cleaned = text.replace(/\s*\/\s*\d+(\.\d+)?$/, "").replace(/[%,]/g, "").trim();
  if (!/^[+-]?\d*\.?\d+$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Hall ticket as stored and compared everywhere: uppercase, no inner spaces. */
export function normalizeHallTicket(value: unknown): string | null {
  const text = cellText(value);
  if (text === null) return null;
  const cleaned = text.replace(/\s/g, "").toUpperCase();
  // Must contain at least one digit — guards against a merged title cell
  // ("CIVIL ENGINEERING") being read as a hall ticket when the sheet has a
  // banner row the header detector let through.
  if (!/\d/.test(cleaned)) return null;
  if (cleaned.length < 4 || cleaned.length > 24) return null;
  return cleaned;
}

/** Grade as printed: uppercase, spaces collapsed. "ab" and "AB" are one grade. */
export function normalizeGrade(value: unknown): string | null {
  const text = cellText(value);
  return text === null ? null : text.toUpperCase();
}

const ABSENT_TOKENS = new Set(["AB", "ABS", "ABSENT", "A"]);
const FAIL_TOKENS = new Set(["F", "FAIL", "FAILED", "R", "RA", "REAPPEAR"]);
const WITHHELD_TOKENS = new Set(["W", "WH", "WITHHELD", "MP", "MALPRACTICE", "DETAINED", "D"]);
const PASS_TOKENS = new Set(["P", "PASS", "PASSED", "Q", "QUALIFIED"]);

/**
 * The outcome for a row, from an explicit Result column when the sheet has one
 * and from the grade otherwise.
 *
 * The sheet in the requirement has both (grade F -> "Fail", grade AB ->
 * "Absent"), but plenty of sheets publish only a grade column, so deriving is
 * not optional. When both exist the explicit column wins — it is what the
 * university printed, and second-guessing it would be inventing data.
 */
export function resolveOutcome(resultCell: unknown, grade: string | null): ResultOutcome | null {
  const explicit = cellText(resultCell);
  if (explicit !== null) {
    const token = explicit.toUpperCase();
    if (ABSENT_TOKENS.has(token)) return RESULT_ABSENT;
    if (FAIL_TOKENS.has(token)) return RESULT_FAIL;
    if (WITHHELD_TOKENS.has(token)) return RESULT_WITHHELD;
    if (PASS_TOKENS.has(token)) return RESULT_PASS;
    // Unrecognised but present: keep what the university said rather than
    // guessing. It renders as-is and stays queryable.
    return token.toLowerCase();
  }

  if (grade === null) return null;
  if (ABSENT_TOKENS.has(grade)) return RESULT_ABSENT;
  if (FAIL_TOKENS.has(grade)) return RESULT_FAIL;
  if (WITHHELD_TOKENS.has(grade)) return RESULT_WITHHELD;
  // Any other letter grade on record means the subject was sat and cleared.
  return RESULT_PASS;
}

/** Excel's day-zero. Excel serial 1 is 1900-01-01; 0 lands on 1899-12-30. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

function isoFrom(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2200) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31 February and friends: the constructor rolls them over, so a
  // round-trip mismatch means the input was not a real calendar date.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * A date of birth as ISO `yyyy-mm-dd`, or null.
 *
 * Handles the three things a DOB arrives as: a JS Date (xlsx `cellDates`), an
 * Excel serial number, and text.
 *
 * AMBIGUITY RULE: `03/04/2005` is read as 3 April, not 4 March. Day-first is
 * the format on every Indian admission form this data comes from. A sheet
 * using US month-first ordering will import wrong dates, which is why the
 * import preview shows parsed DOBs back to the admin before commit.
 */
export function parseDateOfBirth(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return isoFrom(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Below ~1000 this is far more likely a stray count than a 1902 birthday.
    if (value < 1000 || value > 80_000) return null;
    const date = new Date(EXCEL_EPOCH_UTC + Math.round(value) * MS_PER_DAY);
    return isoFrom(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  const text = cellText(value);
  if (text === null) return null;

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return isoFrom(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dayFirst = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]);
    let year = Number(dayFirst[3]);
    // Two-digit years: students are born this century, staff last century.
    if (year < 100) year += year <= 40 ? 2000 : 1900;
    return isoFrom(year, month, day);
  }

  return null;
}

/** Credits, defaulting to 0 — the sheet writes 0.0 for a failed subject. */
export function parseCredits(value: unknown): number {
  const parsed = cellNumber(value);
  if (parsed === null || parsed < 0) return 0;
  return parsed;
}
