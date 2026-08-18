"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExamStatusBadge, PipelineSteps } from "./StatusBadges";

interface ExamRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface StepRow {
  step: string;
  status: "pending" | "running" | "done" | "failed";
  message: string | null;
}

interface ExamWithSteps extends ExamRow {
  steps: StepRow[];
}

export function AdminConsole() {
  const [exams, setExams] = useState<ExamWithSteps[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const pollingRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/placement/exams");
      if (!response.ok) {
        setError("Could not load exams.");
        return;
      }
      const payload = (await response.json()) as { exams: Array<ExamRow & { exam_research?: unknown }> };
      const rows: ExamWithSteps[] = [];
      for (const exam of payload.exams) {
        if (["researching", "extracting", "processing", "reviewing", "generating"].includes(exam.status)) {
          pollingRef.current.add(exam.id);
        }
        let steps: StepRow[] = [];
        if (pollingRef.current.has(exam.id)) {
          try {
            const statusResponse = await fetch(`/api/placement/exams/${exam.id}`);
            if (statusResponse.ok) {
              const statusPayload = (await statusResponse.json()) as { steps?: StepRow[] };
              steps = statusPayload.steps ?? [];
            }
          } catch {
            // Poll failures are transient; the row keeps its exam-level status.
          }
        }
        rows.push({ ...exam, steps });
      }
      setExams(rows);
      setError(null);
    } catch {
      setError("Network error while loading exams.");
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 4000);
    return () => clearInterval(interval);
  }, [load]);

  const createExam = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/placement/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const payload = (await response.json()) as { error?: string; exam?: ExamRow };
      if (!response.ok) {
        setError(payload.error ?? "Could not create the exam.");
        return;
      }
      setName("");
      setDescription("");
      await load();
    } catch {
      setError("Network error while creating the exam.");
    } finally {
      setBusy(false);
    }
  };

  const runPipeline = async (examId: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/placement/exams/${examId}`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not start the pipeline.");
        return;
      }
      pollingRef.current.add(examId);
      await load();
    } catch {
      setError("Network error while starting the pipeline.");
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Create exam */}
      <section className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">Create an exam request</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Enter the exam name — the pipeline researches the real internet, builds a predicted paper, and hands it to
          the review workspace.
        </p>
        <form onSubmit={createExam} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Exam name (e.g. TCS NQT)"
            required
            minLength={2}
            maxLength={120}
            className="rounded-lg border border-surface-border bg-surface-form px-3 py-2.5 text-sm outline-none focus:border-crimson"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional description (target audience, year…)"
            className="rounded-lg border border-surface-border bg-surface-form px-3 py-2.5 text-sm outline-none focus:border-crimson"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create & research"}
          </button>
        </form>
      </section>

      {/* Exam list */}
      <section>
        <h2 className="font-display text-lg font-bold text-navy">Exam requests</h2>
        {exams.length === 0 && (
          <p className="mt-3 rounded-xl border border-dashed border-surface-border bg-white p-6 text-sm text-ink-muted">
            No exams yet. Create one above — try “TCS NQT”.
          </p>
        )}
        <div className="mt-4 space-y-4">
          {exams.map((exam) => (
            <div key={exam.id} className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-bold text-navy">{exam.name}</h3>
                  {exam.description && <p className="mt-0.5 text-sm text-ink-soft">{exam.description}</p>}
                  <p className="mt-1 text-xs text-ink-muted">
                    Created {new Date(exam.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <ExamStatusBadge status={exam.status as never} />
                  {["draft", "failed"].includes(exam.status) && (
                    <button
                      onClick={() => void runPipeline(exam.id)}
                      className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-navy transition hover:bg-gold-400"
                    >
                      {exam.status === "failed" ? "Retry pipeline" : "Run AI pipeline"}
                    </button>
                  )}
                  {["review", "approved"].includes(exam.status) && (
                    <a
                      href="/placement-portal/review"
                      className="rounded-lg border border-navy px-4 py-2 text-sm font-semibold text-navy transition hover:bg-navy hover:text-white"
                    >
                      Review paper →
                    </a>
                  )}
                </div>
              </div>

              {exam.status === "failed" && exam.error_message && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{exam.error_message}</p>
              )}

              {pollingRef.current.has(exam.id) && (
                <div className="mt-4">
                  <PipelineSteps steps={exam.steps} />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}