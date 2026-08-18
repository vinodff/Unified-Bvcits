import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/auth/server";
import { ChevronLeft, GraduationCap } from "@/components/ui/icons";
import { resolveClassRoster } from "../roster";
import { ResultsForm } from "./results-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Enter Results | BVCITS",
  robots: { index: false, follow: false },
};

/** The Indian academic year in progress right now, as "YYYY-YY". */
function currentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  // Academic years run roughly July–June; before July, we're still in the
  // year that started the previous July.
  const startYear = now.getMonth() >= 6 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export default async function EnterResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slotId: string }>;
  searchParams: Promise<{ semester?: string; year?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) return null;

  const { slotId } = await params;
  const context = await resolveClassRoster(slotId, user);
  if (!context) notFound();

  const { semester: rawSemester, year: rawYear } = await searchParams;
  const semester = rawSemester === "2" ? 2 : 1;
  const academicYear = rawYear && /^\d{4}-\d{2}$/.test(rawYear) ? rawYear : currentAcademicYear();

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("semester_results")
    .select("student_id, internal_marks, external_marks, published")
    .eq("subject_id", context.subject.id)
    .eq("semester", semester)
    .eq("academic_year", academicYear)
    .in("student_id", context.roster.map((s) => s.id));

  const existingByStudent = Object.fromEntries(
    (existing ?? []).map((r) => [
      r.student_id as string,
      { internal: r.internal_marks as number | null, external: r.external_marks as number | null, published: r.published as boolean },
    ])
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/dashboard/classes" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-crimson">
          <ChevronLeft className="h-4 w-4" /> My Classes
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-navy">
          <GraduationCap className="h-6 w-6 text-crimson" /> Enter results
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {context.subject.code} — {context.subject.name} · {context.slot.department} Y{context.slot.studyYear} {context.slot.section}
        </p>
      </div>

      <ResultsForm
        slotId={slotId}
        semester={semester}
        academicYear={academicYear}
        roster={context.roster}
        existingByStudent={existingByStudent}
      />
    </div>
  );
}
