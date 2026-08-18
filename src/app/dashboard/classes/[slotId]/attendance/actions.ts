"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/auth/server";
import { resolveClassRoster } from "../roster";

export interface MarkAttendanceState {
  error: string | null;
  message: string | null;
}

const VALID_STATUS = new Set(["present", "absent", "late"]);

/**
 * Bulk-save one date's attendance for a class.
 *
 * The actual write goes through the caller's OWN session (createClient()),
 * not the service role — attendance_records already grants INSERT/UPDATE to
 * `authenticated`, gated by the `teaches_student()` RLS check in
 * 0007_student_records.sql. Using the caller's session here means Postgres
 * itself re-verifies the teaching assignment on every row, not just the
 * one-time roster check in resolveClassRoster() — belt and braces on the
 * part that actually mutates data.
 */
export async function markAttendance(
  slotId: string,
  _prev: MarkAttendanceState,
  formData: FormData
): Promise<MarkAttendanceState> {
  const user = await getSessionUser();
  if (!user) return { error: "Your session expired. Sign in again.", message: null };

  const context = await resolveClassRoster(slotId, user);
  if (!context) return { error: "You are not assigned to this class.", message: null };

  const classDate = String(formData.get("classDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(classDate)) {
    return { error: "Pick a valid date.", message: null };
  }
  // A faculty member marking a class that hasn't happened yet is very likely
  // marking the wrong date, not the wrong roster — catch it before it becomes
  // a row a student later disputes.
  if (classDate > new Date().toISOString().slice(0, 10)) {
    return { error: "Cannot mark attendance for a future date.", message: null };
  }

  const rows = context.roster.map((student) => {
    const raw = String(formData.get(`status_${student.id}`) ?? "present");
    const status = VALID_STATUS.has(raw) ? raw : "present";
    return {
      student_id: student.id,
      subject_id: context.subject.id,
      class_date: classDate,
      status,
      marked_by: user.id,
    };
  });

  if (rows.length === 0) {
    return { error: "This class has no students to mark yet.", message: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance_records")
    .upsert(rows, { onConflict: "student_id,subject_id,class_date" });

  if (error) {
    console.error("[attendance] bulk upsert failed:", error.message);
    return { error: "Could not save attendance. Please try again.", message: null };
  }

  revalidatePath(`/dashboard/classes/${slotId}/attendance`);
  return { error: null, message: `Saved attendance for ${rows.length} student${rows.length === 1 ? "" : "s"} on ${classDate}.` };
}
