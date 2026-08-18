import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";

import { hasAcceptedExtension, parseWorkbook, readWorkbook } from "./workbook";
import { summarize } from "./parse";

/**
 * End-to-end over a REAL .xlsx, not a hand-built matrix.
 *
 * `parse.test.ts` covers the rules; this covers the layer where they meet
 * SheetJS — cell types, date handling, multi-tab workbooks and blank-row
 * alignment. Those are exactly the things a matrix fixture cannot catch, and
 * exactly what breaks when a spreadsheet library is upgraded.
 */

const HEADERS = [
  "S.No",
  "Branch",
  "Hall Ticket No",
  "Subject Code",
  "Subject Name",
  "Internal Marks",
  "Grade",
  "Credits",
  "Result",
];

function workbookOf(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return buffer;
}

describe("hasAcceptedExtension", () => {
  test("accepts the spreadsheet formats an exam branch actually sends", () => {
    expect(hasAcceptedExtension("I BTech II Sem Results.xlsx")).toBe(true);
    expect(hasAcceptedExtension("results.XLS")).toBe(true);
    expect(hasAcceptedExtension("results.csv")).toBe(true);
  });

  test("rejects everything else", () => {
    expect(hasAcceptedExtension("results.pdf")).toBe(false);
    expect(hasAcceptedExtension("results.xlsx.exe")).toBe(false);
    expect(hasAcceptedExtension("results")).toBe(false);
  });
});

describe("readWorkbook", () => {
  test("keeps row indices aligned with the row numbers Excel shows", () => {
    // A banner, a blank line, then the header. The error messages the admin
    // sees quote these numbers, so the alignment is load-bearing.
    const sheets = readWorkbook(
      workbookOf({
        Results: [["BVCITS"], [], HEADERS, [1, "CE", "24H41A0101", "23BS2T04", "Maths", 16, "F", 0, "Fail"]],
      })
    );
    expect(sheets).toHaveLength(1);
    expect(sheets[0].rows).toHaveLength(4);
    expect(sheets[0].rows[2][0]).toBe("S.No");
  });
});

describe("parseWorkbook", () => {
  test("parses a real workbook shaped like the exam branch's sheet", () => {
    const buffer = workbookOf({
      Results: [
        ["BHARAT VIDYAPEETH COLLEGE OF ENGINEERING"],
        ["I B.Tech II Semester Regular Examinations"],
        [],
        HEADERS,
        [1, "CE", "24H41A0101", "23BS2T04", "Differential Equations & Vector Calculus", 16, "F", 0.0, "Fail"],
        [2, "CE", "24H41A0101", "23BS2T05", "Engineering Chemistry", 21, "F", 0.0, "Fail"],
        [3, "CE", "24H41A0103", "23BS2T05", "Engineering Chemistry", 25, "D", 3.0, "Pass"],
        [4, "CE", "24H41A0109", "23BS2T04", "Differential Equations & Vector Calculus", 22, "AB", 0.0, "Absent"],
      ],
    });

    const { rows, issues, sheets } = parseWorkbook(buffer);

    expect(issues).toEqual([]);
    expect(rows).toHaveLength(4);
    expect(sheets[0].headerRow).toBe(4);
    expect(rows[0]).toMatchObject({
      hallTicketNo: "24H41A0101",
      subjectCode: "23BS2T04",
      internalMarks: 16,
      grade: "F",
      credits: 0,
      result: "fail",
      sourceRow: 5,
    });
    expect(summarize(rows)).toMatchObject({ students: 3, subjects: 2, pass: 1, fail: 2, absent: 1 });
  });

  test("imports every branch tab in a multi-sheet workbook", () => {
    // Silently importing only the first tab would be the worst failure mode:
    // a successful-looking upload missing most of the college.
    const buffer = workbookOf({
      CE: [HEADERS, [1, "CE", "24H41A0101", "23CE2T01", "Mechanics", 14, "F", 0.0, "Fail"]],
      CSE: [HEADERS, [1, "CSE", "24H41A0501", "23CS2T01", "Data Structures", 26, "B", 3.0, "Pass"]],
      MECH: [HEADERS, [1, "ME", "24H41A0301", "23ME2T01", "Thermodynamics", 24, "C", 3.0, "Pass"]],
    });

    const { rows, sheets } = parseWorkbook(buffer);
    expect(sheets.map((s) => s.name)).toEqual(["CE", "CSE", "MECH"]);
    expect(rows).toHaveLength(3);
    expect(summarize(rows).branches).toEqual(["CE", "CSE", "ME"]);
  });

  test("reads a date-formatted DOB cell as a real date", () => {
    const headers = [...HEADERS, "Date of Birth"];
    const buffer = workbookOf({
      Results: [
        headers,
        [1, "CE", "24H41A0101", "23BS2T04", "Maths", 16, "B", 3.0, "Pass", new Date(Date.UTC(2005, 3, 3))],
      ],
    });

    const { rows } = parseWorkbook(buffer);
    expect(rows[0].dateOfBirth).toBe("2005-04-03");
  });

  test("reads a text DOB day-first, as Indian records are written", () => {
    const headers = [...HEADERS, "DOB"];
    const buffer = workbookOf({
      Results: [headers, [1, "CE", "24H41A0101", "23BS2T04", "Maths", 16, "B", 3.0, "Pass", "03/04/2005"]],
    });

    expect(parseWorkbook(buffer).rows[0].dateOfBirth).toBe("2005-04-03");
  });

  test("reports a file that is a spreadsheet but not a results sheet", () => {
    const buffer = workbookOf({ Sheet1: [["Name", "Attendance"], ["Asha", "92%"]] });
    const { rows, issues } = parseWorkbook(buffer);
    expect(rows).toHaveLength(0);
    expect(issues[0].message).toContain("No header row found");
  });

  test("parses a CSV, which SheetJS reads through the same path", () => {
    const csv = [
      "S.No,Branch,Hall Ticket No,Subject Code,Subject Name,Internal Marks,Grade,Credits,Result",
      "1,CE,24H41A0101,23BS2T04,Differential Equations,16,F,0.0,Fail",
    ].join("\n");

    const { rows } = parseWorkbook(new TextEncoder().encode(csv).buffer as ArrayBuffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ hallTicketNo: "24H41A0101", grade: "F", result: "fail" });
  });
});
