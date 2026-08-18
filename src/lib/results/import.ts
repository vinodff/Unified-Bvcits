import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { creditWeightsFrom } from "./grading";
import { extractStudents, summarize } from "./parse";
import type { ImportSummary, ParseIssue, ParsedMarkRow } from "./types";

/**
 * Persisting a parsed sheet.
 *
 * Every write here runs on the SERVICE-ROLE client. `0010_results_portal.sql`
 * grants `authenticated` select only, so this is the sole path that can write
 * results — which is the point: an admin's browser session cannot mutate
 * published marks even if a future client component tried.
 *
 * The caller MUST have checked `results.publish` before getting here. This
 * module performs no authorization of its own.
 */

/**
 * Rows per round trip.
 *
 * Supabase's PostgREST rejects very large request bodies, and a semester sheet
 * runs to tens of thousands of rows, so the insert is chunked. 500 keeps each
 * body comfortably small while holding the round-trip count sane for a
 * 30,000-row upload (60 requests).
 */
const CHUNK_SIZE = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface ImportRequest {
  title: string;
  academicYear: string | null;
  semester: string | null;
  examType: string | null;
  sourceFilename: string;
  /**
   * DOB given to hall tickets this sheet introduces that carry no date of birth
   * — see the `default_dob` comment in 0010_results_portal.sql. ISO `yyyy-mm-dd`.
   */
  defaultDob: string;
  uploadedBy: string | null;
  notes: string | null;
}

export interface ImportOutcome {
  batchId: string;
  summary: ImportSummary;
  issues: ParseIssue[];
  /** Hall tickets seen for the first time by this upload. */
  newStudents: number;
  /** Existing students whose real DOB arrived in this sheet. */
  dobFromSheet: number;
  /** Students still signing in with the shared placeholder DOB. */
  placeholderStudents: number;
  /** A few real hall tickets, so an operator can immediately test the lookup. */
  sampleHallTickets: string[];
}

/** A student identity as it will be written, with the DOB decision already made. */
interface ResolvedStudent {
  hall_ticket_no: string;
  student_name: string | null;
  branch: string | null;
  date_of_birth: string;
  dob_source: "sheet" | "placeholder";
}

/**
 * Import a parsed sheet as a new DRAFT batch.
 *
 * Draft, always — never published on upload. Publishing is a separate, explicit
 * action, so dragging in the wrong file is a recoverable mistake rather than an
 * instant notification to every student in the college.
 *
 * If any step fails the batch is deleted, which cascades to its marks. Student
 * identity rows are intentionally NOT rolled back: a hall ticket's date of
 * birth is a fact about the student, not about this upload, and keeping it
 * makes the retry cheaper without making anything visible (marks are gone, and
 * an identity alone resolves to no results).
 */
export async function importResultBatch(
  supabase: SupabaseClient,
  request: ImportRequest,
  rows: readonly ParsedMarkRow[],
  issues: readonly ParseIssue[]
): Promise<ImportOutcome> {
  if (rows.length === 0) {
    throw new Error("The sheet produced no usable rows, so there is nothing to import.");
  }

  const summary = summarize(rows);

  const { data: batch, error: batchError } = await supabase
    .from("result_batches")
    .insert({
      title: request.title,
      academic_year: request.academicYear,
      semester: request.semester,
      exam_type: request.examType,
      source_filename: request.sourceFilename,
      status: "draft",
      default_dob: request.defaultDob,
      uploaded_by: request.uploadedBy,
      notes: request.notes,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(`Could not create the results batch: ${batchError?.message ?? "unknown error"}`);
  }

  const batchId = batch.id as string;

  try {
    const outcome = await writeBatchContents(supabase, batchId, request, rows);
    return { batchId, summary, issues: [...issues], ...outcome };
  } catch (error) {
    // Leave nothing half-imported behind for an admin to puzzle over.
    await supabase.from("result_batches").delete().eq("id", batchId);
    throw error;
  }
}

async function writeBatchContents(
  supabase: SupabaseClient,
  batchId: string,
  request: ImportRequest,
  rows: readonly ParsedMarkRow[]
): Promise<Omit<ImportOutcome, "batchId" | "summary" | "issues">> {
  const parsedStudents = extractStudents(rows);

  // Which of these hall tickets already have an identity — and crucially,
  // whether the DOB on file is real or a placeholder. Fetched before writing
  // so a placeholder can never overwrite a date of birth we already trust.
  const existing = new Map<string, { dobSource: string }>();
  for (const group of chunk(parsedStudents.map((s) => s.hallTicketNo), CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("result_students")
      .select("hall_ticket_no, dob_source")
      .in("hall_ticket_no", group);
    if (error) throw new Error(`Could not read existing students: ${error.message}`);
    for (const row of data ?? []) existing.set(row.hall_ticket_no as string, { dobSource: row.dob_source as string });
  }

  const toWrite: ResolvedStudent[] = [];
  let newStudents = 0;
  let dobFromSheet = 0;
  let placeholderStudents = 0;

  for (const student of parsedStudents) {
    const known = existing.get(student.hallTicketNo);
    if (!known) newStudents += 1;

    if (student.dateOfBirth) {
      // A real DOB from the sheet always wins — it upgrades a placeholder and
      // corrects an earlier sheet's typo.
      dobFromSheet += 1;
      toWrite.push({
        hall_ticket_no: student.hallTicketNo,
        student_name: student.studentName,
        branch: student.branch,
        date_of_birth: student.dateOfBirth,
        dob_source: "sheet",
      });
      continue;
    }

    if (!known) {
      placeholderStudents += 1;
      toWrite.push({
        hall_ticket_no: student.hallTicketNo,
        student_name: student.studentName,
        branch: student.branch,
        date_of_birth: request.defaultDob,
        dob_source: "placeholder",
      });
      continue;
    }

    if (known.dobSource === "placeholder") placeholderStudents += 1;

    // Known student, no DOB in this sheet: refresh the name/branch but leave
    // the date of birth alone. Overwriting it with this batch's default would
    // silently break a student who could already sign in.
    const { error } = await updateStudentDetailsOnly(supabase, student);
    if (error) throw new Error(`Could not update ${student.hallTicketNo}: ${error}`);
  }

  for (const group of chunk(toWrite, CHUNK_SIZE)) {
    const { error } = await supabase.from("result_students").upsert(group, { onConflict: "hall_ticket_no" });
    if (error) throw new Error(`Could not save student records: ${error.message}`);
  }

  const markRows = rows.map((row) => ({
    batch_id: batchId,
    hall_ticket_no: row.hallTicketNo,
    branch: row.branch,
    subject_code: row.subjectCode,
    subject_name: row.subjectName,
    internal_marks: row.internalMarks,
    external_marks: row.externalMarks,
    total_marks: row.totalMarks,
    grade: row.grade,
    credits: row.credits,
    result: row.result,
    source_row: row.sourceRow,
  }));

  for (const group of chunk(markRows, CHUNK_SIZE)) {
    // Upsert, not insert: re-running the same file over an existing batch id
    // would otherwise collide on the unique key. The parser has already
    // guaranteed no duplicate conflict key WITHIN this payload.
    const { error } = await supabase
      .from("result_marks")
      .upsert(group, { onConflict: "batch_id,hall_ticket_no,subject_code" });
    if (error) throw new Error(`Could not save results (row ${group[0]?.source_row ?? "?"}): ${error.message}`);
  }

  const { error: countError } = await supabase
    .from("result_batches")
    .update({
      row_count: rows.length,
      student_count: parsedStudents.length,
      // Computed here, once, because a failed row's zeroed credits hide the
      // subject's real weight from the student who most needs it in their SGPA.
      subject_credits: Object.fromEntries(creditWeightsFrom(rows)),
    })
    .eq("id", batchId);
  if (countError) throw new Error(`Could not finalise the batch: ${countError.message}`);

  return {
    newStudents,
    dobFromSheet,
    placeholderStudents,
    sampleHallTickets: parsedStudents.slice(0, 3).map((s) => s.hallTicketNo),
  };
}

async function updateStudentDetailsOnly(
  supabase: SupabaseClient,
  student: { hallTicketNo: string; studentName: string | null; branch: string | null }
): Promise<{ error: string | null }> {
  const patch: Record<string, string> = {};
  if (student.studentName) patch.student_name = student.studentName;
  if (student.branch) patch.branch = student.branch;
  if (Object.keys(patch).length === 0) return { error: null };

  const { error } = await supabase.from("result_students").update(patch).eq("hall_ticket_no", student.hallTicketNo);
  return { error: error?.message ?? null };
}
