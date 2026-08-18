#!/usr/bin/env node
// Generate sample results spreadsheets for testing the results upload.
//
// Solves a chicken-and-egg problem: the results portal cannot be exercised
// without a real .xlsx, and the exam branch's actual sheets contain real
// students' marks and should not live in the repo. This produces synthetic
// files with the exact column layout the importer was built against.
//
//   node scripts/make-sample-results.mjs
//
// Writes two files to ./tmp/ :
//
//   sample-results.xlsx          — the layout from the requirement screenshot:
//                                  S.No, Branch, Hall Ticket No, Subject Code,
//                                  Subject Name, Internal Marks, Grade, Credits,
//                                  Result. NO date-of-birth column, so every
//                                  student lands on the batch fallback DOB.
//
//   sample-results-with-dob.xlsx — the same data plus a Date of Birth column
//                                  and two branch tabs, which is the shape you
//                                  want in production: each student gets their
//                                  own real date instead of a shared one.
//
// Both are fabricated. The hall tickets follow the real 24H41A0xxx pattern so
// the format is representative, but no row corresponds to a real student.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

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

const SUBJECTS = [
  { code: "23BS2T04", name: "Differential Equations & Vector Calculus", credits: 3 },
  { code: "23BS2T05", name: "Engineering Chemistry", credits: 3 },
  { code: "23CE2T01", name: "Engineering Mechanics", credits: 3 },
  { code: "23ES2T04", name: "Engineering Graphics", credits: 2 },
  { code: "23ES2T03", name: "Basic Civil & Mechanical Engineering", credits: 3 },
];

/** Grade bands, in the order a marks percentage falls through them. */
const GRADES = [
  { grade: "O", credits: 1.0 },
  { grade: "A+", credits: 1.0 },
  { grade: "A", credits: 1.0 },
  { grade: "B+", credits: 1.0 },
  { grade: "B", credits: 1.0 },
  { grade: "C", credits: 1.0 },
  { grade: "D", credits: 1.0 },
];

/**
 * Deterministic pseudo-random, seeded per hall ticket + subject.
 *
 * A fixed seed matters: re-running the script must produce the same sheet, so
 * a hall ticket you tested with yesterday still resolves to the same marks
 * today and a diff of the generated file is empty when nothing changed.
 */
function seeded(seed) {
  let state = 0;
  for (let i = 0; i < seed.length; i += 1) state = (state * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function outcomeFor(hallTicket, subject) {
  const random = seeded(`${hallTicket}:${subject.code}`);
  const roll = random();
  const internal = Math.round(12 + random() * 18); // 12-30, as in the screenshot

  if (roll < 0.08) return { internal, grade: "AB", credits: 0.0, result: "Absent" };
  if (roll < 0.42) return { internal, grade: "F", credits: 0.0, result: "Fail" };

  const band = GRADES[Math.floor(random() * GRADES.length)];
  return { internal, grade: band.grade, credits: subject.credits.toFixed(1), result: "Pass" };
}

/** dd-mm-yyyy, the format Indian admission records use — and what the parser reads day-first. */
function dobFor(index) {
  const day = ((index * 7) % 28) + 1;
  const month = ((index * 5) % 12) + 1;
  const year = 2005 + (index % 3);
  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
}

function buildRows({ branch, prefix, count, startSerial = 1, withDob = false }) {
  const rows = [];
  let serial = startSerial;

  for (let student = 1; student <= count; student += 1) {
    const hallTicket = `${prefix}${String(student).padStart(2, "0")}`;
    // Not every student sits every subject — a realistic sheet has ragged
    // blocks, which is also what exercises the importer's per-student grouping.
    const taken = SUBJECTS.slice(0, 3 + (student % 3));

    for (const subject of taken) {
      const { internal, grade, credits, result } = outcomeFor(hallTicket, subject);
      const row = [serial++, branch, hallTicket, subject.code, subject.name, internal, grade, credits, result];
      if (withDob) row.push(dobFor(student));
      rows.push(row);
    }
  }

  return rows;
}

function sheetFrom(rows, withDob) {
  const headers = withDob ? [...HEADERS, "Date of Birth"] : HEADERS;
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((h) => ({ wch: h === "Subject Name" ? 40 : Math.max(12, h.length + 2) }));
  return sheet;
}

const outDir = join(process.cwd(), "tmp");
mkdirSync(outDir, { recursive: true });

// --- File 1: exactly the screenshot's layout, single sheet, no DOB ----------
const plain = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  plain,
  sheetFrom(buildRows({ branch: "CE", prefix: "24H41A01", count: 20 }), false),
  "Results"
);
const plainPath = join(outDir, "sample-results.xlsx");
writeFileSync(plainPath, XLSX.write(plain, { type: "buffer", bookType: "xlsx" }));

// --- File 2: two branch tabs plus a real DOB per student -------------------
const withDob = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  withDob,
  sheetFrom(buildRows({ branch: "CE", prefix: "24H41A01", count: 20, withDob: true }), true),
  "CE"
);
XLSX.utils.book_append_sheet(
  withDob,
  sheetFrom(buildRows({ branch: "CSE", prefix: "24H41A05", count: 20, withDob: true }), true),
  "CSE"
);
const dobPath = join(outDir, "sample-results-with-dob.xlsx");
writeFileSync(dobPath, XLSX.write(withDob, { type: "buffer", bookType: "xlsx" }));

console.log(`Wrote ${plainPath}`);
console.log(`Wrote ${dobPath}\n`);
console.log("Test credentials");
console.log("----------------");
console.log("sample-results.xlsx (no DOB column — uses the batch fallback date):");
console.log("  Hall ticket   24H41A0101   ·   Date of birth: whatever you set as the fallback on upload");
console.log("  Hall ticket   24H41A0105   ·   same fallback date\n");
console.log("sample-results-with-dob.xlsx (each student has their own date):");
for (const student of [1, 2, 5]) {
  const [day, month, year] = dobFor(student).split("-");
  console.log(
    `  Hall ticket   24H41A01${String(student).padStart(2, "0")}   ·   Date of birth ${day}/${month}/${year}`
  );
}
console.log("\nRemember to PUBLISH the batch in /admin/results — drafts deliberately return 'not found'.");
