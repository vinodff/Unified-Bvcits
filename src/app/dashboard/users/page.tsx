import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can, ROLE_LABELS, USER_ROLES } from "@/lib/auth/roles";
import { UserRow, type DirectoryUser } from "./user-row";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Users | BVCITS",
  robots: { index: false, follow: false },
};

export default async function UsersPage() {
  const actor = await getSessionUser();
  if (!actor) return null;
  if (!can(actor.role, "users.manage")) notFound();

  const { data, error } = await getServiceClient()
    .from("user_directory")
    .select("*")
    .limit(500);

  const users = (data ?? []) as DirectoryUser[];
  const counts = USER_ROLES.map((role) => ({
    role,
    count: users.filter((u) => u.role === role && u.is_active).length,
  })).filter((c) => c.count > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Users</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Everyone signs up as a student. Grant faculty, management and regulatory roles here.
        </p>
      </div>

      {counts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {counts.map(({ role, count }) => (
            <span
              key={role}
              className="rounded-full border border-surface-border bg-white px-3 py-1 text-xs font-medium text-ink-muted"
            >
              {ROLE_LABELS[role]}: <strong className="text-navy">{count}</strong>
            </span>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load users: {error.message}
        </p>
      )}

      {users.length === 0 && !error ? (
        <p className="rounded-xl border border-dashed border-surface-border bg-white p-8 text-center text-sm text-ink-muted">
          No accounts yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-border bg-white shadow-card">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-surface-border bg-surface-subtle text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3">User</th>
                <th scope="col" className="px-4 py-3">Department / Org</th>
                <th scope="col" className="px-4 py-3">Role</th>
                <th scope="col" className="px-4 py-3">Account</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow key={user.id} user={user} isSelf={user.id === actor.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
