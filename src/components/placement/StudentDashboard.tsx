"use client";

import { useCallback, useEffect, useState } from "react";

interface PublishedPaper {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  total_marks: number;
  questionCount: number;
  published_at: string;
  exam_definitions: { id: string; name: string } | null;
}

interface AttemptHistory {
  id: string;
  status: string;
  score: number | null;
  total_marks: number | null;
  percent: number | null;
  percentile: number | null;
  violation_count: number;
  started_at: string;
  submitted_at: string | null;
  papers: { id: string; title: string; exam_definitions: { name: string } | null } | null;
}

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  submitted: "Submitted",
  auto_submitted: "Auto-submitted",
  abandoned: "Abandoned",
};

export function StudentDashboard() {
  const [papers, setPapers] = useState<PublishedPaper[]>([]);
  const [attempts, setAttempts] = useState<AttemptHistory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [papersResponse, attemptsResponse] = await Promise.all([
        fetch("/api/placement/papers/public"),
        fetch("/api/placement/attempts"),
      ]);
      if (papersResponse.ok) {
        const payload = (await papersResponse.json()) as { papers: PublishedPaper[] };
        setPapers(payload.papers);
      }
      if (attemptsResponse.ok) {
        const payload = (await attemptsResponse.json()) as { attempts: AttemptHistory[] };
        setAttempts(payload.attempts);
      }
    } catch {
      setError("Could not load the dashboard.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startAttempt = async (paperId: string) => {
    setStartingId(paperId);
    setError(null);
    try {
      const response = await fetch("/api/placement/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId }),
      });
      const payload = (await response.json()) as { error?: string; attempt?: { id: string } };
      if (!response.ok) {
        setError(payload.error ?? "Could not start the attempt.");
        return;
      }
      window.location.href = `/placement-portal/exam/${paperId}?attempt=${payload.attempt?.id}`;
    } catch {
      setError("Network error while starting the attempt.");
    } finally {
      setStartingId(null);
    }
  };

  const liveAttempt = attempts.find((a) => a.status === "in_progress");

  return (
    <div className="space-y-10">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {liveAttempt && (
        <section className="rounded-2xl border border-gold-300 bg-gold-50 p-6 shadow-card">
          <p className="text-xs font-bold uppercase tracking-wider text-gold-700">Active attempt</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold text-navy">{liveAttempt.papers?.title}</h2>
              <p className="text-sm text-ink-soft">
                {liveAttempt.papers?.exam_definitions?.name} · started{" "}
                {new Date(liveAttempt.started_at).toLocaleTimeString()}
              </p>
            </div>
            <a
              href={`/placement-portal/exam/${liveAttempt.papers?.id}?attempt=${liveAttempt.id}`}
              className="rounded-lg bg-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700"
            >
              Resume exam →
            </a>
          </div>
        </section>
      )}

      {/* Available papers */}
      <section>
        <h2 className="font-display text-xl font-extrabold text-navy">Available exams</h2>
        {papers.length === 0 && (
          <p className="mt-3 rounded-xl border border-dashed border-surface-border bg-white p-6 text-sm text-ink-muted">
            No published exams yet. Faculty will publish predicted papers here.
          </p>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {papers.map((paper) => (
            <div key={paper.id} className="flex flex-col rounded-2xl border border-surface-border bg-white p-6 shadow-card">
              <p className="text-xs font-bold uppercase tracking-wider text-crimson">
                {paper.exam_definitions?.name ?? "Exam"}
              </p>
              <h3 className="mt-1.5 font-display text-lg font-bold text-navy">{paper.title}</h3>
              {paper.description && <p className="mt-1.5 text-sm text-ink-soft">{paper.description}</p>}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-muted">
                <span className="rounded-full bg-surface-grey px-2.5 py-1">{paper.questionCount} questions</span>
                <span className="rounded-full bg-surface-grey px-2.5 py-1">{paper.total_marks} marks</span>
                <span className="rounded-full bg-surface-grey px-2.5 py-1">{paper.duration_minutes} min</span>
              </div>
              <div className="mt-auto pt-4">
                <button
                  onClick={() => void startAttempt(paper.id)}
                  disabled={startingId === paper.id}
                  className="w-full rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-navy transition hover:bg-gold-400 disabled:opacity-50"
                >
                  {startingId === paper.id ? "Starting…" : "Start exam"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* History */}
      <section>
        <h2 className="font-display text-xl font-extrabold text-navy">Your attempts</h2>
        {attempts.length === 0 && (
          <p className="mt-3 text-sm text-ink-muted">You have not attempted any exams yet.</p>
        )}
        {attempts.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-surface-border bg-white shadow-card">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-surface-border bg-surface-grey text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Paper</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Score</th>
                  <th className="px-4 py-3 font-semibold">Percentile</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {attempts.map((attempt) => (
                  <tr key={attempt.id} className="hover:bg-surface-grey/50">
                    <td className="px-4 py-3 font-medium text-navy">
                      {attempt.papers?.title ?? "—"}
                      <span className="block text-xs font-normal text-ink-muted">
                        {attempt.papers?.exam_definitions?.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          attempt.status === "in_progress"
                            ? "bg-gold-100 text-gold-700"
                            : "bg-surface-grey text-ink-soft"
                        }`}
                      >
                        {STATUS_LABELS[attempt.status] ?? attempt.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {attempt.percent === null ? (
                        "—"
                      ) : (
                        <>
                          <span className="font-semibold text-navy">{attempt.percent}%</span>
                          <span className="block text-xs text-ink-muted">
                            {attempt.score}/{attempt.total_marks}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {attempt.percentile === null ? "—" : `${attempt.percentile}%`}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {new Date(attempt.started_at).toLocaleDateString()}
                      {attempt.violation_count > 0 && (
                        <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                          {attempt.violation_count} alerts
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {["submitted", "auto_submitted"].includes(attempt.status) && (
                        <a
                          href={`/placement-portal/result/${attempt.id}`}
                          className="text-sm font-semibold text-crimson hover:underline"
                        >
                          Result →
                        </a>
                      )}
                      {attempt.status === "in_progress" && attempt.papers && (
                        <a
                          href={`/placement-portal/exam/${attempt.papers.id}?attempt=${attempt.id}`}
                          className="text-sm font-semibold text-crimson hover:underline"
                        >
                          Resume →
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}