import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { StudentDashboard } from "@/components/placement/StudentDashboard";

export const dynamic = "force-dynamic";

export default async function PlacementExamsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/placement-portal/exams");

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-extrabold text-navy">Exam Dashboard</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Practise on faculty-approved predicted papers. Take them seriously — it&apos;s a locked, proctored
          environment.
        </p>
      </header>
      <StudentDashboard />
    </div>
  );
}