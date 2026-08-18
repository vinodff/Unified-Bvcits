/**
 * The `xlsx` adapter: bytes in, `RawSheet[]` out.
 *
 * Kept to one thin file so the parsing rules in `parse.ts` and `columns.ts`
 * stay free of SheetJS types and can be tested with plain arrays. This is also
 * the only module that has to change if the spreadsheet library is ever swapped.
 */

import * as XLSX from "xlsx";
import { parseSheets, type RawSheet } from "./parse";
import type { ParsedWorkbook } from "./types";

/** Upload ceiling. A semester-wide results sheet is a few hundred KB at most. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/** Extensions the importer accepts, for the file input and for validation. */
export const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".csv"] as const;

export function hasAcceptedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Every sheet in the workbook, as rows of raw cell values.
 *
 * ALL sheets are read, not just the first. Exam sections routinely publish one
 * tab per branch in a single file, and silently importing only "CE" out of
 * four tabs would be the worst possible failure — a successful-looking upload
 * that is missing three quarters of the students.
 *
 * `cellDates` gives real `Date` objects for date-formatted cells, and `raw`
 * keeps numbers as numbers, so `columns.ts` never has to un-format a locale
 * string. `blankrows` stays on so array indices line up with the row numbers
 * the operator sees in Excel — that alignment is what makes the error list
 * ("row 47") actionable.
 */
export function readWorkbook(data: ArrayBuffer): RawSheet[] {
  const workbook = XLSX.read(new Uint8Array(data), {
    type: "array",
    cellDates: true,
    // Formulas are irrelevant here and computing them on an untrusted file is
    // needless work; only the cached values matter.
    cellFormula: false,
    cellHTML: false,
  });

  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows = sheet
      ? (XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          raw: true,
          blankrows: true,
          defval: null,
        }) as unknown[][])
      : [];
    return { name, rows };
  });
}

/** Read and parse in one step — what the import route calls. */
export function parseWorkbook(data: ArrayBuffer): ParsedWorkbook {
  return parseSheets(readWorkbook(data));
}
