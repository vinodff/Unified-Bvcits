"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileFormState } from "./actions";
import { DEPARTMENT_OPTIONS, type UserRole } from "@/lib/auth/roles";

const initialState: ProfileFormState = { error: null, ok: false };

const inputCls =
  "w-full rounded-md border border-surface-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-crimson focus:ring-2 focus:ring-crimson-100";

export interface ProfileInitial {
  fullName: string;
  phone: string;
  department: string;
  rollNumber: string;
  employeeId: string;
  studyYear: number | null;
  section: string;
  organization: string;
}

/** Only ask for fields that make sense for the role — a recruiter has no roll number. */
const SHOWS_ACADEMIC: readonly UserRole[] = ["student"];
const SHOWS_EMPLOYMENT: readonly UserRole[] = ["faculty", "management"];
const SHOWS_ORGANIZATION: readonly UserRole[] = ["recruiter", "trainer", "regulatory"];
const SHOWS_DEPARTMENT: readonly UserRole[] = ["student", "faculty", "management"];

export function ProfileForm({ role, initial }: { role: UserRole; initial: ProfileInitial }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-surface-border bg-white p-6 shadow-card">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Full name</span>
        <input name="fullName" required minLength={2} maxLength={120} defaultValue={initial.fullName} className={inputCls} />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink">Mobile</span>
        <input name="phone" type="tel" inputMode="tel" defaultValue={initial.phone} className={inputCls} placeholder="10-digit number" />
      </label>

      {SHOWS_DEPARTMENT.includes(role) && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Department</span>
          <select name="department" defaultValue={initial.department} className={inputCls}>
            <option value="">Not set</option>
            {DEPARTMENT_OPTIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
      )}

      {SHOWS_ACADEMIC.includes(role) && (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Roll number</span>
            <input name="rollNumber" maxLength={40} defaultValue={initial.rollNumber} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Year</span>
            <select name="studyYear" defaultValue={initial.studyYear ?? ""} className={inputCls}>
              <option value="">—</option>
              {[1, 2, 3, 4].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Section</span>
            <input name="section" maxLength={10} defaultValue={initial.section} className={inputCls} />
          </label>
        </div>
      )}

      {SHOWS_EMPLOYMENT.includes(role) && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Employee ID</span>
          <input name="employeeId" maxLength={40} defaultValue={initial.employeeId} className={inputCls} />
        </label>
      )}

      {SHOWS_ORGANIZATION.includes(role) && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Organization</span>
          <input name="organization" maxLength={160} defaultValue={initial.organization} className={inputCls} />
        </label>
      )}

      {state.error && (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-md border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">
          Profile saved.
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
