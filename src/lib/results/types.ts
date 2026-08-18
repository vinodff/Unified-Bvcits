/**
 * Shared shapes for the results portal — the Excel import pipeline and the
 * public hall-ticket lookup.
 *
 * Deliberately free of any `xlsx` or Supabase import so both the browser
 * components and the pure parser can use these without dragging a parser or a
 * database driver into the client bundle.
 */

/**
 * Normalised outcome for one subject.
 *
 * `string`, not a closed union, because universities publish statuses this
 * project cannot enumerate ahead of time — "MP" for malpractice, "WITHHELD",
 * "DETAINED". The importer maps everything it recognises onto the four
 * constants below and passes anything else through lowercased, so an unusual
 * sheet imports rather than failing. See `RESULT_*` below for the known set.
 */
export type ResultOutcome = string;

export const RESULT_PASS = "pass";
export const RESULT_FAIL = "fail";
export const RESULT_ABSENT = "absent";
export const RESULT_WITHHELD = "withheld";

/** Every column the importer knows how to recognise in an uploaded sheet. */
export type ResultColumn =
  | "serial"
  | "hallTicket"
  | "studentName"
  | "branch"
  | "subjectCode"
  | "subjectName"
  | "internalMarks"
  | "externalMarks"
  | "totalMarks"
  | "grade"
  | "credits"
  | "result"
  | "dateOfBirth";

/** One subject-line of one student, as read out of the spreadsheet. */
export interface ParsedMarkRow {
  hallTicketNo: string;
  studentName: string | null;
  branch: string | null;
  subjectCode: string;
  subjectName: string;
  internalMarks: number | null;
  externalMarks: number | null;
  totalMarks: number | null;
  grade: string | null;
  credits: number;
  result: ResultOutcome | null;
  /** ISO `yyyy-mm-dd`, only when the sheet actually carried a DOB column. */
  dateOfBirth: string | null;
  /** 1-based row number in the source sheet, for tracing a rejected row back. */
  sourceRow: number;
  sourceSheet: string;
}

/** A row the importer could not use, reported back to the admin verbatim. */
export interface ParseIssue {
  sheet: string;
  /** 1-based row number as the operator sees it in Excel. */
  row: number;
  message: string;
}

/** Per-sheet diagnostics, so an operator can see WHY a tab contributed nothing. */
export interface SheetReport {
  name: string;
  /** 1-based row the header was found on, or null when no header was found. */
  headerRow: number | null;
  mappedColumns: ResultColumn[];
  dataRows: number;
  acceptedRows: number;
}

export interface ParsedWorkbook {
  rows: ParsedMarkRow[];
  issues: ParseIssue[];
  sheets: SheetReport[];
}

/** Headline numbers for the pre-commit preview screen. */
export interface ImportSummary {
  totalRows: number;
  students: number;
  subjects: number;
  branches: string[];
  withDateOfBirth: number;
  pass: number;
  fail: number;
  absent: number;
  other: number;
}

// --- lookup (public student side) -------------------------------------------

/** One subject row as returned to a student. Never includes DOB or internals of the batch. */
export interface LookupSubject {
  subjectCode: string;
  subjectName: string;
  internalMarks: number | null;
  externalMarks: number | null;
  totalMarks: number | null;
  grade: string | null;
  credits: number;
  result: ResultOutcome | null;
}

export interface LookupBatch {
  id: string;
  title: string;
  academicYear: string | null;
  semester: string | null;
  examType: string | null;
  publishedAt: string | null;
  subjects: LookupSubject[];
  /** Credit-weighted GPA across gradeable subjects, or null when ungradeable. */
  sgpa: number | null;
  creditsEarned: number;
  creditsAttempted: number;
  backlogs: number;
}

export interface LookupResponse {
  hallTicketNo: string;
  studentName: string | null;
  branch: string | null;
  batches: LookupBatch[];
}
