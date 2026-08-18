import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { LayoutGrid, BarChart3, GraduationCap, IndianRupee } from "@/components/ui/icons";
import { SectionCard, StatTile, EmptyState, ProgressBar, type Tone } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Academics Overview | BVCITS",
  robots: { index: false, follow: false },
};

interface OverviewRow {
  department: string;
  study_year: number;
  section: string;
  student_count: number;
  avg_attendance_pct: number | null;
  students_with_published_results: number;
  fee_paid_pct: number | null;
}

function toneFor(pct: number | null): Tone {
  if (pct == null) return "neutral";
  if (pct >= 85) return "success";
  if (pct >= 75) return "warning";
  return "danger";
}

export default async function AcademicsOverviewPage() {
  const user = await getSessionUser();
  if (!user) return null;
  if (!can(user.role, "academics.manage")) notFound();

  // academics_overview is service-role-only, same lockdown as enquiry_inbox
  // and campaign_dashboard — reachable here only because this page's own
  // capability check IS the authorization boundary.
  const { data, error } = await getServiceClient().from("academics_overview").select("*");
  const rows = (data ?? []) as OverviewRow[];

  const totalStudents = rows.reduce((sum, r) => sum + r.student_count, 0);
  const weightedAttendance = rows.reduce((sum, r) => sum + (r.avg_attendance_pct ?? 0) * r.student_count, 0);
  const avgAttendance = totalStudents ? Math.round(weightedAttendance / totalStudents) : null;
  const totalWithResults = rows.reduce((sum, r) => sum + r.students_with_published_results, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Academics overview</h1>
        <p className="mt-1 text-sm text-ink-muted">Attendance, results and fee status across every class section.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load the overview: {error.message}
        </p>
      )}

      {!error && rows.length === 0 ? (
        <EmptyState icon={<LayoutGrid className="h-8 w-8" />} text="No active students on record yet." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile icon={<LayoutGrid className="h-5 w-5" />} label="Students" value={String(totalStudents)} hint={`${rows.length} class sections`} />
            <StatTile
              icon={<BarChart3 className="h-5 w-5" />}
              label="Average attendance"
              value={avgAttendance != null ? `${avgAttendance}%` : "—"}
              tone={toneFor(avgAttendance)}
              delayMs={60}
            />
            <StatTile
              icon={<GraduationCap className="h-5 w-5" />}
              label="Results published"
              value={String(totalWithResults)}
              hint="students with at least one published result"
              delayMs={120}
            />
          </div>

          <SectionCard title="By class section" icon={<LayoutGrid className="h-4 w-4" />}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Class</th>
                    <th scope="col" className="px-3 py-2 text-right">Students</th>
                    <th scope="col" className="px-3 py-2">Attendance</th>
                    <th scope="col" className="px-3 py-2 text-right">Results published</th>
                    <th scope="col" className="py-2 pl-3 text-right">Fees paid</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.department}-${row.study_year}-${row.section}`} className="border-b border-surface-border last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-navy">
                        {row.department} · Y{row.study_year} · {row.section}
                      </td>
                      <td className="px-3 py-2.5 text-right text-ink-muted">{row.student_count}</td>
                      <td className="w-40 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-24">
                            <ProgressBar percent={row.avg_attendance_pct ?? 0} tone={toneFor(row.avg_attendance_pct)} />
                          </div>
                          <span className="text-xs text-ink-muted">{row.avg_attendance_pct != null ? `${row.avg_attendance_pct}%` : "—"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-ink-muted">{row.students_with_published_results}</td>
                      <td className="py-2.5 pl-3 text-right text-ink-muted">
                        <span className="inline-flex items-center gap-1">
                          <IndianRupee className="h-3.5 w-3.5" />
                          {row.fee_paid_pct != null ? `${row.fee_paid_pct}%` : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
