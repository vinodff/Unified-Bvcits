import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { AnalyticsDashboard } from "@/components/placement/AnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function PlacementAnalyticsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/placement-portal/analytics");
  if (!can(user.role, "exams.review")) redirect("/placement-portal");

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-extrabold text-navy">Exam Analytics</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Score distribution, topic performance, time analysis and proctoring alerts across all attempts.
        </p>
      </header>
      <AnalyticsDashboard />
    </div>
  );
}