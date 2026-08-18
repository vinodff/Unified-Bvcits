import type { Metadata } from "next";
import { createClient, getSessionUser } from "@/lib/auth/server";
import { GraduationCap, Award, TrendingUp } from "@/components/ui/icons";
import { SectionCard, StatTile, Chip, EmptyState, type Tone } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Results | BVCITS",
  robots: { index: false, follow: false },
};

interface ResultRow {
  id: string;
  semester: number;
  academic_year: string;
  internal_marks: number | null;
  external_marks: number | null;
  total_marks: number | null;
  max_marks: number;
  grade: string | null;
  grade_point: number | null;
  result_status: "pending" | "pass" | "fail" | "absent";
  subjects: { code: string; name: string; credits: number } | { code: string; name: string; credits: number }[] | null;
}

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function statusTone(status: ResultRow["result_status"]): Tone {
  if (status === "pass") return "success";
  if (status === "fail") return "danger";
  if (status === "absent") return "warning";
  return "neutral";
}

export default async function ResultsPage() {
  const user = await getSessionUser();
  if (!user) return null;

  if (user.role !== "student") {
    return <EmptyState icon={<GraduationCap className="h-8 w-8" />} text="Results are shown for student accounts." />;
  }

  const supabase = await createClient();
  // RLS already restricts this to the student's own PUBLISHED rows — an
  // unpublished result never reaches this query regardless of what's asked
  // for, so there is no risk of a half-entered mark showing up early.
  const { data, error } = await supabase
    .from("semester_results")
    .select(
      "id, semester, academic_year, internal_marks, external_marks, total_marks, max_marks, grade, grade_point, result_status, subjects(code, name, credits)"
    )
    .eq("student_id", user.id)
    .order("academic_year", { ascending: false })
    .order("semester", { ascending: false });

  const rows = (data ?? []) as unknown as ResultRow[];

  const byTerm = new Map<string, ResultRow[]>();
  for (const row of rows) {
    const key = `${row.academic_year}__${row.semester}`;
    const list = byTerm.get(key) ?? [];
    list.push(row);
    byTerm.set(key, list);
  }

  const terms = [...byTerm.entries()].map(([key, termRows]) => {
    const [academicYear, semester] = key.split("__");
    let creditSum = 0;
    let pointSum = 0;
    for (const row of termRows) {
      const subject = one(row.subjects);
      if (!subject || row.grade_point == null) continue;
      creditSum += subject.credits;
      pointSum += subject.credits * row.grade_point;
    }
    const sgpa = creditSum ? pointSum / creditSum : null;
    return { academicYear, semester: Number(semester), rows: termRows, sgpa, creditSum, pointSum };
  });

  const totalCredits = terms.reduce((sum, t) => sum + t.creditSum, 0);
  const totalPoints = terms.reduce((sum, t) => sum + t.pointSum, 0);
  const cgpa = totalCredits ? totalPoints / totalCredits : null;
  const backlogs = rows.filter((r) => r.result_status === "fail").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Results</h1>
        <p className="mt-1 text-sm text-ink-muted">Published semester results only — a result appears here once faculty publish it.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load results: {error.message}
        </p>
      )}

      {!error && rows.length === 0 ? (
        <EmptyState icon={<GraduationCap className="h-8 w-8" />} text="No results have been published yet." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              icon={<TrendingUp className="h-5 w-5" />}
              label="CGPA"
              value={cgpa != null ? cgpa.toFixed(2) : "—"}
              hint={`Across ${terms.length} semester${terms.length === 1 ? "" : "s"}`}
              tone="gold"
            />
            <StatTile
              icon={<Award className="h-5 w-5" />}
              label="Latest SGPA"
              value={terms[0]?.sgpa != null ? terms[0].sgpa.toFixed(2) : "—"}
              hint={terms[0] ? `Semester ${terms[0].semester} · ${terms[0].academicYear}` : undefined}
              delayMs={60}
            />
            <StatTile
              icon={<GraduationCap className="h-5 w-5" />}
              label="Active backlogs"
              value={String(backlogs)}
              tone={backlogs ? "danger" : "success"}
              delayMs={120}
            />
          </div>

          {terms.map((term) => (
            <SectionCard
              key={`${term.academicYear}-${term.semester}`}
              title={`Semester ${term.semester} · ${term.academicYear}`}
              icon={<GraduationCap className="h-4 w-4" />}
              action={term.sgpa != null && <Chip tone="gold">SGPA {term.sgpa.toFixed(2)}</Chip>}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th scope="col" className="py-2 pr-3">Subject</th>
                      <th scope="col" className="px-3 py-2 text-right">Internal</th>
                      <th scope="col" className="px-3 py-2 text-right">External</th>
                      <th scope="col" className="px-3 py-2 text-right">Total</th>
                      <th scope="col" className="px-3 py-2">Grade</th>
                      <th scope="col" className="py-2 pl-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {term.rows.map((row) => {
                      const subject = one(row.subjects);
                      return (
                        <tr key={row.id} className="border-b border-surface-border last:border-0">
                          <td className="py-2.5 pr-3 font-medium text-navy">
                            {subject ? `${subject.code} — ${subject.name}` : "Subject removed"}
                          </td>
                          <td className="px-3 py-2.5 text-right text-ink-muted">{row.internal_marks ?? "—"}</td>
                          <td className="px-3 py-2.5 text-right text-ink-muted">{row.external_marks ?? "—"}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-navy">
                            {row.total_marks ?? "—"} <span className="text-ink-faint">/ {row.max_marks}</span>
                          </td>
                          <td className="px-3 py-2.5 text-ink">{row.grade ?? "—"}</td>
                          <td className="py-2.5 pl-3 text-right">
                            <Chip tone={statusTone(row.result_status)}>{row.result_status}</Chip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ))}
        </>
      )}
    </div>
  );
}
