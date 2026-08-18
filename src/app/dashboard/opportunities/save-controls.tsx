"use client";

import { useTransition } from "react";
import { removeSaved, setSavedStatus } from "./actions";
import { TRACKER_LABELS, TRACKER_STATUSES, type TrackerStatus } from "@/lib/opportunities/tracker";

interface SaveControlsProps {
  opportunityId: string;
  savedStatus: TrackerStatus | null;
}

/**
 * Save / tracker controls for one opportunity card.
 *
 * A client component only because it needs the pending state — the mutations
 * themselves are server actions, so nothing about the write path is trusted to
 * the browser. `useTransition` keeps the row interactive while the action runs
 * instead of blocking the whole page on a router refresh.
 */
export function SaveControls({ opportunityId, savedStatus }: SaveControlsProps) {
  const [isPending, startTransition] = useTransition();

  function submit(action: (data: FormData) => Promise<void>, status?: TrackerStatus) {
    const data = new FormData();
    data.set("opportunityId", opportunityId);
    if (status) data.set("status", status);
    startTransition(() => {
      void action(data);
    });
  }

  if (!savedStatus) {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => submit(setSavedStatus, "saved")}
        className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:border-crimson hover:text-crimson disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`status-${opportunityId}`}>
        Application status
      </label>
      <select
        id={`status-${opportunityId}`}
        value={savedStatus}
        disabled={isPending}
        onChange={(event) => submit(setSavedStatus, event.target.value as TrackerStatus)}
        className="rounded-md border border-surface-border bg-white px-2 py-1.5 text-xs font-semibold text-navy disabled:opacity-50"
      >
        {TRACKER_STATUSES.map((status) => (
          <option key={status} value={status}>
            {TRACKER_LABELS[status]}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={isPending}
        onClick={() => submit(removeSaved)}
        className="text-xs font-medium text-ink-muted underline transition hover:text-crimson disabled:opacity-50"
      >
        Remove
      </button>
    </div>
  );
}
