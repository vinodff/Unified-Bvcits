"use client";

import { useState } from "react";

import {
  Award,
  Download,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  TrendingUp,
  XCircle,
} from "@/components/ui/icons";
import type { LookupBatch, LookupResponse } from "@/lib/results/types";

/**
 * Hall ticket + date of birth -> your results.
 *
 * No account, no password, no email. The whole point of the feature is that a
 * student who has just been told "results are out" can read them in two fields
 * on a phone, so there is nothing here to sign up for and nothing to remember.
 *
 * Nothing is fetched until the form is submitted, and nothing is persisted
 * afterwards — no localStorage, no query string. A shared lab computer must not
 * leave the previous student's marks a back-button away.
 */

type Status = "idle" | "loading" | "found" | "error";

export default function ResultLookup() {
  const [hallTicket, setHallTicket] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [data, setData] = useState<LookupResponse | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "loading") return;

    setStatus("loading");
    setMessage(null);
    setData(null);

    try {
      const response = await fetch("/api/results/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hallTicket, dateOfBirth }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(payload.error ?? "Something went wrong. Please try again.");
        return;
      }

      setData(payload as LookupResponse);
      setStatus("found");
    } catch {
      setStatus("error");
      setMessage("We could not reach the results server. Check your connection and try again.");
    }
  }

  function reset() {
    setStatus("idle");
    setData(null);
    setMessage(null);
    setHallTicket("");
    setDateOfBirth("");
  }

  if (status === "found" && data) {
    return <ResultSheet data={data} onReset={reset} />;
  }

  return (
    <div className="mx-auto max-w-lg">
      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-surface-border bg-white p-6 shadow-card sm:p-8">
        <div className="space-y-1.5">
          <label htmlFor="hallTicket" className="block text-sm font-semibold text-navy">
            Hall ticket number
          </label>
          <input
            id="hallTicket"
            name="hallTicket"
            value={hallTicket}
            onChange={(e) => setHallTicket(e.target.value)}
            required
            maxLength={24}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="24H41A0101"
            className="w-full rounded-xl border border-surface-border px-4 py-3 font-mono text-lg uppercase tracking-wide text-ink outline-none transition placeholder:font-sans placeholder:text-base placeholder:normal-case placeholder:text-ink-faint focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="dateOfBirth" className="block text-sm font-semibold text-navy">
            Date of birth
          </label>
          <input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            required
            // A native date input always submits ISO, whatever the phone's
            // locale displays — so the day-first vs month-first ambiguity that
            // dogs the uploaded spreadsheets cannot happen here.
            max={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-xl border border-surface-border px-4 py-3 text-lg text-ink outline-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-200"
          />
          <p className="text-xs text-ink-faint">As recorded on your admission form.</p>
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-crimson-700 px-6 py-3.5 text-base font-semibold text-white shadow-card transition hover:bg-crimson-800 disabled:cursor-not-allowed disabled:bg-ink-faint"
        >
          {status === "loading" ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <Search className="h-5 w-5" aria-hidden />
          )}
          {status === "loading" ? "Checking…" : "View my results"}
        </button>

        {message && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {message}
          </p>
        )}
      </form>
    </div>
  );
}

function ResultSheet({ data, onReset }: { data: LookupResponse; onReset: () => void }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-surface-border bg-white p-6 shadow-card">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Hall ticket</p>
          <p className="font-mono text-2xl font-bold text-navy">{data.hallTicketNo}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {data.studentName ?? "Name not on record"}
            {data.branch && <span> · {data.branch}</span>}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-4 py-2 text-sm font-medium text-ink transition hover:border-gold-300 hover:bg-gold-50"
          >
            <Download className="h-4 w-4" aria-hidden />
            Print / save PDF
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-4 py-2 text-sm font-medium text-ink transition hover:border-gold-300 hover:bg-gold-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Check another
          </button>
        </div>
      </div>

      {data.batches.map((batch) => (
        <BatchCard key={batch.id} batch={batch} />
      ))}

      <p className="text-center text-xs text-ink-faint print:hidden">
        This is an online copy for information only. Your official memorandum of marks is issued by the examination
        branch. If a mark looks wrong, contact the examination branch — this page cannot be corrected from here.
      </p>
    </div>
  );
}

function BatchCard({ batch }: { batch: LookupBatch }) {
  const meta = [batch.examType, batch.semester && `Semester ${batch.semester}`, batch.academicYear]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border pb-4">
        <div>
          <h2 className="text-lg font-bold text-navy">{batch.title}</h2>
          {meta && <p className="mt-0.5 text-sm text-ink-muted">{meta}</p>}
        </div>
        {batch.sgpa !== null && (
          <div className="rounded-xl border border-gold-200 bg-gold-50 px-4 py-2 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-crimson-700">SGPA</p>
            <p className="text-2xl font-bold text-crimson-800">{batch.sgpa.toFixed(2)}</p>
          </div>
        )}
      </header>

      <dl className="grid grid-cols-2 gap-3 py-4 sm:grid-cols-4">
        <Summary icon={<GraduationCap className="h-4 w-4" />} label="Subjects" value={String(batch.subjects.length)} />
        <Summary icon={<Award className="h-4 w-4" />} label="Credits earned" value={batch.creditsEarned.toFixed(1)} />
        <Summary
          icon={<TrendingUp className="h-4 w-4" />}
          label="Backlogs"
          value={String(batch.backlogs)}
          tone={batch.backlogs > 0 ? "danger" : "success"}
        />
        <Summary
          icon={<Award className="h-4 w-4" />}
          label="Outcome"
          value={batch.backlogs === 0 ? "All clear" : `${batch.backlogs} to clear`}
          tone={batch.backlogs > 0 ? "danger" : "success"}
        />
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <caption className="sr-only">Subject-wise results for {batch.title}</caption>
          <thead className="border-y border-surface-border text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th scope="col" className="py-2.5 pr-3">Subject</th>
              <th scope="col" className="px-3 py-2.5 text-right">Internal</th>
              <th scope="col" className="px-3 py-2.5 text-right">External</th>
              <th scope="col" className="px-3 py-2.5 text-right">Total</th>
              <th scope="col" className="px-3 py-2.5 text-center">Grade</th>
              <th scope="col" className="px-3 py-2.5 text-right">Credits</th>
              <th scope="col" className="py-2.5 pl-3 text-right">Result</th>
            </tr>
          </thead>
          <tbody>
            {batch.subjects.map((subject) => (
              <tr key={subject.subjectCode} className="border-b border-surface-border last:border-0">
                <th scope="row" className="py-3 pr-3 text-left font-medium text-navy">
                  {subject.subjectName}
                  <span className="block font-mono text-xs font-normal text-ink-faint">{subject.subjectCode}</span>
                </th>
                <td className="px-3 py-3 text-right tabular-nums text-ink-muted">{subject.internalMarks ?? "—"}</td>
                <td className="px-3 py-3 text-right tabular-nums text-ink-muted">{subject.externalMarks ?? "—"}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-navy">{subject.totalMarks ?? "—"}</td>
                <td className="px-3 py-3 text-center font-bold text-ink">{subject.grade ?? "—"}</td>
                <td className="px-3 py-3 text-right tabular-nums text-ink-muted">{subject.credits.toFixed(1)}</td>
                <td className="py-3 pl-3 text-right">
                  <ResultBadge result={subject.result} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Summary({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
}) {
  const toneClass =
    tone === "success" ? "text-emerald-700" : tone === "danger" ? "text-red-700" : "text-navy";
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-muted">
        <span className="text-ink-faint">{icon}</span>
        {label}
      </dt>
      <dd className={`mt-1 text-base font-bold ${toneClass}`}>{value}</dd>
    </div>
  );
}

const RESULT_STYLES: Record<string, string> = {
  pass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  fail: "border-red-200 bg-red-50 text-red-700",
  absent: "border-amber-200 bg-amber-50 text-amber-700",
  withheld: "border-amber-200 bg-amber-50 text-amber-700",
};

function ResultBadge({ result }: { result: string | null }) {
  if (!result) return <span className="text-ink-faint">—</span>;
  // An unrecognised university status still renders, in neutral styling, rather
  // than being hidden — see resolveOutcome() in lib/results/columns.ts.
  const style = RESULT_STYLES[result] ?? "border-surface-border bg-surface-subtle text-ink";
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${style}`}>
      {result}
    </span>
  );
}
