import type { Metadata } from "next";
import { createClient, getSessionUser } from "@/lib/auth/server";
import { CheckCircle2, XCircle, Clock, BarChart3 } from "@/components/ui/icons";
import { SectionCard, StatTile, Chip, EmptyState, ProgressBar, type Tone } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Attendance | BVCITS",
  robots: { index: false, follow: false },
};

interface AttendanceRow {
  id: string;
  class_date: string;
  status: "present" | "absent" | "late";
  subjects: { code: string; name: string } | { code: string; name: string }[] | null;
}

interface SubjectSummary {
  subjectId: string;
  code: string;
  name: string;
  total: number;
  present: number;
  late: number;
  absent: number;
  pct: number;
}

/** Supabase returns the joined row as an object normally, but as an array when
 * the relationship can't be inferred as one-to-one — handle both shapes. */
function oneSubject(value: AttendanceRow["subjects"]): { code: string; name: string } | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const ATTENDANCE_FLOOR = 75; // JNTUK's standard minimum-attendance threshold.

function toneFor(pct: number): Tone {
  if (pct >= 85) return "success";
  if (pct >= ATTENDANCE_FLOOR) return "warning";
  return "danger";
}

export default async function AttendancePage() {
  const user = await getSessionUser();
  if (!user) return null;

  if (user.role !== "student") {
    return (
      <EmptyState icon={<BarChart3 className="h-8 w-8" />} text="Attendance records are shown for student accounts." />
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_records")
    .select("id, class_date, status, subject_id, subjects(code, name)")
    .eq("student_id", user.id)
    .order("class_date", { ascending: false })
    .limit(500);

  const rows = (data ?? []) as unknown as (AttendanceRow & { subject_id: string })[];

  const bySubject = new Map<string, SubjectSummary>();
  for (const row of rows) {
    const subject = oneSubject(row.subjects);
    if (!subject) continue;
    const entry = bySubject.get(row.subject_id) ?? {
      subjectId: row.subject_id,
      code: subject.code,
      name: subject.name,
      total: 0,
      present: 0,
      late: 0,
      absent: 0,
      pct: 0,
    };
    entry.total += 1;
    if (row.status === "present") entry.present += 1;
    else if (row.status === "late") entry.late += 1;
    else entry.absent += 1;
    bySubject.set(row.subject_id, entry);
  }
  const subjects = [...bySubject.values()]
    .map((s) => ({ ...s, pct: s.total ? Math.round(((s.present + s.late) / s.total) * 100) : 0 }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const overallTotal = subjects.reduce((sum, s) => sum + s.total, 0);
  const overallPresent = subjects.reduce((sum, s) => sum + s.present + s.late, 0);
  const overallPct = overallTotal ? Math.round((overallPresent / overallTotal) * 100) : 0;
  const belowFloor = subjects.filter((s) => s.pct < ATTENDANCE_FLOOR);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Attendance</h1>
        <p className="mt-1 text-sm text-ink-muted">Subject-wise attendance, updated as faculty mark each class.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load attendance: {error.message}
        </p>
      )}

      {!error && rows.length === 0 ? (
        <EmptyState icon={<BarChart3 className="h-8 w-8" />} text="No attendance has been recorded yet." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              icon={<BarChart3 className="h-5 w-5" />}
              label="Overall attendance"
              value={`${overallPct}%`}
              hint={`${overallPresent} of ${overallTotal} classes`}
              tone={toneFor(overallPct)}
            />
            <StatTile
              icon={<CheckCircle2 className="h-5 w-5" />}
              label="Subjects on track"
              value={`${subjects.length - belowFloor.length} / ${subjects.length}`}
              hint={`${ATTENDANCE_FLOOR}% minimum required`}
              tone={belowFloor.length === 0 ? "success" : "neutral"}
              delayMs={60}
            />
            <StatTile
              icon={<XCircle className="h-5 w-5" />}
              label="Below the floor"
              value={String(belowFloor.length)}
              hint={belowFloor.length ? belowFloor.map((s) => s.code).join(", ") : "None — all clear"}
              tone={belowFloor.length ? "danger" : "success"}
              delayMs={120}
            />
          </div>

          <SectionCard title="By subject" icon={<BarChart3 className="h-4 w-4" />}>
            <div className="space-y-4">
              {subjects.map((s) => (
                <div key={s.subjectId}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-navy">
                      {s.name} <span className="text-ink-muted">· {s.code}</span>
                    </span>
                    <span className="font-semibold text-navy">{s.pct}%</span>
                  </div>
                  <ProgressBar percent={s.pct} tone={toneFor(s.pct)} />
                  <p className="mt-1 text-xs text-ink-muted">
                    {s.present} present · {s.late} late · {s.absent} absent · {s.total} classes
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Recent classes" icon={<Clock className="h-4 w-4" />}>
            <ul className="divide-y divide-surface-border">
              {rows.slice(0, 20).map((row) => {
                const subject = oneSubject(row.subjects);
                return (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="text-ink">
                      {subject ? `${subject.code} — ${subject.name}` : "Subject removed"}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-ink-muted">
                        {new Date(row.class_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </span>
                      <Chip tone={row.status === "present" ? "success" : row.status === "late" ? "warning" : "danger"}>
                        {row.status}
                      </Chip>
                    </span>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        </>
      )}
    </div>
  );
}
