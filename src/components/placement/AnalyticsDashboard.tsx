"use client";

import { useCallback, useEffect, useState } from "react";

interface StatsPayload {
  paper: { id: string; title: string; examName: string; totalMarks: number };
  summary: {
    totalAttempts: number;
    avgPercent: number;
    highestPercent: number | null;
    lowestPercent: number | null;
    avgTimeSec: number | null;
  };
  distribution: Array<{ label: string; count: number }>;
  topics: Array<{ topic: string; attempts: number; correct: number; accuracy: number; avgTimeSec: number | null }>;
  violationTypes: Array<{ type: string; count: number }>;
  attempts: Array<{
    id: string;
    studentName: string;
    rollNumber: string | null;
    percent: number;
    score: number;
    timeTakenSec: number | null;
    violationCount: number;
    status: string;
    startedAt: string;
  }>;
}

export function AnalyticsDashboard() {
  const [papers, setPapers] = useState<Array<{ id: string; title: string }>>([]);
  const [paperId, setPaperId] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPapers = useCallback(async () => {
    try {
      const response = await fetch("/api/placement/papers");
      if (!response.ok) return;
      const payload = (await response.json()) as {
        papers: Array<{ id: string; title: string }>;
      };
      setPapers(payload.papers);
      if (payload.papers.length > 0 && !paperId) setPaperId(payload.papers[0].id);
    } catch {
      setError("Could not load papers.");
    }
  }, [paperId]);

  useEffect(() => {
    void loadPapers();
  }, [loadPapers]);

  const loadStats = useCallback(async (selectedId: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/placement/stats?paperId=${encodeURIComponent(selectedId)}`);
      if (!response.ok) {
        setError("Could not load analytics.");
        return;
      }
      setStats((await response.json()) as StatsPayload);
    } catch {
      setError("Network error while loading analytics.");
    }
  }, []);

  useEffect(() => {
    if (paperId) void loadStats(paperId);
  }, [paperId, loadStats]);

  const maxBand = Math.max(1, ...(stats?.distribution.map((d) => d.count) ?? [1]));
  const maxTopicAttempts = Math.max(1, ...(stats?.topics.map((t) => t.attempts) ?? [1]));
  const maxViolation = Math.max(1, ...(stats?.violationTypes.map((v) => v.count) ?? [1]));

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <label className="flex items-center gap-2 text-sm text-ink-muted">
        Paper
        <select
          value={paperId ?? ""}
          onChange={(event) => setPaperId(event.target.value)}
          className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-crimson"
        >
          {papers.map((paper) => (
            <option key={paper.id} value={paper.id}>
              {paper.title}
            </option>
          ))}
        </select>
      </label>

      {!stats ? (
        <div className="rounded-2xl border border-dashed border-surface-border bg-white p-10 text-center text-sm text-ink-muted">
          {papers.length === 0 ? "No papers yet — analytics appear once students attempt a published paper." : "Loading analytics…"}
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              [String(stats.summary.totalAttempts), "Attempts"],
              [`${stats.summary.avgPercent}%`, "Average score"],
              [stats.summary.highestPercent === null ? "—" : `${stats.summary.highestPercent}%`, "Highest score"],
              [
                stats.summary.avgTimeSec === null
                  ? "—"
                  : `${Math.floor(stats.summary.avgTimeSec / 60)}m ${stats.summary.avgTimeSec % 60}s`,
                "Average time",
              ],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
                <p className="font-display text-2xl font-extrabold text-navy">{value}</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-ink-muted">{label}</p>
              </div>
            ))}
          </section>

          {/* Distribution */}
          <section className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
            <h2 className="font-display text-lg font-bold text-navy">Score distribution</h2>
            <div className="mt-4 flex h-40 items-end gap-4">
              {stats.distribution.map((band) => (
                <div key={band.label} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-sm font-bold text-navy">{band.count}</span>
                  <div
                    className="w-full rounded-t-lg bg-navy transition-all"
                    style={{ height: `${(band.count / maxBand) * 100}%`, minHeight: band.count > 0 ? 8 : 2 }}
                  />
                  <span className="text-xs text-ink-muted">{band.label}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Topic performance */}
            <section className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
              <h2 className="font-display text-lg font-bold text-navy">Topic performance</h2>
              {stats.topics.length === 0 && <p className="mt-3 text-sm text-ink-muted">No answer data yet.</p>}
              <div className="mt-4 space-y-3">
                {stats.topics.map((topic) => (
                  <div key={topic.topic}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-navy">{topic.topic}</span>
                      <span className="text-xs text-ink-muted">
                        {topic.accuracy}% acc · {topic.avgTimeSec === null ? "—" : `${topic.avgTimeSec}s`} avg
                      </span>
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      <div
                        className={`h-2 rounded-full ${topic.accuracy >= 75 ? "bg-emerald-600" : topic.accuracy >= 50 ? "bg-gold" : "bg-red-500"}`}
                        style={{ width: `${(topic.attempts / maxTopicAttempts) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Violations */}
            <section className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
              <h2 className="font-display text-lg font-bold text-navy">Proctoring alerts</h2>
              {stats.violationTypes.length === 0 && (
                <p className="mt-3 text-sm text-ink-muted">No alerts recorded. Clean sessions.</p>
              )}
              <div className="mt-4 space-y-3">
                {stats.violationTypes.map((violation) => (
                  <div key={violation.type} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-sm text-ink-soft capitalize">{violation.type.replace(/_/g, " ")}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-grey">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${(violation.count / maxViolation) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right text-sm font-bold text-navy">{violation.count}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Attempts table */}
          <section className="overflow-x-auto rounded-2xl border border-surface-border bg-white shadow-card">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-surface-border bg-surface-grey text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Score</th>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Alerts</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {stats.attempts.map((attempt) => (
                  <tr key={attempt.id} className="hover:bg-surface-grey/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy">{attempt.studentName}</p>
                      {attempt.rollNumber && <p className="text-xs text-ink-muted">{attempt.rollNumber}</p>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-navy">{attempt.percent}%</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {attempt.timeTakenSec === null
                        ? "—"
                        : `${Math.floor(attempt.timeTakenSec / 60)}m ${attempt.timeTakenSec % 60}s`}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          attempt.violationCount > 3
                            ? "bg-red-100 text-red-700"
                            : attempt.violationCount > 0
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {attempt.violationCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-ink-soft">{attempt.status.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/placement-portal/result/${attempt.id}`}
                        className="text-sm font-semibold text-crimson hover:underline"
                      >
                        View →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}