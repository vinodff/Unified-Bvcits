"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";

import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  UploadCloud,
  XCircle,
} from "@/components/ui/icons";
import type { ImportSummary, ParseIssue, SheetReport } from "@/lib/results/types";

/**
 * The upload half of the results portal.
 *
 * Deliberately drag-a-file-and-go: the only genuinely required input is the
 * file. Every metadata field has a sensible fallback on the server, because the
 * person doing this is an exam-branch clerk with a folder of sheets, not
 * someone who wants to fill a form first.
 *
 * The upload lands as a DRAFT. Nothing here can publish — that is a separate,
 * deliberate click on the batch below, so a wrong file is a recoverable
 * mistake rather than an instant notification to the whole college.
 */

const ACCEPT = ".xlsx,.xls,.xlsm,.csv";

interface ImportResponse {
  batchId: string;
  summary: ImportSummary;
  issues: ParseIssue[];
  issueCount: number;
  sheets: SheetReport[];
  newStudents: number;
  dobFromSheet: number;
  placeholderStudents: number;
  sampleHallTickets: string[];
  defaultDob: string;
}

interface ErrorResponse {
  error: string;
  issues?: ParseIssue[];
  sheets?: SheetReport[];
}

/** Today minus 18 years — a plausible default so the field is never empty. */
function defaultDobSuggestion(): string {
  const now = new Date();
  return `${now.getFullYear() - 20}-01-01`;
}

export default function UploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<ErrorResponse | null>(null);

  function chooseFile(next: File | null) {
    setFile(next);
    setResult(null);
    setError(null);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) chooseFile(dropped);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;

    setBusy(true);
    setResult(null);
    setError(null);

    const body = new FormData(event.currentTarget);
    body.set("file", file);

    try {
      const response = await fetch("/api/results/import", { method: "POST", body });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload as ErrorResponse);
        return;
      }

      setResult(payload as ImportResponse);
      setFile(null);
      formRef.current?.reset();
      // Bring the new draft into the batch list below without a full reload.
      router.refresh();
    } catch {
      setError({ error: "The upload did not reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragging
            ? "border-gold-400 bg-gold-50"
            : "border-surface-border bg-surface-subtle hover:border-gold-300 hover:bg-gold-50/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
        />

        {file ? (
          <>
            <FileSpreadsheet className="h-9 w-9 text-crimson-600" aria-hidden />
            <div>
              <p className="font-semibold text-navy">{file.name}</p>
              <p className="text-sm text-ink-muted">{(file.size / 1024).toFixed(0)} KB · ready to import</p>
            </div>
            <span className="text-xs text-ink-faint">Drop another file to replace it</span>
          </>
        ) : (
          <>
            <UploadCloud className={`h-10 w-10 ${dragging ? "text-gold-600" : "text-ink-faint"}`} aria-hidden />
            <div>
              <p className="font-semibold text-navy">Drop the results sheet here</p>
              <p className="text-sm text-ink-muted">or click to choose a file — .xlsx, .xls or .csv</p>
            </div>
            <span className="max-w-md text-xs text-ink-faint">
              Every tab in the workbook is imported. Column headings are matched automatically, so
              &ldquo;Hall Ticket No&rdquo;, &ldquo;Roll No&rdquo; and &ldquo;Regd. No&rdquo; all work.
            </span>
          </>
        )}
      </label>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" disabled={busy}>
        <legend className="sr-only">Batch details</legend>

        <Field label="Notification title" hint="Defaults to the file name">
          <input
            type="text"
            name="title"
            placeholder="I B.Tech II Sem Regular — Nov 2024"
            className={INPUT_CLASS}
            maxLength={200}
          />
        </Field>

        <Field label="Academic year">
          <input type="text" name="academicYear" placeholder="2024-25" className={INPUT_CLASS} maxLength={20} />
        </Field>

        <Field label="Semester">
          <input type="text" name="semester" placeholder="1-2" className={INPUT_CLASS} maxLength={40} />
        </Field>

        <Field label="Exam type">
          <select name="examType" className={INPUT_CLASS} defaultValue="Regular">
            <option value="Regular">Regular</option>
            <option value="Supplementary">Supplementary</option>
            <option value="Revaluation">Revaluation</option>
          </select>
        </Field>

        <Field
          label="Fallback date of birth"
          hint="Used only for students this sheet introduces who have no DOB on file"
        >
          <input type="date" name="defaultDob" defaultValue={defaultDobSuggestion()} className={INPUT_CLASS} />
        </Field>

        <Field label="Internal note" hint="Not shown to students">
          <input type="text" name="notes" placeholder="Received from exam branch" className={INPUT_CLASS} maxLength={200} />
        </Field>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!file || busy}
          className="inline-flex items-center gap-2 rounded-full bg-crimson-700 px-6 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-crimson-800 disabled:cursor-not-allowed disabled:bg-ink-faint"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UploadCloud className="h-4 w-4" aria-hidden />}
          {busy ? "Importing…" : "Import as draft"}
        </button>
        <p className="text-xs text-ink-muted">
          Imports are always saved as a draft. Nothing reaches students until you publish it below.
        </p>
      </div>

      {busy && (
        <p role="status" className="text-sm text-ink-muted">
          Reading the workbook and writing rows. A large sheet can take a minute — leave this tab open.
        </p>
      )}

      {error && <ImportError error={error} />}
      {result && <ImportReport result={result} />}
    </form>
  );
}

const INPUT_CLASS =
  "w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-200";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

function ImportError({ error }: { error: ErrorResponse }) {
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="flex items-start gap-2 text-sm font-semibold text-red-800">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {error.error}
      </p>

      {error.sheets && error.sheets.length > 0 && (
        <div className="text-xs text-red-700">
          <p className="font-semibold">What was found in each tab:</p>
          <ul className="mt-1 space-y-0.5">
            {error.sheets.map((sheet) => (
              <li key={sheet.name}>
                <span className="font-medium">{sheet.name}</span>{" "}
                {sheet.headerRow === null
                  ? "— no header row recognised"
                  : `— header on row ${sheet.headerRow}, ${sheet.acceptedRows} rows read`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error.issues && error.issues.length > 0 && <IssueList issues={error.issues} tone="error" />}
    </div>
  );
}

function ImportReport({ result }: { result: ImportResponse }) {
  const { summary } = result;

  return (
    <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        Imported as a draft — review the numbers below, then publish it in the batch list.
      </p>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Students" value={summary.students.toLocaleString()} />
        <Metric label="Result rows" value={summary.totalRows.toLocaleString()} />
        <Metric label="Subjects" value={summary.subjects.toLocaleString()} />
        <Metric label="Branches" value={summary.branches.join(", ") || "—"} />
        <Metric label="Passed" value={summary.pass.toLocaleString()} />
        <Metric label="Failed" value={summary.fail.toLocaleString()} />
        <Metric label="Absent" value={summary.absent.toLocaleString()} />
        <Metric label="New students" value={result.newStudents.toLocaleString()} />
      </dl>

      {result.sampleHallTickets.length > 0 && (
        <div className="rounded-lg border border-gold-200 bg-white p-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-crimson-700">
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
            Test the student lookup with these
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {result.sampleHallTickets.map((hallTicket) => (
              <li key={hallTicket} className="font-mono">
                {hallTicket}
                <span className="ml-2 font-sans text-ink-muted">
                  · date of birth{" "}
                  <span className="font-mono">
                    {result.placeholderStudents > 0 ? result.defaultDob : "as printed in the sheet"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-faint">
            Publish the batch first — a draft deliberately returns &ldquo;not found&rdquo; to students.
          </p>
        </div>
      )}

      {result.placeholderStudents > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <strong>{result.placeholderStudents.toLocaleString()}</strong> student
            {result.placeholderStudents === 1 ? "" : "s"} will sign in with the shared fallback date{" "}
            <span className="font-mono">{result.defaultDob}</span>, because this sheet carried no date-of-birth
            column. That is fine for testing, but anyone who knows a hall ticket can open those results. Upload a
            sheet with a <span className="font-mono">Date of Birth</span> column to replace it with each
            student&rsquo;s real date.
          </span>
        </p>
      )}

      {result.issueCount > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-800">
            {result.issueCount.toLocaleString()} row{result.issueCount === 1 ? "" : "s"} needed attention
            {result.issueCount > result.issues.length && ` (showing the first ${result.issues.length})`}
          </p>
          <IssueList issues={result.issues} tone="warning" />
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-white px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-lg font-bold text-navy" title={value}>
        {value}
      </dd>
    </div>
  );
}

function IssueList({ issues, tone }: { issues: ParseIssue[]; tone: "error" | "warning" }) {
  return (
    <ul
      className={`mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2 text-xs ${
        tone === "error" ? "border-red-200 bg-white text-red-800" : "border-amber-200 bg-white text-amber-900"
      }`}
    >
      {issues.map((issue, index) => (
        <li key={`${issue.sheet}-${issue.row}-${index}`}>
          <span className="font-mono font-semibold">
            {issue.sheet}!{issue.row}
          </span>{" "}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}
