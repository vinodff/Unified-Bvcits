"use client";

import { useActionState, useState } from "react";

import { Archive, CheckCircle2, EyeOff, FileSpreadsheet, Loader2, Trash2, XCircle } from "@/components/ui/icons";
import { Chip, EmptyState, type Tone } from "@/components/dashboard/ui";
import {
  archiveBatch,
  deleteBatch,
  publishBatch,
  unpublishBatch,
  IDLE_STATE,
  type BatchActionState,
} from "./actions";

/**
 * The batch list, and the only place a batch's visibility to students changes.
 *
 * Every button posts to a server action that re-checks `results.publish` — the
 * buttons rendered here are a convenience, never the authorization. Rendering
 * this list at all already required the capability, but a form can be replayed
 * and the action is what actually decides.
 */

export interface BatchRow {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  academicYear: string | null;
  semester: string | null;
  examType: string | null;
  sourceFilename: string | null;
  rowCount: number;
  studentCount: number;
  createdAt: string;
  publishedAt: string | null;
  notes: string | null;
  passRows: number;
  failRows: number;
  absentRows: number;
}

const STATUS_TONE: Record<BatchRow["status"], Tone> = {
  draft: "warning",
  published: "success",
  archived: "neutral",
};

const STATUS_LABEL: Record<BatchRow["status"], string> = {
  draft: "Draft — hidden from students",
  published: "Live",
  archived: "Archived",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function BatchList({ batches }: { batches: BatchRow[] }) {
  if (batches.length === 0) {
    return (
      <EmptyState
        icon={<FileSpreadsheet className="h-8 w-8" />}
        text="No results have been uploaded yet. Drop a sheet above to create the first batch."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {batches.map((batch) => (
        <li key={batch.id}>
          <BatchCard batch={batch} />
        </li>
      ))}
    </ul>
  );
}

function BatchCard({ batch }: { batch: BatchRow }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const meta = [batch.examType, batch.semester && `Sem ${batch.semester}`, batch.academicYear]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-navy">{batch.title}</h3>
          <p className="mt-0.5 text-sm text-ink-muted">
            {meta || "No exam details recorded"}
            {batch.sourceFilename && <span className="text-ink-faint"> · {batch.sourceFilename}</span>}
          </p>
        </div>
        <Chip tone={STATUS_TONE[batch.status]}>{STATUS_LABEL[batch.status]}</Chip>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Students" value={batch.studentCount.toLocaleString()} />
        <Stat label="Rows" value={batch.rowCount.toLocaleString()} />
        <Stat label="Passed" value={batch.passRows.toLocaleString()} />
        <Stat label="Failed" value={batch.failRows.toLocaleString()} />
        <Stat label="Absent" value={batch.absentRows.toLocaleString()} />
        <Stat label="Uploaded" value={formatDate(batch.createdAt)} />
      </dl>


      {batch.notes && <p className="mt-3 text-xs italic text-ink-faint">{batch.notes}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-surface-border pt-4">
        {batch.status !== "published" ? (
          <ActionButton
            action={publishBatch}
            batchId={batch.id}
            label="Publish to students"
            busyLabel="Publishing…"
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
            variant="primary"
          />
        ) : (
          <ActionButton
            action={unpublishBatch}
            batchId={batch.id}
            label="Unpublish"
            busyLabel="Hiding…"
            icon={<EyeOff className="h-4 w-4" aria-hidden />}
          />
        )}

        {batch.status !== "archived" && (
          <ActionButton
            action={archiveBatch}
            batchId={batch.id}
            label="Archive"
            busyLabel="Archiving…"
            icon={<Archive className="h-4 w-4" aria-hidden />}
          />
        )}

        {/*
          Deletion is offered only for a batch students cannot currently see.
          The server action enforces this too — this just avoids showing a
          button whose only outcome would be an error.
        */}
        {batch.status !== "published" && !confirmingDelete && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete
          </button>
        )}
      </div>

      {confirmingDelete && (
        <DeleteConfirm batch={batch} onCancel={() => setConfirmingDelete(false)} />
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-navy">{value}</dd>
    </div>
  );
}

function ActionButton({
  action,
  batchId,
  label,
  busyLabel,
  icon,
  variant = "secondary",
}: {
  action: (prev: BatchActionState, formData: FormData) => Promise<BatchActionState>;
  batchId: string;
  label: string;
  busyLabel: string;
  icon: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="batchId" value={batchId} />
      <button
        type="submit"
        disabled={pending}
        className={
          variant === "primary"
            ? "inline-flex items-center gap-1.5 rounded-full bg-crimson-700 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-crimson-800 disabled:bg-ink-faint"
            : "inline-flex items-center gap-1.5 rounded-full border border-surface-border px-4 py-1.5 text-sm font-medium text-ink transition hover:border-gold-300 hover:bg-gold-50 disabled:opacity-50"
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
        {pending ? busyLabel : label}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function ActionFeedback({ state }: { state: BatchActionState }) {
  if (!state.error && !state.message) return null;
  return (
    <p
      role="status"
      className={`basis-full text-xs ${state.error ? "text-red-700" : "text-emerald-700"}`}
    >
      {state.error ?? state.message}
    </p>
  );
}

function DeleteConfirm({ batch, onCancel }: { batch: BatchRow; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState(deleteBatch, IDLE_STATE);

  return (
    <form action={formAction} className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <input type="hidden" name="batchId" value={batch.id} />
      <p className="text-xs text-red-800">
        This permanently deletes <strong>{batch.rowCount.toLocaleString()}</strong> result rows. Students keep their
        sign-in details, so their other results are unaffected. Type the title to confirm:
      </p>
      <p className="select-all rounded border border-red-200 bg-white px-2 py-1 font-mono text-xs text-ink">
        {batch.title}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="confirmTitle"
          required
          autoComplete="off"
          aria-label="Type the batch title to confirm deletion"
          className="min-w-0 flex-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-red-700 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
          Delete permanently
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:bg-white"
        >
          Cancel
        </button>
      </div>
      {state.error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-red-800">
          <XCircle className="h-3.5 w-3.5" aria-hidden />
          {state.error}
        </p>
      )}
    </form>
  );
}
