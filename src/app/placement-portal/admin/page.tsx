import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { AdminConsole } from "@/components/placement/AdminConsole";

export const dynamic = "force-dynamic";

export default async function PlacementAdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/placement-portal/admin");
  if (!can(user.role, "exams.create")) redirect("/placement-portal");

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-extrabold text-navy">Admin Console</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Create exam requests, run the AI pipeline and watch each stage complete.
        </p>
      </header>
      <AdminConsole />
    </div>
  );
}