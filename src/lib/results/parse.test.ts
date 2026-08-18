import { describe, expect, test } from "vitest";

import {
  cellNumber,
  cellText,
  matchColumn,
  normalizeHallTicket,
  parseCredits,
  parseDateOfBirth,
  resolveOutcome,
} from "./columns";
import { extractStudents, findHeaderRow, parseSheets, summarize, type RawSheet } from "./parse";
import { computeSgpa, creditWeightsFrom, gradePointFor } from "./grading";
import type { LookupSubject } from "./types";

/**
 * The exact header row and a representative slice of the sheet this feature was
 * built from, so a regression in column matching shows up against the real file
 * shape rather than an idealised one.
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

const SAMPLE_ROWS: unknown[][] = [
  [1, "CE", "24H41A0101", "23BS2T04", "Differential Equations & Vector Calculus", 16, "F", 0.0, "Fail"],
  [2, "CE", "24H41A0101", "23BS2T05", "Engineering Chemistry", 21, "F", 0.0, "Fail"],
  [3, "CE", "24H41A0101", "23CE2T01", "Engineering Mechanics", 14, "F", 0.0, "Fail"],
  [4, "CE", "24H41A0102", "23BS2T04", "Differential Equations & Vector Calculus", 23, "F", 0.0, "Fail"],
  [5, "CE", "24H41A0103", "23BS2T05", "Engineering Chemistry", 25, "D", 3.0, "Pass"],
  [6, "CE", "24H41A0109", "23BS2T04", "Differential Equations & Vector Calculus", 22, "AB", 0.0, "Absent"],
];

function sheet(rows: unknown[][], name = "Sheet1"): RawSheet[] {
  return [{ name, rows }];
}

describe("matchColumn", () => {
  test("maps every header from the real results sheet", () => {
    expect(HEADERS.map(matchColumn)).toEqual([
      "serial",
      "branch",
      "hallTicket",
      "subjectCode",
      "subjectName",
      "internalMarks",
      "grade",
      "credits",
      "result",
    ]);
  });

  test("tolerates casing, punctuation and spacing variants", () => {
    expect(matchColumn("HALL_TICKET_NO")).toBe("hallTicket");
    expect(matchColumn("  Roll Number  ")).toBe("hallTicket");
    expect(matchColumn("Regd. No.")).toBe("hallTicket");
    expect(matchColumn("SUB CODE")).toBe("subjectCode");
    expect(matchColumn("Name of the Subject")).toBe("subjectName");
  });

  test("binds annotated headers by containment", () => {
    expect(matchColumn("Internal Marks (30)")).toBe("internalMarks");
    expect(matchColumn("External Marks (70)")).toBe("externalMarks");
  });

  test("prefers the most specific alias when several could match", () => {
    // "Total Marks" contains both "marks" and "totalmarks"; the longer wins.
    expect(matchColumn("Total Marks")).toBe("totalMarks");
  });

  test("returns null for headers it does not know", () => {
    expect(matchColumn("Signature of Invigilator")).toBeNull();
    expect(matchColumn("")).toBeNull();
  });
});

describe("cell coercion", () => {
  test("cellText treats the sheet's placeholder dashes as blank", () => {
    expect(cellText("  Engineering  Chemistry ")).toBe("Engineering Chemistry");
    expect(cellText("-")).toBeNull();
    expect(cellText("NA")).toBeNull();
    expect(cellText("   ")).toBeNull();
  });

  test("cellNumber returns null, not zero, for an absent mark", () => {
    // A student who was absent did not score 0 — storing 0 would understate
    // every average they appear in.
    expect(cellNumber("AB")).toBeNull();
    expect(cellNumber("")).toBeNull();
    expect(cellNumber(0)).toBe(0);
    expect(cellNumber("16")).toBe(16);
    expect(cellNumber("23.5")).toBe(23.5);
  });

  test("cellNumber strips a printed denominator", () => {
    expect(cellNumber("18 / 30")).toBe(18);
  });

  test("parseCredits keeps the sheet's 0.0 for a failed subject", () => {
    expect(parseCredits(0.0)).toBe(0);
    expect(parseCredits("3.0")).toBe(3);
    expect(parseCredits("")).toBe(0);
  });

  test("normalizeHallTicket uppercases and strips spaces", () => {
    expect(normalizeHallTicket(" 24h41a0101 ")).toBe("24H41A0101");
    expect(normalizeHallTicket("24 H41 A0101")).toBe("24H41A0101");
  });

  test("normalizeHallTicket rejects a banner cell with no digits", () => {
    expect(normalizeHallTicket("CIVIL ENGINEERING")).toBeNull();
    expect(normalizeHallTicket("")).toBeNull();
  });
});

describe("resolveOutcome", () => {
  test("uses the explicit Result column when the sheet has one", () => {
    expect(resolveOutcome("Fail", "F")).toBe("fail");
    expect(resolveOutcome("Pass", "D")).toBe("pass");
    expect(resolveOutcome("Absent", "AB")).toBe("absent");
  });

  test("derives the outcome from the grade when there is no Result column", () => {
    expect(resolveOutcome(null, "F")).toBe("fail");
    expect(resolveOutcome(null, "AB")).toBe("absent");
    expect(resolveOutcome(null, "B")).toBe("pass");
    expect(resolveOutcome(null, "O")).toBe("pass");
  });

  test("passes an unrecognised university status through rather than dropping it", () => {
    expect(resolveOutcome("MALPRACTICE", "F")).toBe("withheld");
    expect(resolveOutcome("Detained", null)).toBe("withheld");
    expect(resolveOutcome("Provisional", null)).toBe("provisional");
  });

  test("is null when there is nothing to go on", () => {
    expect(resolveOutcome(null, null)).toBeNull();
  });
});

describe("parseDateOfBirth", () => {
  test("reads slash and dash dates day-first, as Indian forms are written", () => {
    expect(parseDateOfBirth("03/04/2005")).toBe("2005-04-03");
    expect(parseDateOfBirth("15-08-2006")).toBe("2006-08-15");
    expect(parseDateOfBirth("15.08.2006")).toBe("2006-08-15");
  });

  test("reads ISO dates year-first", () => {
    expect(parseDateOfBirth("2005-04-03")).toBe("2005-04-03");
  });

  test("expands two-digit years into the right century", () => {
    expect(parseDateOfBirth("15-08-06")).toBe("2006-08-15");
    expect(parseDateOfBirth("15-08-88")).toBe("1988-08-15");
  });

  test("converts an Excel serial number", () => {
    // 38445 is 2005-04-03 on Excel's 1900 date system.
    expect(parseDateOfBirth(38445)).toBe("2005-04-03");
  });

  test("accepts a Date object from a date-formatted cell", () => {
    expect(parseDateOfBirth(new Date(2005, 3, 3))).toBe("2005-04-03");
  });

  test("rejects impossible and unparseable dates", () => {
    expect(parseDateOfBirth("31/02/2005")).toBeNull();
    expect(parseDateOfBirth("not a date")).toBeNull();
    expect(parseDateOfBirth(12)).toBeNull();
    expect(parseDateOfBirth(null)).toBeNull();
  });
});

describe("findHeaderRow", () => {
  test("finds the header under a college banner and a blank line", () => {
    const rows = [
      ["BHARAT VIDYAPEETH COLLEGE OF ENGINEERING", null, null],
      ["I B.Tech II Semester Regular Examinations, Nov 2024", null, null],
      [],
      HEADERS,
      ...SAMPLE_ROWS,
    ];
    expect(findHeaderRow(rows)?.index).toBe(3);
  });

  test("returns null when no row identifies a hall ticket column", () => {
    expect(findHeaderRow([["Name", "Marks"], ["A", 1]])).toBeNull();
  });
});

describe("parseSheets", () => {
  test("parses the real sheet shape end to end", () => {
    const { rows, issues } = parseSheets(sheet([HEADERS, ...SAMPLE_ROWS]));

    expect(issues).toEqual([]);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({
      hallTicketNo: "24H41A0101",
      branch: "CE",
      subjectCode: "23BS2T04",
      subjectName: "Differential Equations & Vector Calculus",
      internalMarks: 16,
      grade: "F",
      credits: 0,
      result: "fail",
      dateOfBirth: null,
    });
    expect(rows[4]).toMatchObject({ hallTicketNo: "24H41A0103", grade: "D", credits: 3, result: "pass" });
    expect(rows[5]).toMatchObject({ grade: "AB", result: "absent" });
  });

  test("reports the Excel row number an operator can actually find", () => {
    // Header on sheet row 1, so the first data row is sheet row 2.
    const { rows } = parseSheets(sheet([HEADERS, ...SAMPLE_ROWS]));
    expect(rows[0].sourceRow).toBe(2);
    expect(rows[5].sourceRow).toBe(7);
  });

  test("skips blank rows without treating them as errors", () => {
    const { rows, issues } = parseSheets(sheet([HEADERS, SAMPLE_ROWS[0], [], [null, null], SAMPLE_ROWS[1]]));
    expect(rows).toHaveLength(2);
    expect(issues).toEqual([]);
  });

  test("skips a repeated header where two sheets were concatenated", () => {
    const { rows, issues } = parseSheets(sheet([HEADERS, SAMPLE_ROWS[0], HEADERS, SAMPLE_ROWS[1]]));
    expect(rows).toHaveLength(2);
    expect(issues).toEqual([]);
  });

  test("skips a row with no hall ticket and says which row it was", () => {
    const { rows, issues } = parseSheets(sheet([HEADERS, [7, "CE", "", "23BS2T04", "Maths", 16, "F", 0, "Fail"]]));
    expect(rows).toHaveLength(0);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ row: 2, sheet: "Sheet1" });
    expect(issues[0].message).toContain("hall ticket");
  });

  test("de-duplicates a repeated subject line, keeping the later correction", () => {
    const corrected = [9, "CE", "24H41A0101", "23BS2T04", "Differential Equations", 28, "B", 3.0, "Pass"];
    const { rows, issues } = parseSheets(sheet([HEADERS, SAMPLE_ROWS[0], corrected]));

    // Postgres rejects an upsert payload containing the same conflict key
    // twice, so this has to collapse here or the whole upload fails.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ grade: "B", credits: 3, result: "pass" });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("second row");
  });

  test("reads every sheet in the workbook, not just the first", () => {
    const civil: RawSheet = { name: "CE", rows: [HEADERS, SAMPLE_ROWS[0]] };
    const mech: RawSheet = {
      name: "ME",
      rows: [HEADERS, [1, "ME", "24H41A0301", "23ME2T01", "Thermodynamics", 20, "C", 3.0, "Pass"]],
    };
    const { rows, sheets } = parseSheets([civil, mech]);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.branch)).toEqual(["CE", "ME"]);
    expect(sheets.map((s) => s.name)).toEqual(["CE", "ME"]);
    expect(sheets[1]).toMatchObject({ headerRow: 1, acceptedRows: 1 });
  });

  test("flags a sheet with content but no recognisable header", () => {
    const { rows, issues } = parseSheets(sheet([["Attendance Register"], ["Name", "Days"], ["Asha", 30]]));
    expect(rows).toHaveLength(0);
    expect(issues[0].message).toContain("No header row found");
  });

  test("stays quiet about a genuinely empty tab", () => {
    const { issues } = parseSheets(sheet([[], [null]], "Sheet3"));
    expect(issues).toEqual([]);
  });

  test("computes a total only when both components are present", () => {
    const headers = ["Hall Ticket No", "Subject Code", "Subject Name", "Internal Marks", "External Marks", "Grade"];
    const { rows } = parseSheets(
      sheet([
        headers,
        ["24H41A0101", "23BS2T04", "Maths", 20, 45, "B"],
        ["24H41A0102", "23BS2T04", "Maths", 20, "AB", "AB"],
      ])
    );
    expect(rows[0].totalMarks).toBe(65);
    // Internal-only must not be published as a "total" — it would look like a
    // catastrophic external mark rather than an absence.
    expect(rows[1].totalMarks).toBeNull();
  });

  test("derives a subject code when the sheet only prints subject names", () => {
    const headers = ["Hall Ticket No", "Subject Name", "Grade", "Credits", "Result"];
    const { rows } = parseSheets(sheet([headers, ["24H41A0101", "Engineering Chemistry", "D", 3, "Pass"]]));
    expect(rows[0].subjectCode).toBe("ENGINEERING-CHEMISTRY");
    expect(rows[0].subjectName).toBe("Engineering Chemistry");
  });
});

describe("summarize", () => {
  test("counts students, subjects and outcomes across the batch", () => {
    const { rows } = parseSheets(sheet([HEADERS, ...SAMPLE_ROWS]));
    expect(summarize(rows)).toMatchObject({
      totalRows: 6,
      students: 4,
      subjects: 3,
      branches: ["CE"],
      withDateOfBirth: 0,
      pass: 1,
      fail: 4,
      absent: 1,
      other: 0,
    });
  });
});

describe("extractStudents", () => {
  test("collapses many subject rows into one identity per hall ticket", () => {
    const { rows } = parseSheets(sheet([HEADERS, ...SAMPLE_ROWS]));
    const students = extractStudents(rows);
    expect(students).toHaveLength(4);
    expect(students[0]).toMatchObject({ hallTicketNo: "24H41A0101", branch: "CE", dateOfBirth: null });
  });

  test("fills each field from the first row that carries it", () => {
    const headers = ["Hall Ticket No", "Student Name", "Date of Birth", "Subject Code", "Subject Name", "Grade"];
    const { rows } = parseSheets(
      sheet([
        headers,
        // Sheets commonly fill the name only on a student's first line.
        ["24H41A0101", "M. Sai Tarun", "03/04/2005", "23BS2T04", "Maths", "B"],
        ["24H41A0101", "", "", "23BS2T05", "Chemistry", "C"],
      ])
    );
    const [student] = extractStudents(rows);
    expect(student).toMatchObject({
      hallTicketNo: "24H41A0101",
      studentName: "M. Sai Tarun",
      dateOfBirth: "2005-04-03",
    });
  });
});

describe("grading", () => {
  test("maps letter grades onto the 10-point scale", () => {
    expect(gradePointFor("O")).toBe(10);
    expect(gradePointFor("A+")).toBe(9);
    expect(gradePointFor("b")).toBe(6);
    expect(gradePointFor("F")).toBe(0);
    expect(gradePointFor("AB")).toBe(0);
  });

  test("returns null for a grade it does not recognise", () => {
    expect(gradePointFor("XYZ")).toBeNull();
    expect(gradePointFor(null)).toBeNull();
  });

  function subject(partial: Partial<LookupSubject>): LookupSubject {
    return {
      subjectCode: "S1",
      subjectName: "Subject",
      internalMarks: null,
      externalMarks: null,
      totalMarks: null,
      grade: "B",
      credits: 3,
      result: "pass",
      ...partial,
    };
  }

  test("computes a credit-weighted SGPA", () => {
    const result = computeSgpa([
      subject({ subjectCode: "A", grade: "O", credits: 4 }), // 40
      subject({ subjectCode: "B", grade: "B", credits: 3 }), // 18
    ]);
    expect(result.sgpa).toBeCloseTo(58 / 7, 5);
    expect(result.creditsEarned).toBe(7);
    expect(result.backlogs).toBe(0);
  });

  test("keeps a failed subject in the denominator using its real credit weight", () => {
    // The sheet zeroes credits on a failure. Dropping it from the denominator
    // would inflate exactly the SGPAs that most need to be accurate.
    const weights = creditWeightsFrom([
      { subjectCode: "A", credits: 3 },
      { subjectCode: "B", credits: 3 },
    ]);
    const result = computeSgpa(
      [
        subject({ subjectCode: "A", grade: "O", credits: 3 }), // 30
        subject({ subjectCode: "B", grade: "F", credits: 0, result: "fail" }), // 0
      ],
      weights
    );
    expect(result.sgpa).toBeCloseTo(5, 5);
    expect(result.creditsAttempted).toBe(6);
    expect(result.backlogs).toBe(1);
  });

  test("suppresses SGPA rather than computing it from part of the subjects", () => {
    const result = computeSgpa([
      subject({ subjectCode: "A", grade: "O", credits: 4 }),
      subject({ subjectCode: "B", grade: "ZZ", credits: 3 }),
    ]);
    expect(result.sgpa).toBeNull();
  });

  test("counts absent and withheld subjects as backlogs", () => {
    const result = computeSgpa([
      subject({ subjectCode: "A", grade: "AB", credits: 0, result: "absent" }),
      subject({ subjectCode: "B", grade: "F", credits: 0, result: "withheld" }),
    ]);
    expect(result.backlogs).toBe(2);
  });

  test("creditWeightsFrom ignores the zeroed credits of failed rows", () => {
    const weights = creditWeightsFrom([
      { subjectCode: "A", credits: 0 },
      { subjectCode: "A", credits: 3 },
    ]);
    expect(weights.get("A")).toBe(3);
  });
});
