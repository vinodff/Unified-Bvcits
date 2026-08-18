import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/auth/server";
import { ChevronLeft, ClipboardCheck } from "@/components/ui/icons";
import { resolveClassRoster } from "../roster";
import { AttendanceForm } from "./attendance-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mark Attendance | BVCITS",
  robots: { index: false, follow: false },
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function MarkAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ slotId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) return null;

  const { slotId } = await params;
  const context = await resolveClassRoster(slotId, user);
  if (!context) notFound();

  const { date: rawDate } = await searchParams;
  const classDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayIso();

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("student_id, status")
    .eq("subject_id", context.subject.id)
    .eq("class_date", classDate)
    .in("student_id", context.roster.map((s) => s.id));

  const existingByStudent = new Map((existing ?? []).map((r) => [r.student_id as string, r.status as string]));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/dashboard/classes" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-crimson">
          <ChevronLeft className="h-4 w-4" /> My Classes
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-navy">
          <ClipboardCheck className="h-6 w-6 text-crimson" /> Mark attendance
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {context.subject.code} — {context.subject.name} · {context.slot.department} Y{context.slot.studyYear} {context.slot.section}
        </p>
      </div>

      <AttendanceForm
        slotId={slotId}
        classDate={classDate}
        roster={context.roster}
        existingByStudent={Object.fromEntries(existingByStudent)}
      />
    </div>
  );
}
