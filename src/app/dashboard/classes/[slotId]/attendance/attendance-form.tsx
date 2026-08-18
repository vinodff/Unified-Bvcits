"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Clock } from "@/components/ui/icons";
import { markAttendance, type MarkAttendanceState } from "./actions";
import type { RosterStudent } from "../roster";

const initialState: MarkAttendanceState = { error: null, message: null };

type Status = "present" | "absent" | "late";

const STATUS_OPTIONS: { value: Status; label: string; icon: typeof CheckCircle2 }[] = [
  { value: "present", label: "Present", icon: CheckCircle2 },
  { value: "late", label: "Late", icon: Clock },
  { value: "absent", label: "Absent", icon: XCircle },
];

export function AttendanceForm({
  slotId,
  classDate,
  roster,
  existingByStudent,
}: {
  slotId: string;
  classDate: string;
  roster: RosterStudent[];
  existingByStudent: Record<string, string>;
}) {
  const router = useRouter();
  const boundAction = markAttendance.bind(null, slotId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const [statuses, setStatuses] = useState<Record<string, Status>>(() => {
    const initial: Record<string, Status> = {};
    for (const student of roster) {
      const existing = existingByStudent[student.id];
      initial[student.id] = existing === "absent" || existing === "late" ? existing : "present";
    }
    return initial;
  });

  const setAll = (status: Status) => {
    setStatuses(Object.fromEntries(roster.map((s) => [s.id, status])));
  };

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-surface-border bg-white p-4 shadow-card">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-ink">Class date</span>
          <input
            type="date"
            defaultValue={classDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => router.push(`?date=${e.target.value}`)}
            className="rounded-md border border-surface-border px-2.5 py-1.5 text-sm"
          />
        </label>
        <input type="hidden" name="classDate" value={classDate} />
        <div className="flex gap-2">
          <button type="button" onClick={() => setAll("present")} className="text-xs font-medium text-crimson hover:underline">
            Mark all present
          </button>
        </div>
      </div>

      {roster.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border bg-white p-8 text-center text-sm text-ink-muted">
          No students found for this class yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
          <ul className="divide-y divide-surface-border">
            {roster.map((student) => (
              <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium text-navy">{student.fullName ?? "Unnamed student"}</p>
                  <p className="text-xs text-ink-muted">{student.rollNumber ?? "No roll number on file"}</p>
                </div>
                <input type="hidden" name={`status_${student.id}`} value={statuses[student.id]} />
                <div className="flex gap-1.5">
                  {STATUS_OPTIONS.map(({ value, label, icon: Icon }) => {
                    const active = statuses[student.id] === value;
                    const tone =
                      value === "present"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : value === "late"
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-red-300 bg-red-50 text-red-700";
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setStatuses((s) => ({ ...s, [student.id]: value }))}
                        aria-pressed={active}
                        title={label}
                        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                          active ? tone : "border-surface-border text-ink-muted hover:border-ink-faint"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
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

      <button type="submit" disabled={pending || roster.length === 0} className="btn-primary disabled:opacity-60">
        {pending ? "Saving…" : `Save attendance for ${roster.length} student${roster.length === 1 ? "" : "s"}`}
      </button>
    </form>
  );
}
