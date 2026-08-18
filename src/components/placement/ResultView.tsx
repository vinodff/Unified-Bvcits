"use client";

import { useCallback, useEffect, useState } from "react";

interface ResultPayload {
  attempt: {
    id: string;
    status: string;
    score: number;
    totalMarks: number;
    percent: number;
    percentile: number | null;
    timeTakenSec: number | null;
    violationCount: number;
    violations: Array<{ type: string; detail: string; occurredAt: string }>;
    startedAt: string;
    submittedAt: string | null;
    paper: { id: string; title: string; examName: string; durationMinutes: number };
  };
  answers: Array<{
    selectedIndex: number | null;
    isCorrect: boolean | null;
    marksObtained: number;
    timeTakenSec: number | null;
    markedForReview: boolean;
    answered: boolean;
    orderNo: number;
    marks: number;
    topic: string;
    questionText: string;
    options: string[];
    correctAnswer: number;
    explanation: string | null;
  }>;
}

export function ResultView({ attemptId }: { attemptId: string }) {
  const [payload, setPayload] = useState<ResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/placement/attempts/${attemptId}`);
      if (!response.ok) {
        setError("Could not load this result.");
        return;
      }
      setPayload((await response.json()) as ResultPayload);
    } catch {
      setError("Network error while loading the result.");
    }
  }, [attemptId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-semibold text-red-700">{error}</p>
      </div>
    );
  }
  if (!payload) {
    return <div className="py-10 text-center text-sm text-ink-muted">Loading result…</div>;
  }

  const { attempt, answers } = payload;
  const correctCount = answers.filter((a) => a.isCorrect).length;
  const wrongCount = answers.filter((a) => a.answered && !a.isCorrect).length;
  const unansweredCount = answers.filter((a) => !a.answered).length;
  const mins = attempt.timeTakenSec === null ? null : Math.floor(attempt.timeTakenSec / 60);
  const secs = attempt.timeTakenSec === null ? 0 : attempt.timeTakenSec % 60;

  const band =
    attempt.percent >= 75 ? { label: "Strong", className: "bg-emerald-100 text-emerald-800", message: "Well done — you are ahead of most students on this predicted paper." }
    : attempt.percent >= 50 ? { label: "On track", className: "bg-gold-100 text-gold-800", message: "Solid attempt. Focus on the topics below to push into the top band." }
    : attempt.percent >= 25 ? { label: "Developing", className: "bg-amber-100 text-amber-800", message: "The pattern is emerging — redo the weak topics, then take the paper again." }
    : { label: "Needs work", className: "bg-red-100 text-red-800", message: "Start with the fundamentals of the weak topics below and retake this paper." };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Score hero */}
      <section className="overflow-hidden rounded-3xl bg-navy text-white shadow-card">
        <div className="grid gap-6 p-8 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Result · {attempt.paper.examName}</p>
            <h1 className="mt-2 font-display text-2xl font-extrabold">{attempt.paper.title}</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${band.className}`}>{band.label}</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs">{attempt.percent}% score</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs">
                Percentile {attempt.percentile === null ? "—" : `#${attempt.percentile}`}
              </span>
            </div>
            <p className="mt-4 max-w-md text-sm text-white/70">{band.message}</p>
          </div>
          <div className="flex h-36 w-36 shrink-0 flex-col items-center justify-center rounded-full border-4 border-gold">
            <p className="font-display text-3xl font-extrabold text-gold">{attempt.percent}%</p>
            <p className="text-xs text-white/70">
              {attempt.score}/{attempt.totalMarks}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-white/10 border-t border-white/10 sm:grid-cols-4">
          {[
            [correctCount, "Correct"],
            [wrongCount, "Wrong"],
            [unansweredCount, "Unanswered"],
            [mins === null ? "—" : `${mins}m ${secs}s`, "Time taken"],
          ].map(([value, label]) => (
            <div key={label as string} className="px-4 py-4 text-center">
              <p className="font-display text-lg font-extrabold">{value}</p>
              <p className="text-[11px] uppercase tracking-wider text-white/50">{label}</p>
            </div>
          ))}
        </div>
        {attempt.violationCount > 0 && (
          <p className="border-t border-white/10 px-8 py-3 text-xs text-amber-300">
            ⚠ {attempt.violationCount} proctoring alert{attempt.violationCount > 1 ? "s" : ""} recorded during this
            attempt (tab switches, fullscreen exits, …). Staff can see them in analytics.
          </p>
        )}
      </section>

      {/* Topic breakdown */}
      <section className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">Topic breakdown</h2>
        <div className="mt-4 space-y-3">
          {Object.entries(
            answers.reduce<Record<string, { correct: number; total: number }>>((acc, answer) => {
              const entry = acc[answer.topic] ?? { correct: 0, total: 0 };
              entry.total += 1;
              if (answer.isCorrect) entry.correct += 1;
              acc[answer.topic] = entry;
              return acc;
            }, {})
          ).map(([topic, stats]) => {
            const pct = Math.round((stats.correct / stats.total) * 100);
            return (
              <div key={topic}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-navy">{topic}</span>
                  <span className="text-xs text-ink-muted">
                    {stats.correct}/{stats.total} · {pct}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-grey">
                  <div
                    className={`h-full rounded-full ${pct >= 75 ? "bg-emerald-600" : pct >= 50 ? "bg-gold" : "bg-red-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Question-by-question review */}
      <section>
        <h2 className="font-display text-lg font-bold text-navy">Question review</h2>
        <div className="mt-4 space-y-4">
          {answers.map((answer) => (
            <div
              key={answer.orderNo}
              className={`rounded-2xl border bg-white p-5 shadow-card ${
                answer.isCorrect ? "border-emerald-200" : answer.answered ? "border-red-200" : "border-surface-border"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-navy">
                  Q{answer.orderNo}. <span className="font-normal">{answer.questionText}</span>
                </p>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                    answer.isCorrect
                      ? "bg-emerald-100 text-emerald-800"
                      : answer.answered
                        ? "bg-red-100 text-red-800"
                        : "bg-surface-grey text-ink-muted"
                  }`}
                >
                  {answer.isCorrect
                    ? `+${answer.marksObtained}`
                    : answer.answered
                      ? `−${answer.marksObtained}`
                      : "Skipped"}
                </span>
              </div>
              <ul className="mt-3 space-y-1">
                {answer.options.map((option, index) => {
                  const isCorrect = index === answer.correctAnswer;
                  const isSelected = index === answer.selectedIndex;
                  const cls = isCorrect
                    ? "bg-emerald-50 font-medium text-emerald-800 border-emerald-200"
                    : isSelected
                      ? "bg-red-50 text-red-800 border-red-200"
                      : "bg-surface-grey text-ink-soft";
                  return (
                    <li key={index} className={`rounded-lg border px-3 py-1.5 text-sm ${cls}`}>
                      {String.fromCharCode(65 + index)}. {option}
                      {isCorrect && <span className="ml-2 text-xs">✓ correct</span>}
                      {isSelected && !isCorrect && <span className="ml-2 text-xs">(your answer)</span>}
                    </li>
                  );
                })}
              </ul>
              {answer.explanation && (
                <p className="mt-3 rounded-xl bg-surface-grey px-4 py-2.5 text-xs leading-relaxed text-ink-soft">
                  <span className="font-semibold">Explanation: </span>
                  {answer.explanation}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="flex gap-3 pb-10">
        <a
          href="/placement-portal/exams"
          className="rounded-xl bg-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700"
        >
          Back to dashboard
        </a>
        <a
          href={`/placement-portal/exam/${attempt.paper.id}`}
          className="rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-navy transition hover:bg-gold-400"
        >
          Retake this paper
        </a>
      </div>
    </div>
  );
}