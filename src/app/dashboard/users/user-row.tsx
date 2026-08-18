"use client";

import { useActionState } from "react";
import { updateUserRole, setUserActive, type UserActionState } from "./actions";
import { USER_ROLES, ROLE_LABELS, type UserRole } from "@/lib/auth/roles";

const initial: UserActionState = { error: null, message: null };

export interface DirectoryUser {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  department: string | null;
  organization: string | null;
  is_active: boolean;
  created_at: string;
}

export function UserRow({ user, isSelf }: { user: DirectoryUser; isSelf: boolean }) {
  const [roleState, roleAction, rolePending] = useActionState(updateUserRole, initial);
  const [activeState, activeAction, activePending] = useActionState(setUserActive, initial);

  const feedback = roleState.error ?? activeState.error ?? roleState.message ?? activeState.message;
  const isError = Boolean(roleState.error ?? activeState.error);

  return (
    <tr className="border-b border-surface-border last:border-0">
      <td className="px-4 py-3">
        <span className="font-medium text-navy">{user.full_name ?? "—"}</span>
        {isSelf && <span className="ml-2 text-xs text-ink-muted">(you)</span>}
        <br />
        <span className="text-xs text-ink-muted">{user.email}</span>
        {feedback && (
          <span className={`mt-1 block text-xs ${isError ? "text-red-600" : "text-green-700"}`}>
            {feedback}
          </span>
        )}
      </td>

      <td className="px-4 py-3 text-ink-muted">
        {user.department ?? user.organization ?? "—"}
      </td>

      <td className="px-4 py-3">
        <form action={roleAction} className="flex items-center gap-2">
          <input type="hidden" name="userId" value={user.id} />
          <select
            name="role"
            defaultValue={user.role}
            disabled={rolePending}
            className="rounded-md border border-surface-border bg-white px-2 py-1 text-sm"
            aria-label={`Role for ${user.email}`}
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={rolePending}
            className="rounded-md border border-surface-border px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-crimson hover:text-crimson disabled:opacity-60"
          >
            {rolePending ? "…" : "Save"}
          </button>
        </form>
      </td>

      <td className="px-4 py-3">
        <form action={activeAction}>
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="isActive" value={String(!user.is_active)} />
          <button
            type="submit"
            disabled={activePending || isSelf}
            title={isSelf ? "You cannot deactivate your own account" : undefined}
            className={
              user.is_active
                ? "rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                : "rounded-md border border-green-200 px-2.5 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-50 disabled:opacity-40"
            }
          >
            {activePending ? "…" : user.is_active ? "Deactivate" : "Reactivate"}
          </button>
        </form>
      </td>
    </tr>
  );
}
