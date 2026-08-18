import type { Metadata } from "next";
import { getSessionUser, createClient } from "@/lib/auth/server";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Profile | BVCITS",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("full_name, phone, department, roll_number, employee_id, study_year, section, organization")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">My profile</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Signed in as {user.email} · <strong>{ROLE_LABELS[user.role]}</strong>
        </p>
      </div>

      <ProfileForm
        role={user.role}
        initial={{
          fullName: data?.full_name ?? "",
          phone: data?.phone ?? "",
          department: data?.department ?? "",
          rollNumber: data?.roll_number ?? "",
          employeeId: data?.employee_id ?? "",
          studyYear: data?.study_year ?? null,
          section: data?.section ?? "",
          organization: data?.organization ?? "",
        }}
      />

      <p className="rounded-lg border border-surface-border bg-white p-4 text-xs text-ink-muted">
        Your role is set by an administrator and cannot be changed here. Contact the
        institute if it is wrong.
      </p>
    </div>
  );
}
