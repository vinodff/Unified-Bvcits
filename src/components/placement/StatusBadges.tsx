"use client";

import type { ExamPipelineStatus, PaperStatus } from "@/lib/placement/types";

const EXAM_STATUS_STYLES: Record<ExamPipelineStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-surface-grey text-ink-soft border-surface-border" },
  researching: { label: "Researching", className: "bg-gold-50 text-gold-700 border-gold-200" },
  extracting: { label: "Extracting", className: "bg-gold-50 text-gold-700 border-gold-200" },
  processing: { label: "Processing", className: "bg-gold-50 text-gold-700 border-gold-200" },
  reviewing: { label: "AI Reviewing", className: "bg-gold-50 text-gold-700 border-gold-200" },
  generating: { label: "Generating", className: "bg-gold-50 text-gold-700 border-gold-200" },
  review: { label: "Needs review", className: "bg-cyberOrange-50 text-cyberOrange-700 border-cyberOrange-200" },
  approved: { label: "Approved", className: "bg-maroon-50 text-maroon-500 border-maroon-100" },
  published: { label: "Published", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700 border-red-200" },
};

export function ExamStatusBadge({ status }: { status: ExamPipelineStatus }) {
  const style = EXAM_STATUS_STYLES[status] ?? EXAM_STATUS_STYLES.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${style.className}`}>
      {["researching", "extracting", "processing", "reviewing", "generating"].includes(status) && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {style.label}
    </span>
  );
}

const PAPER_STATUS_STYLES: Record<PaperStatus, string> = {
  draft: "bg-surface-grey text-ink-soft border-surface-border",
  review: "bg-cyberOrange-50 text-cyberOrange-700 border-cyberOrange-200",
  approved: "bg-maroon-50 text-maroon-500 border-maroon-100",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  archived: "bg-surface-grey text-ink-muted border-surface-border",
};

export function PaperStatusBadge({ status }: { status: PaperStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${PAPER_STATUS_STYLES[status] ?? PAPER_STATUS_STYLES.draft}`}>
      {status}
    </span>
  );
}

const STEP_LABELS: Record<string, string> = {
  research: "Web Search",
  extract: "Extraction",
  process: "Processing",
  review: "AI Reviewer",
  generate: "Paper Generation",
};

export function PipelineSteps({
  steps,
}: {
  steps: Array<{ step: string; status: "pending" | "running" | "done" | "failed"; message?: string | null }>;
}) {
  const order = ["research", "extract", "process", "review", "generate"];
  const sorted = [...steps].sort((a, b) => order.indexOf(a.step) - order.indexOf(b.step));

  return (
    <ol className="space-y-2">
      {sorted.map((step) => (
        <li key={step.step} className="flex items-start gap-3 rounded-xl border border-surface-border bg-white p-3">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
              step.status === "done"
                ? "bg-emerald-100 text-emerald-700"
                : step.status === "running"
                  ? "bg-gold-100 text-gold-700"
                  : step.status === "failed"
                    ? "bg-red-100 text-red-700"
                    : "bg-surface-grey text-ink-muted"
            }`}
          >
            {step.status === "done" ? "✓" : step.status === "failed" ? "✕" : order.indexOf(step.step) + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy">
              {STEP_LABELS[step.step] ?? step.step}
              {step.status === "running" && <span className="ml-2 animate-pulse text-xs font-normal text-gold-700">running…</span>}
            </p>
            {step.message && <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{step.message}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}