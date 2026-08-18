"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/auth/server";
import { resolveClassRoster } from "../roster";
import { gradeFromMarks } from "./grading";

export interface ResultsFormState {
  error: string | null;
  message: string | null;
}

/**
 * Save (draft) or save-and-publish a subject's marks for one semester.
 *
 * Grade, grade point and pass/fail are computed from the marks here — see
 * grading.ts — rather than typed in by faculty, so a subject's grade can never
 * disagree with the marks that produced it.
 *
 * Writes go through the caller's own session, same reasoning as
 * markAttendance(): semester_results grants INSERT/UPDATE to `authenticated`
 * gated by teaches_student() in RLS, so Postgres re-verifies the teaching
 * assignment on every row rather than trusting the one-time roster check.
 */
export async function saveResults(
  slotId: string,
  _prev: ResultsFormState,
  formData: FormData
): Promise<ResultsFormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Your session expired. Sign in again.", message: null };

  const context = await resolveClassRoster(slotId, user);
  if (!context) return { error: "You are not assigned to this class.", message: null };

  const semester = Number(formData.get("semester"));
  const academicYear = String(formData.get("academicYear") ?? "").trim();
  const publish = formData.get("intent") === "publish";

  if (semester !== 1 && semester !== 2) return { error: "Semester must be 1 or 2.", message: null };
  if (!/^\d{4}-\d{2}$/.test(academicYear)) {
    return { error: "Academic year must look like 2025-26.", message: null };
  }

  const rows: Record<string, unknown>[] = [];
  for (const student of context.roster) {
    const internalRaw = formData.get(`internal_${student.id}`);
    const externalRaw = formData.get(`external_${student.id}`);
    if (internalRaw === null && externalRaw === null) continue; // left blank — skip, don't zero it out

    const internal = internalRaw === "" || internalRaw === null ? null : Number(internalRaw);
    const external = externalRaw === "" || externalRaw === null ? null : Number(externalRaw);

    if (internal !== null && (Number.isNaN(internal) || internal < 0 || internal > 30)) {
      return { error: `Internal marks for ${student.fullName ?? student.id} must be 0–30.`, message: null };
    }
    if (external !== null && (Number.isNaN(external) || external < 0 || external > 70)) {
      return { error: `External marks for ${student.fullName ?? student.id} must be 0–70.`, message: null };
    }

    const total = (internal ?? 0) + (external ?? 0);
    const bothPresent = internal !== null && external !== null;
    const graded = bothPresent ? gradeFromMarks(total, 100) : null;

    rows.push({
      student_id: student.id,
      subject_id: context.subject.id,
      semester,
      academic_year: academicYear,
      internal_marks: internal,
      external_marks: external,
      grade: graded?.grade ?? null,
      grade_point: graded?.gradePoint ?? null,
      result_status: graded?.status ?? "pending",
      published: publish && bothPresent,
      published_at: publish && bothPresent ? new Date().toISOString() : null,
      entered_by: user.id,
    });
  }

  if (rows.length === 0) {
    return { error: "Enter at least one student's marks before saving.", message: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("semester_results")
    .upsert(rows, { onConflict: "student_id,subject_id,semester,academic_year" });

  if (error) {
    console.error("[results] bulk upsert failed:", error.message);
    return { error: "Could not save results. Please try again.", message: null };
  }

  revalidatePath(`/dashboard/classes/${slotId}/results`);
  return {
    error: null,
    message: publish
      ? `Published results for ${rows.filter((r) => r.published).length} student(s).`
      : `Saved a draft for ${rows.length} student(s).`,
  };
}
