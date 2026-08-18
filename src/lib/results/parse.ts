/**
 * Turns a spreadsheet — already read into rows of raw cells — into result rows.
 *
 * Pure: takes `unknown[][]` per sheet, returns rows plus issues. The `xlsx`
 * dependency lives one layer up in `workbook.ts`, so every awkward case here
 * (banner rows above the header, a repeated header where two sheets were
 * concatenated, a duplicate subject line) is testable with a plain array.
 */

import {
  cellNumber,
  cellText,
  matchColumn,
  normalizeGrade,
  normalizeHallTicket,
  parseCredits,
  parseDateOfBirth,
  resolveOutcome,
} from "./columns";
import type { ParseIssue, ParsedMarkRow, ParsedWorkbook, ResultColumn, SheetReport } from "./types";
import { RESULT_ABSENT, RESULT_FAIL, RESULT_PASS } from "./types";

/** A sheet as handed to the parser: a name and its rows of raw cell values. */
export interface RawSheet {
  name: string;
  rows: unknown[][];
}

/** How far down a sheet to look for the header before giving up. */
const HEADER_SEARCH_DEPTH = 25;

/** Columns that must be present for a header row to be believable. */
const MIN_MAPPED_COLUMNS = 3;

/** Cap on rows accepted from one upload — a guard against a runaway file. */
export const MAX_IMPORT_ROWS = 60_000;

interface HeaderMatch {
  /** 0-based index into `rows`. */
  index: number;
  /** Column name per cell position. First occurrence of a column wins. */
  byIndex: Map<number, ResultColumn>;
}

function mapHeaderRow(row: unknown[]): Map<number, ResultColumn> {
  const byIndex = new Map<number, ResultColumn>();
  const claimed = new Set<ResultColumn>();
  for (let i = 0; i < row.length; i += 1) {
    const column = matchColumn(row[i]);
    // A sheet with two columns matching the same field (say "Marks" and
    // "Total Marks") binds the first and ignores the rest, rather than having
    // the last one silently win.
    if (!column || claimed.has(column)) continue;
    claimed.add(column);
    byIndex.set(i, column);
  }
  return byIndex;
}

/**
 * Locate the header.
 *
 * Real sheets put a college name, an exam title and a blank line above the
 * headers, so the header is rarely row 1. A row qualifies only if it maps the
 * hall ticket column plus at least two more — that combination is vanishingly
 * unlikely to occur in a banner or a data row.
 */
export function findHeaderRow(rows: unknown[][]): HeaderMatch | null {
  const depth = Math.min(rows.length, HEADER_SEARCH_DEPTH);
  for (let i = 0; i < depth; i += 1) {
    const byIndex = mapHeaderRow(rows[i] ?? []);
    const columns = new Set(byIndex.values());
    if (columns.has("hallTicket") && columns.size >= MIN_MAPPED_COLUMNS) {
      return { index: i, byIndex };
    }
  }
  return null;
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((cell) => cellText(cell) === null);
}

/** A row that re-states the headers — common when tabs get concatenated. */
function looksLikeHeaderRepeat(row: unknown[], header: HeaderMatch): boolean {
  const mapped = mapHeaderRow(row);
  if (mapped.size < MIN_MAPPED_COLUMNS) return false;
  return mapped.get(indexOf(header, "hallTicket") ?? -1) === "hallTicket";
}

function indexOf(header: HeaderMatch, column: ResultColumn): number | null {
  for (const [index, name] of header.byIndex) {
    if (name === column) return index;
  }
  return null;
}

function read(row: unknown[], header: HeaderMatch, column: ResultColumn): unknown {
  const index = indexOf(header, column);
  return index === null ? null : row[index];
}

/**
 * Derive a stable subject code when the sheet omits one.
 *
 * The DB requires a subject code because it is half of the uniqueness key that
 * makes re-uploading idempotent. Deriving from the name keeps that guarantee
 * for sheets that only publish subject titles.
 */
function deriveSubjectCode(subjectName: string): string {
  const slug = subjectName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return slug || "UNKNOWN";
}

/** Parse every sheet of a workbook into result rows plus a report per sheet. */
export function parseSheets(sheets: readonly RawSheet[]): ParsedWorkbook {
  const rows: ParsedMarkRow[] = [];
  const issues: ParseIssue[] = [];
  const reports: SheetReport[] = [];

  // (hallTicket, subjectCode) -> index in `rows`. Enforced here, not left to
  // the database: Postgres rejects an INSERT ... ON CONFLICT payload that
  // contains the same conflict key twice ("cannot affect row a second time"),
  // so a sheet with a duplicated line would fail the entire upload rather than
  // one row. Last occurrence wins — an appended correction is the usual reason
  // a line repeats.
  const seen = new Map<string, number>();

  for (const sheet of sheets) {
    const header = findHeaderRow(sheet.rows);

    if (!header) {
      // Only worth reporting for sheets that had content; an empty tab is
      // just an empty tab and does not need an error next to it.
      const hasContent = sheet.rows.some((row) => !isBlankRow(row));
      reports.push({ name: sheet.name, headerRow: null, mappedColumns: [], dataRows: 0, acceptedRows: 0 });
      if (hasContent) {
        issues.push({
          sheet: sheet.name,
          row: 1,
          message:
            "No header row found. The sheet needs a row containing a hall ticket column (e.g. \"Hall Ticket No\") plus at least two of: Subject Code, Subject Name, Internal Marks, Grade, Credits, Result.",
        });
      }
      continue;
    }

    const mappedColumns = [...new Set(header.byIndex.values())];
    let dataRows = 0;
    let acceptedRows = 0;

    for (let i = header.index + 1; i < sheet.rows.length; i += 1) {
      const raw = sheet.rows[i] ?? [];
      const sourceRow = i + 1; // 1-based, matching what Excel shows the operator

      if (isBlankRow(raw)) continue;
      if (looksLikeHeaderRepeat(raw, header)) continue;
      dataRows += 1;

      if (rows.length >= MAX_IMPORT_ROWS) {
        issues.push({
          sheet: sheet.name,
          row: sourceRow,
          message: `Import stopped at ${MAX_IMPORT_ROWS.toLocaleString()} rows. Split the file and upload it in parts.`,
        });
        break;
      }

      const hallTicketNo = normalizeHallTicket(read(raw, header, "hallTicket"));
      if (!hallTicketNo) {
        issues.push({ sheet: sheet.name, row: sourceRow, message: "Missing or unreadable hall ticket number — row skipped." });
        continue;
      }

      const subjectCodeRaw = cellText(read(raw, header, "subjectCode"));
      const subjectNameRaw = cellText(read(raw, header, "subjectName"));
      if (!subjectCodeRaw && !subjectNameRaw) {
        issues.push({
          sheet: sheet.name,
          row: sourceRow,
          message: `${hallTicketNo}: row has neither a subject code nor a subject name — row skipped.`,
        });
        continue;
      }

      const subjectName = subjectNameRaw ?? subjectCodeRaw!;
      const subjectCode = (subjectCodeRaw ?? deriveSubjectCode(subjectName)).toUpperCase();

      const grade = normalizeGrade(read(raw, header, "grade"));
      const internalMarks = cellNumber(read(raw, header, "internalMarks"));
      const externalMarks = cellNumber(read(raw, header, "externalMarks"));
      const totalCell = cellNumber(read(raw, header, "totalMarks"));

      const row: ParsedMarkRow = {
        hallTicketNo,
        studentName: cellText(read(raw, header, "studentName")),
        branch: cellText(read(raw, header, "branch")),
        subjectCode,
        subjectName,
        internalMarks,
        externalMarks,
        // Only compute a total when the sheet did not print one AND both parts
        // exist. Adding an internal to a missing external would publish a
        // "total" that is really just the internal mark.
        totalMarks:
          totalCell ?? (internalMarks !== null && externalMarks !== null ? internalMarks + externalMarks : null),
        grade,
        credits: parseCredits(read(raw, header, "credits")),
        result: resolveOutcome(read(raw, header, "result"), grade),
        dateOfBirth: parseDateOfBirth(read(raw, header, "dateOfBirth")),
        sourceRow,
        sourceSheet: sheet.name,
      };

      const key = `${hallTicketNo}::${subjectCode}`;
      const existing = seen.get(key);
      if (existing !== undefined) {
        issues.push({
          sheet: sheet.name,
          row: sourceRow,
          message: `${hallTicketNo} has a second row for ${subjectCode}. The later row was kept and the earlier one discarded.`,
        });
        rows[existing] = row;
        continue;
      }

      seen.set(key, rows.length);
      rows.push(row);
      acceptedRows += 1;
    }

    reports.push({ name: sheet.name, headerRow: header.index + 1, mappedColumns, dataRows, acceptedRows });
  }

  return { rows, issues, sheets: reports };
}

/** Headline numbers for the pre-commit preview. */
export function summarize(rows: readonly ParsedMarkRow[]) {
  const students = new Set<string>();
  const subjects = new Set<string>();
  const branches = new Set<string>();
  let withDateOfBirth = 0;
  let pass = 0;
  let fail = 0;
  let absent = 0;
  let other = 0;

  for (const row of rows) {
    students.add(row.hallTicketNo);
    subjects.add(row.subjectCode);
    if (row.branch) branches.add(row.branch);
    if (row.dateOfBirth) withDateOfBirth += 1;
    if (row.result === RESULT_PASS) pass += 1;
    else if (row.result === RESULT_FAIL) fail += 1;
    else if (row.result === RESULT_ABSENT) absent += 1;
    else other += 1;
  }

  return {
    totalRows: rows.length,
    students: students.size,
    subjects: subjects.size,
    branches: [...branches].sort(),
    withDateOfBirth,
    pass,
    fail,
    absent,
    other,
  };
}

/**
 * Collapse rows to one identity per student — what `result_students` needs.
 *
 * A student appears on many rows; name, branch and DOB should be identical
 * across them but a sheet may only fill the name on the first line of each
 * block. Taking the first non-null of each field means a partially-filled
 * block still yields a complete identity.
 */
export function extractStudents(rows: readonly ParsedMarkRow[]) {
  const byHallTicket = new Map<
    string,
    { hallTicketNo: string; studentName: string | null; branch: string | null; dateOfBirth: string | null }
  >();

  for (const row of rows) {
    const existing = byHallTicket.get(row.hallTicketNo);
    if (!existing) {
      byHallTicket.set(row.hallTicketNo, {
        hallTicketNo: row.hallTicketNo,
        studentName: row.studentName,
        branch: row.branch,
        dateOfBirth: row.dateOfBirth,
      });
      continue;
    }
    existing.studentName ??= row.studentName;
    existing.branch ??= row.branch;
    existing.dateOfBirth ??= row.dateOfBirth;
  }

  return [...byHallTicket.values()];
}
