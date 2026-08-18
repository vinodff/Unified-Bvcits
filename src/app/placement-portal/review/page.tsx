import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { ReviewWorkspace } from "@/components/placement/ReviewWorkspace";

export const dynamic = "force-dynamic";

export default async function PlacementReviewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/placement-portal/review");
  if (!can(user.role, "exams.review")) redirect("/placement-portal");

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-extrabold text-navy">Faculty Review Workspace</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Inspect the research, edit the paper, then approve and publish it to students.
        </p>
      </header>
      <ReviewWorkspace />
    </div>
  );
}