import "server-only";

import { createClient, getServiceClient, type SessionUser } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";

export interface RosterStudent {
  id: string;
  fullName: string | null;
  rollNumber: string | null;
}

export interface ClassContext {
  slot: { id: string; department: string; studyYear: number; section: string };
  subject: { id: string; code: string; name: string };
  roster: RosterStudent[];
}

/**
 * Resolve a timetable slot into "the class" a faculty member is about to act
 * on, and authorize the caller in the same step.
 *
 * The slot itself is read through the caller's own session — timetable_slots
 * grants SELECT to every authenticated user, so no escalation is needed there,
 * and it doubles as the actual authorization check: if the slot doesn't come
 * back with `faculty_id` matching the caller (and the caller isn't staff),
 * they were never assigned this class and get null.
 *
 * The student roster is the one piece that genuinely needs the service role:
 * profiles RLS (0004_auth_roles.sql) only lets a user read their own row or a
 * staff member read every row — a faculty member reading their students' names
 * has no RLS policy to stand on. The roster read below IS gated, just in the
 * application layer rather than in Postgres — same pattern already used for
 * /dashboard/enquiries and /dashboard/users.
 */
export async function resolveClassRoster(slotId: string, user: SessionUser): Promise<ClassContext | null> {
  if (!can(user.role, "academics.record")) return null;

  const supabase = await createClient();
  const { data: slot } = await supabase
    .from("timetable_slots")
    .select("id, department, study_year, section, faculty_id, subjects(id, code, name)")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot) return null;

  const isOwner = slot.faculty_id === user.id;
  const isStaff = user.role === "admin" || user.role === "management";
  if (!isOwner && !isStaff) return null;

  const subjectRaw = slot.subjects as { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  const subject = Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw;
  if (!subject) return null;

  const { data: rosterRows } = await getServiceClient()
    .from("profiles")
    .select("id, full_name, roll_number")
    .eq("role", "student")
    .eq("is_active", true)
    .eq("department", slot.department)
    .eq("study_year", slot.study_year)
    .eq("section", slot.section)
    .order("roll_number", { ascending: true, nullsFirst: false });

  const roster: RosterStudent[] = (rosterRows ?? []).map((r) => ({
    id: r.id as string,
    fullName: (r.full_name as string | null) ?? null,
    rollNumber: (r.roll_number as string | null) ?? null,
  }));

  return {
    slot: { id: slot.id, department: slot.department, studyYear: slot.study_year, section: slot.section },
    subject,
    roster,
  };
}
