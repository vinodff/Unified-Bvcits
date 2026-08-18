import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeHallTicket } from "./columns";
import { computeSgpa } from "./grading";
import type { LookupBatch, LookupResponse, LookupSubject } from "./types";

/**
 * The public results lookup: hall ticket + date of birth -> that student's
 * published results, and nothing else.
 *
 * Runs on the service-role client because `anon` has no grant on any results
 * table (0010_results_portal.sql). That inversion is deliberate — instead of
 * exposing a queryable table to the browser and trying to constrain it with
 * RLS, the browser gets one function that takes two values and returns one
 * student. There is no filter to widen, no column to add, no pagination to
 * walk.
 *
 * The caller is responsible for rate limiting and for logging failures; this
 * module answers the question and nothing more.
 */

/** Distinguishable failure reasons, for the caller's log — never for the user. */
export type LookupFailure = "invalid-hall-ticket" | "no-match" | "no-published-results";

export type LookupOutcome =
  | { ok: true; data: LookupResponse }
  | { ok: false; reason: LookupFailure };

interface MarkRow {
  subject_code: string;
  subject_name: string;
  internal_marks: number | string | null;
  external_marks: number | string | null;
  total_marks: number | string | null;
  grade: string | null;
  credits: number | string | null;
  result: string | null;
  result_batches: BatchRow | BatchRow[] | null;
}

interface BatchRow {
  id: string;
  title: string;
  academic_year: string | null;
  semester: string | null;
  exam_type: string | null;
  published_at: string | null;
  subject_credits: Record<string, number> | null;
}

/** PostgREST returns numerics as strings; every numeric read goes through this. */
function num(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function lookupResults(
  supabase: SupabaseClient,
  rawHallTicket: string,
  dateOfBirth: string
): Promise<LookupOutcome> {
  // Normalised with the SAME function the importer used, so a student typing
  // lowercase or with a stray space matches the row that was imported.
  const hallTicketNo = normalizeHallTicket(rawHallTicket);
  if (!hallTicketNo) return { ok: false, reason: "invalid-hall-ticket" };

  const { data: student, error: studentError } = await supabase
    .from("result_students")
    .select("hall_ticket_no, student_name, branch")
    .eq("hall_ticket_no", hallTicketNo)
    // The DOB is matched in the WHERE clause rather than fetched and compared
    // in JS: the date never enters the application's memory, so it cannot end
    // up in a log line, an error message or a serialized payload by accident.
    .eq("date_of_birth", dateOfBirth)
    .maybeSingle();

  if (studentError) throw new Error(`Results lookup failed: ${studentError.message}`);
  if (!student) return { ok: false, reason: "no-match" };

  const { data, error } = await supabase
    .from("result_marks")
    .select(
      "subject_code, subject_name, internal_marks, external_marks, total_marks, grade, credits, result, " +
        "result_batches!inner(id, title, academic_year, semester, exam_type, published_at, subject_credits)"
    )
    .eq("hall_ticket_no", hallTicketNo)
    // `!inner` above plus this filter is what enforces draft invisibility. A
    // batch an admin has uploaded but not published resolves to nothing here,
    // so a mistaken upload never reaches a student.
    .eq("result_batches.status", "published")
    .order("subject_code", { ascending: true });

  if (error) throw new Error(`Results lookup failed: ${error.message}`);

  const rows = (data ?? []) as unknown as MarkRow[];
  if (rows.length === 0) return { ok: false, reason: "no-published-results" };

  const batches = new Map<string, { batch: BatchRow; subjects: LookupSubject[] }>();
  for (const row of rows) {
    const batch = one(row.result_batches);
    if (!batch) continue;

    const entry = batches.get(batch.id) ?? { batch, subjects: [] };
    entry.subjects.push({
      subjectCode: row.subject_code,
      subjectName: row.subject_name,
      internalMarks: num(row.internal_marks),
      externalMarks: num(row.external_marks),
      totalMarks: num(row.total_marks),
      grade: row.grade,
      credits: num(row.credits) ?? 0,
      result: row.result,
    });
    batches.set(batch.id, entry);
  }

  const resolved: LookupBatch[] = [...batches.values()].map(({ batch, subjects }) => {
    const weights = new Map<string, number>(Object.entries(batch.subject_credits ?? {}).map(([k, v]) => [k, Number(v)]));
    const { sgpa, creditsEarned, creditsAttempted, backlogs } = computeSgpa(subjects, weights);

    return {
      id: batch.id,
      title: batch.title,
      academicYear: batch.academic_year,
      semester: batch.semester,
      examType: batch.exam_type,
      publishedAt: batch.published_at,
      subjects,
      sgpa,
      creditsEarned,
      creditsAttempted,
      backlogs,
    };
  });

  // Newest notification first. Batches without a publish timestamp sort last
  // rather than being dropped — they are published (the query proved it) and a
  // missing timestamp should never hide a student's marks.
  resolved.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

  return {
    ok: true,
    data: {
      hallTicketNo: student.hall_ticket_no as string,
      studentName: (student.student_name as string | null) ?? null,
      branch: (student.branch as string | null) ?? null,
      batches: resolved,
    },
  };
}
