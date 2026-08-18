// Excel parsing for the certificate generator.
//
// Uses the `xlsx` package (already a project dependency) to extract student
// rows from an uploaded .xlsx or .xls file. Column matching is flexible:
// "Name", "Student Name", "STUDENT_NAME" all resolve to the name field.

import * as XLSX from "xlsx";
import type { ExcelRow } from "./cert-types";

/** Normalise a header string so "Student Name", "STUDENT_NAME" etc. all match. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const NAME_ALIASES = new Set(["name", "studentname", "fullname", "candidatename"]);
const ROLL_ALIASES = new Set(["rollnumber", "rollno", "regno", "regnumber", "registrationnumber", "regno", "htno", "hallticketno", "hallticket"]);
const BRANCH_ALIASES = new Set(["branch", "department", "dept", "course", "program", "programme", "stream"]);

export interface ParseResult {
  ok: true;
  rows: ExcelRow[];
  columns: string[];
  nameCol: string;
  rollCol: string;
  branchCol: string;
}

export interface ParseError {
  ok: false;
  error: string;
}

/**
 * Parses an Excel file and returns student rows.
 *
 * @param file  The File object from an `<input type="file">`.
 * @param overrides  Optional manual column-name overrides when auto-detect fails.
 */
export async function parseExcelFile(
  file: File,
  overrides?: { nameCol?: string; rollCol?: string; branchCol?: string },
): Promise<ParseResult | ParseError> {
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return { ok: false, error: "Could not read the file." };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array" });
  } catch {
    return { ok: false, error: "This does not look like a valid Excel file." };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { ok: false, error: "The workbook has no sheets." };

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (rawRows.length === 0) return { ok: false, error: "The sheet is empty." };

  const columns = Object.keys(rawRows[0]);
  if (columns.length === 0) return { ok: false, error: "No columns found." };

  // Auto-detect or use overrides
  const nameCol = overrides?.nameCol ?? columns.find((c) => NAME_ALIASES.has(norm(c)));
  const rollCol = overrides?.rollCol ?? columns.find((c) => ROLL_ALIASES.has(norm(c)));
  const branchCol = overrides?.branchCol ?? columns.find((c) => BRANCH_ALIASES.has(norm(c)));

  if (!nameCol) return { ok: false, error: `Could not find a "Name" column. Available columns: ${columns.join(", ")}` };
  if (!rollCol) return { ok: false, error: `Could not find a "Roll Number" column. Available columns: ${columns.join(", ")}` };
  if (!branchCol) return { ok: false, error: `Could not find a "Branch" column. Available columns: ${columns.join(", ")}` };

  const rows: ExcelRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const name = String(raw[nameCol] ?? "").trim();
    const rollNumber = String(raw[rollCol] ?? "").trim();
    const branch = String(raw[branchCol] ?? "").trim();

    if (!name) {
      errors.push(`Row ${i + 2}: missing name`);
      continue;
    }
    if (!rollNumber) {
      errors.push(`Row ${i + 2}: missing roll number`);
      continue;
    }

    // Build the row with all extra columns available for template use
    const row: ExcelRow = { name, rollNumber, branch };
    for (const col of columns) {
      if (col !== nameCol && col !== rollCol && col !== branchCol) {
        row[col] = String(raw[col] ?? "").trim();
      }
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    return { ok: false, error: `No valid rows found. Issues:\n${errors.slice(0, 5).join("\n")}` };
  }

  return { ok: true, rows, columns, nameCol, rollCol, branchCol };
}
