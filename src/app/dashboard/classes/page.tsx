import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { LayoutGrid, ClipboardCheck, GraduationCap, Clock } from "@/components/ui/icons";
import { SectionCard, EmptyState } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Classes | BVCITS",
  robots: { index: false, follow: false },
};

interface SlotRow {
  id: string;
  department: string;
  study_year: number;
  section: string;
  day_of_week: number;
  start_time: string;
  subjects: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
}

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function ClassesPage() {
  const user = await getSessionUser();
  if (!user) return null;
  if (!can(user.role, "academics.record")) notFound();

  const supabase = await createClient();
  // Readable directly via the caller's own session: timetable_slots grants
  // SELECT to every authenticated user (0007_student_records.sql) — a faculty
  // member's own teaching list needs no service-role escalation.
  const { data, error } = await supabase
    .from("timetable_slots")
    .select("id, department, study_year, section, day_of_week, start_time, subjects(id, code, name)")
    .eq("faculty_id", user.id)
    .order("department")
    .order("study_year")
    .order("section");

  const rows = (data ?? []) as unknown as SlotRow[];

  // One card per (subject, class) taught — a subject taught to two sections
  // is two cards, since attendance and results are entered per section.
  const byClass = new Map<string, SlotRow & { subject: { id: string; code: string; name: string } }>();
  for (const row of rows) {
    const subject = one(row.subjects);
    if (!subject) continue;
    const key = `${row.department}-${row.study_year}-${row.section}-${subject.id}`;
    if (!byClass.has(key)) byClass.set(key, { ...row, subject });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">My Classes</h1>
        <p className="mt-1 text-sm text-ink-muted">Mark attendance and enter results for the classes assigned to you on the timetable.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load your classes: {error.message}
        </p>
      )}

      {!error && byClass.size === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-8 w-8" />}
          text="No classes are assigned to you on the timetable yet. Ask an administrator to add you to a slot."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...byClass.values()].map((row) => (
            <SectionCard
              key={row.id}
              title={`${row.department} · Y${row.study_year} · ${row.section}`}
              icon={<GraduationCap className="h-4 w-4" />}
            >
              <p className="font-semibold text-navy">
                {row.subject.code} — {row.subject.name}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                <Clock className="h-3.5 w-3.5" /> {DAYS[row.day_of_week]} · {row.start_time.slice(0, 5)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/dashboard/classes/${row.id}/attendance`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-crimson px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-crimson-700"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" /> Mark attendance
                </Link>
                <Link
                  href={`/dashboard/classes/${row.id}/results`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-surface-border px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-crimson hover:text-crimson"
                >
                  <GraduationCap className="h-3.5 w-3.5" /> Enter results
                </Link>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
