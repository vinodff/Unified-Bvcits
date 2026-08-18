"use client";

import { useActionState } from "react";
import { createAnnouncement, type AnnouncementFormState } from "./actions";
import { USER_ROLES, ROLE_LABELS, DEPARTMENT_OPTIONS } from "@/lib/auth/roles";

const initialState: AnnouncementFormState = { error: null, ok: false };

const inputCls =
  "w-full rounded-md border border-surface-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-crimson focus:ring-2 focus:ring-crimson-100";

export function ComposeForm() {
  const [state, formAction, pending] = useActionState(createAnnouncement, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-surface-border bg-white p-6 shadow-card">
      <h2 className="text-lg font-bold text-navy">New announcement</h2>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Title</span>
        <input name="title" required minLength={3} maxLength={200} className={inputCls} placeholder="e.g. Mid-term timetable published" />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Message</span>
        <textarea name="body" required rows={5} maxLength={8000} className={inputCls} placeholder="What do they need to know?" />
      </label>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">Who should see this?</legend>
        <p className="mb-2 text-xs text-ink-muted">Leave all unchecked to show it to everyone.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {USER_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="audience" value={role} className="rounded border-surface-border" />
              {ROLE_LABELS[role]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Department (optional)</span>
          <select name="department" className={inputCls} defaultValue="">
            <option value="">All departments</option>
            {DEPARTMENT_OPTIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Expires (optional)</span>
          <input type="datetime-local" name="expiresAt" className={inputCls} />
        </label>
      </div>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="publish" defaultChecked className="rounded border-surface-border" />
          Publish immediately
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="pinned" className="rounded border-surface-border" />
          Pin to top
        </label>
      </div>

      {state.error && (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-md border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">
          Announcement saved.
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
        {pending ? "Saving…" : "Save announcement"}
      </button>
    </form>
  );
}
