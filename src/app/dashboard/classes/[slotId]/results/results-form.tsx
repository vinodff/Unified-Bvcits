"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { saveResults, type ResultsFormState } from "./actions";
import type { RosterStudent } from "../roster";

const initialState: ResultsFormState = { error: null, message: null };

interface ExistingResult {
  internal: number | null;
  external: number | null;
  published: boolean;
}

export function ResultsForm({
  slotId,
  semester,
  academicYear,
  roster,
  existingByStudent,
}: {
  slotId: string;
  semester: number;
  academicYear: string;
  roster: RosterStudent[];
  existingByStudent: Record<string, ExistingResult>;
}) {
  const router = useRouter();
  const boundAction = saveResults.bind(null, slotId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const navigate = (nextSemester: number, nextYear: string) => {
    router.push(`?semester=${nextSemester}&year=${nextYear}`);
  };

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-surface-border bg-white p-4 shadow-card">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink">Semester</span>
          <select
            defaultValue={semester}
            onChange={(e) => navigate(Number(e.target.value), academicYear)}
            className="rounded-md border border-surface-border px-2.5 py-1.5 text-sm"
          >
            <option value={1}>Semester 1</option>
            <option value={2}>Semester 2</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink">Academic year</span>
          <input
            defaultValue={academicYear}
            onBlur={(e) => /^\d{4}-\d{2}$/.test(e.target.value) && navigate(semester, e.target.value)}
            placeholder="2025-26"
            className="w-28 rounded-md border border-surface-border px-2.5 py-1.5 text-sm"
          />
        </label>
        <input type="hidden" name="semester" value={semester} />
        <input type="hidden" name="academicYear" value={academicYear} />
        <p className="ml-auto max-w-xs text-xs text-ink-muted">
          Internal (0–30) + external (0–70). Grade and pass/fail are calculated automatically.
        </p>
      </div>

      {roster.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border bg-white p-8 text-center text-sm text-ink-muted">
          No students found for this class yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-surface-border bg-white shadow-card">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="border-b border-surface-border bg-surface-subtle text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5">Student</th>
                <th scope="col" className="px-3 py-2.5">Internal</th>
                <th scope="col" className="px-3 py-2.5">External</th>
                <th scope="col" className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((student) => {
                const existing = existingByStudent[student.id];
                return (
                  <tr key={student.id} className="border-b border-surface-border last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-navy">{student.fullName ?? "Unnamed student"}</p>
                      <p className="text-xs text-ink-muted">{student.rollNumber ?? "—"}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        name={`internal_${student.id}`}
                        min={0}
                        max={30}
                        step="0.5"
                        defaultValue={existing?.internal ?? ""}
                        className="w-16 rounded-md border border-surface-border px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        name={`external_${student.id}`}
                        min={0}
                        max={70}
                        step="0.5"
                        defaultValue={existing?.external ?? ""}
                        className="w-16 rounded-md border border-surface-border px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {existing?.published ? (
                        <span className="font-medium text-emerald-700">Published</span>
                      ) : existing ? (
                        <span className="text-amber-700">Draft</span>
                      ) : (
                        <span className="text-ink-faint">Not entered</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-md border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="intent"
          value="draft"
          disabled={pending || roster.length === 0}
          className="rounded-md border border-surface-border px-4 py-2 text-sm font-semibold text-ink transition hover:border-crimson hover:text-crimson disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save as draft"}
        </button>
        <button
          type="submit"
          name="intent"
          value="publish"
          disabled={pending || roster.length === 0}
          className="btn-primary disabled:opacity-60"
        >
          {pending ? "Publishing…" : "Save & publish"}
        </button>
      </div>
    </form>
  );
}
