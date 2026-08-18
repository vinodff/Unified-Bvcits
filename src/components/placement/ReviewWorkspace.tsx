"use client";

import { useCallback, useEffect, useState } from "react";
import { PaperStatusBadge } from "./StatusBadges";
import type { ExamPattern, ReviewerInsights } from "@/lib/placement/types";

interface PaperListItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  total_marks: number;
  duration_minutes: number;
  sections: unknown;
  questionCount: number;
  created_at: string;
  exam_definitions: { id: string; name: string } | null;
}

interface Question {
  id: string;
  topic: string;
  subtopic: string | null;
  question_text: string;
  options: string[];
  answer: number;
  explanation: string | null;
  difficulty: string;
  source: string | null;
  source_type: string | null;
}

interface Membership {
  id: string;
  orderNo: number;
  marks: number;
  question: Question;
}

interface NewQuestionDraft {
  questionText: string;
  options: string[];
  answer: number;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  explanation?: string;
  examId: string;
}

interface ResearchBundle {
  sources: unknown;
  // Both columns are jsonb in Postgres — Supabase hands them back already
  // parsed as objects, not strings. They default to `{}` until their
  // pipeline step has run, so treat every field as possibly absent.
  pattern: Partial<ExamPattern> | null;
  processed_dataset: unknown;
  reviewer_insights: Partial<ReviewerInsights> | null;
  blueprint: unknown;
}

interface ReviewBundle {
  paper: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    total_marks: number;
    duration_minutes: number;
    sections: unknown;
    reviewed_by: string | null;
    published_at: string | null;
    exam: { id: string; name: string } | null;
  };
  memberships: Membership[];
  research: ResearchBundle | null;
  bank: Question[];
}

type Tab = "overview" | "questions" | "bank";

export function ReviewWorkspace() {
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ReviewBundle | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPapers = useCallback(async () => {
    try {
      const response = await fetch("/api/placement/papers");
      if (!response.ok) return;
      const payload = (await response.json()) as { papers: PaperListItem[] };
      setPapers(payload.papers);
      if (payload.papers.length > 0 && !selectedId) setSelectedId(payload.papers[0].id);
    } catch {
      setError("Could not load papers.");
    }
  }, [selectedId]);

  useEffect(() => {
    void loadPapers();
  }, [loadPapers]);

  const loadBundle = useCallback(async (paperId: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/placement/papers/${paperId}`);
      if (!response.ok) {
        setError("Could not load the review bundle.");
        return;
      }
      setBundle((await response.json()) as ReviewBundle);
    } catch {
      setError("Network error while loading the paper.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadBundle(selectedId);
  }, [selectedId, loadBundle]);

  const act = async (action: "approve" | "publish" | "sendBack") => {
    if (!bundle) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/placement/papers/${bundle.paper.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        setError("Action failed.");
        return;
      }
      await loadBundle(bundle.paper.id);
      await loadPapers();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const updateQuestion = async (pqId: string, patch: Record<string, unknown>) => {
    if (!bundle) return;
    try {
      const response = await fetch(`/api/placement/papers/${bundle.paper.id}/questions/${pqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        setError("Could not update the question.");
        return;
      }
      await loadBundle(bundle.paper.id);
    } catch {
      setError("Network error.");
    }
  };

  const removeQuestion = async (pqId: string) => {
    if (!bundle) return;
    try {
      const response = await fetch(`/api/placement/papers/${bundle.paper.id}/questions/${pqId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError("Could not remove the question.");
        return;
      }
      await loadBundle(bundle.paper.id);
    } catch {
      setError("Network error.");
    }
  };

  const addBankQuestion = async (questionId: string, marks: number) => {
    await addQuestion({ questionId, marks });
  };

  const addNewQuestion = async (draft: NewQuestionDraft, marks: number) => {
    await addQuestion({ draft, marks });
  };

  const addQuestion = async (
    body: { questionId: string; marks: number } | { draft: NewQuestionDraft; marks: number }
  ) => {
    if (!bundle) return;
    try {
      const response = await fetch(`/api/placement/papers/${bundle.paper.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not add the question.");
        return;
      }
      await loadBundle(bundle.paper.id);
    } catch {
      setError("Network error.");
    }
  };

  const locked = bundle?.paper.status === "published";

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Paper list */}
      <aside className="rounded-2xl border border-surface-border bg-white p-4 shadow-card">
        <h2 className="px-1 font-display text-sm font-bold uppercase tracking-wider text-ink-muted">Papers</h2>
        {papers.length === 0 && (
          <p className="mt-3 px-1 text-sm text-ink-muted">No papers yet. Run the pipeline from the admin console.</p>
        )}
        <ul className="mt-3 space-y-1.5">
          {papers.map((paper) => (
            <li key={paper.id}>
              <button
                onClick={() => setSelectedId(paper.id)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                  selectedId === paper.id
                    ? "border-crimson bg-crimson/5"
                    : "border-transparent hover:border-surface-border hover:bg-surface-grey"
                }`}
              >
                <p className="text-sm font-semibold text-navy">{paper.title}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {paper.exam_definitions?.name ?? "—"} · {paper.questionCount} Q · {paper.total_marks} marks
                </p>
                <div className="mt-1.5">
                  <PaperStatusBadge status={paper.status as never} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Bundle */}
      <section className="min-w-0">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {!bundle ? (
          <div className="rounded-2xl border border-dashed border-surface-border bg-white p-10 text-center text-sm text-ink-muted">
            {busy ? "Loading review bundle…" : "Select a paper to review."}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Paper header + actions */}
            <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-extrabold text-navy">{bundle.paper.title}</h2>
                  <p className="mt-1 text-sm text-ink-soft">
                    {bundle.paper.exam?.name} · {bundle.memberships.length} questions · {bundle.paper.total_marks}{" "}
                    marks · {bundle.paper.duration_minutes} min
                  </p>
                </div>
                <PaperStatusBadge status={bundle.paper.status as never} />
              </div>
              {bundle.paper.description && (
                <p className="mt-3 rounded-xl bg-surface-grey px-4 py-3 text-sm text-ink-soft">
                  {bundle.paper.description}
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {bundle.paper.status === "review" && (
                  <button
                    onClick={() => void act("approve")}
                    disabled={busy}
                    className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                )}
                {["approved", "review"].includes(bundle.paper.status) && (
                  <button
                    onClick={() => void act("publish")}
                    disabled={busy}
                    className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-navy transition hover:bg-gold-400 disabled:opacity-50"
                  >
                    Publish to students
                  </button>
                )}
                {!locked && bundle.paper.status !== "draft" && (
                  <button
                    onClick={() => void act("sendBack")}
                    disabled={busy}
                    className="rounded-lg border border-surface-border px-4 py-2 text-sm font-semibold text-ink-soft transition hover:bg-surface-grey disabled:opacity-50"
                  >
                    Send back to AI
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 rounded-xl border border-surface-border bg-white p-1">
              {(["overview", "questions", "bank"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold capitalize transition ${
                    tab === t ? "bg-navy text-white" : "text-ink-muted hover:text-navy"
                  }`}
                >
                  {t === "questions" ? `Questions (${bundle.memberships.length})` : t === "bank" ? `Bank (${bundle.bank.length})` : t}
                </button>
              ))}
            </div>

            {tab === "overview" && <OverviewTab research={bundle.research} />}
            {tab === "questions" && (
              <QuestionsTab
                memberships={bundle.memberships}
                locked={locked}
                onUpdate={updateQuestion}
                onRemove={removeQuestion}
              />
            )}
            {tab === "bank" && (
              <BankTab
                bank={bundle.bank}
                memberships={bundle.memberships}
                locked={locked}
                examId={bundle.paper.exam?.id ?? null}
                onAdd={addBankQuestion}
                onAddNew={addNewQuestion}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function OverviewTab({ research }: { research: ResearchBundle | null }) {
  if (!research) {
    return (
      <div className="rounded-2xl border border-surface-border bg-white p-6 text-sm text-ink-muted">
        No research artifacts on file for this exam yet.
      </div>
    );
  }
  const sources = research.sources as Array<{ title: string; url: string }> | null;
  const pattern = research.pattern;
  const insights = research.reviewer_insights;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-ink-muted">Pattern summary</h3>
        {!pattern || !pattern.sections?.length ? (
          <p className="mt-3 text-sm text-ink-muted">Pattern extraction hasn't produced sections yet.</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-ink-soft">
              {pattern.durationMinutes} min · {pattern.totalQuestions} questions
              {pattern.negativeMarking ? ` · ${pattern.negativeMarking} negative marking` : ""}
            </p>
            <ul className="mt-3 space-y-2">
              {pattern.sections.map((section) => (
                <li key={section.name} className="rounded-xl bg-surface-grey px-3 py-2 text-sm">
                  <p className="font-semibold text-navy">
                    {section.name} <span className="font-normal text-ink-muted">— {section.questionCount} Q × {section.marksPerQuestion} marks</span>
                  </p>
                  {section.topics.length > 0 && (
                    <p className="mt-0.5 text-xs text-ink-muted">{section.topics.join(", ")}</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="space-y-4">
        <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-ink-muted">
            AI reviewer insights
          </h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
            {insights?.summary || "No insights recorded."}
          </p>
          {insights?.predictions && insights.predictions.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-soft">
              {insights.predictions.slice(0, 5).map((prediction, index) => (
                <li key={index}>{prediction}</li>
              ))}
            </ul>
          )}
          {insights?.frequentlyTested && insights.frequentlyTested.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {insights.frequentlyTested.slice(0, 10).map((topic) => (
                <span key={topic} className="rounded-full bg-surface-grey px-2.5 py-1 text-xs text-ink-soft">
                  {topic}
                </span>
              ))}
            </div>
          )}
        </div>
        {sources && sources.length > 0 && (
          <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-ink-muted">Sources</h3>
            <ul className="mt-3 space-y-1.5">
              {sources.slice(0, 8).map((source, index) => (
                <li key={index}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-crimson underline-offset-2 hover:underline"
                  >
                    {source.title || source.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionsTab({
  memberships,
  locked,
  onUpdate,
  onRemove,
}: {
  memberships: Membership[];
  locked: boolean;
  onUpdate: (pqId: string, patch: Record<string, unknown>) => Promise<void>;
  onRemove: (pqId: string) => Promise<void>;
}) {
  const [draftText, setDraftText] = useState("");
  const [draftMarks, setDraftMarks] = useState(1);

  if (memberships.length === 0) {
    return (
      <div className="rounded-2xl border border-surface-border bg-white p-6 text-sm text-ink-muted">
        No questions on this paper yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {memberships.map((membership) => (
        <div key={membership.id} className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm font-semibold text-navy">
              Q{membership.orderNo}. <span className="font-normal">{membership.question.question_text}</span>
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <input
                type="number"
                min={1}
                defaultValue={membership.marks}
                disabled={locked}
                className="w-16 rounded-lg border border-surface-border px-2 py-1 text-center text-xs"
                onBlur={(event) => {
                  const marks = Number(event.target.value);
                  if (marks >= 1 && marks !== membership.marks) void onUpdate(membership.id, { marks });
                }}
              />
              <button
                onClick={() => void onRemove(membership.id)}
                disabled={locked}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-surface-grey px-2.5 py-1 text-ink-soft">{membership.question.topic}</span>
            <span className="rounded-full bg-surface-grey px-2.5 py-1 text-ink-soft capitalize">
              {membership.question.difficulty}
            </span>
            <span className="rounded-full bg-surface-grey px-2.5 py-1 text-ink-soft">
              {membership.question.source_type === "faculty" ? "Faculty added" : "AI generated"}
            </span>
          </div>
          <ul className="mt-3 space-y-1">
            {membership.question.options.map((option, index) => (
              <li
                key={index}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  index === membership.question.answer
                    ? "bg-emerald-50 font-medium text-emerald-800"
                    : "bg-surface-grey text-ink-soft"
                }`}
              >
                {String.fromCharCode(65 + index)}. {option}
                {index === membership.question.answer && <span className="ml-2 text-xs">(correct)</span>}
              </li>
            ))}
          </ul>
          {membership.question.explanation && (
            <p className="mt-3 rounded-xl bg-surface-grey px-4 py-2.5 text-xs leading-relaxed text-ink-soft">
              <span className="font-semibold">Explanation: </span>
              {membership.question.explanation}
            </p>
          )}
          {!locked && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink-muted">Quick edit</p>
              <div className="mt-1.5 flex gap-2">
                <input
                  value={draftText === "" ? membership.question.question_text : draftText}
                  onChange={(event) => setDraftText(event.target.value)}
                  placeholder="Edit question text…"
                  className="flex-1 rounded-lg border border-surface-border bg-surface-form px-3 py-2 text-sm outline-none focus:border-crimson"
                />
                <input
                  type="number"
                  min={0}
                  max={membership.question.options.length - 1}
                  placeholder={`Answer 0-${membership.question.options.length - 1}`}
                  className="w-20 rounded-lg border border-surface-border bg-surface-form px-2 py-2 text-sm outline-none focus:border-crimson"
                  onChange={(event) => {
                    const answer = Number(event.target.value);
                    if (Number.isInteger(answer) && answer >= 0 && answer < membership.question.options.length) {
                      void onUpdate(membership.id, { question: { answer } });
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (draftText.trim().length >= 5 && draftText.trim() !== membership.question.question_text) {
                      void onUpdate(membership.id, { question: { questionText: draftText.trim() } });
                    }
                    setDraftText("");
                  }}
                  className="rounded-lg bg-navy px-3 py-2 text-xs font-semibold text-white"
                >
                  Save text
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BankTab({
  bank,
  memberships,
  locked,
  examId,
  onAdd,
  onAddNew,
}: {
  bank: Question[];
  memberships: Membership[];
  locked: boolean;
  examId: string | null;
  onAdd: (questionId: string, marks: number) => Promise<void>;
  onAddNew: (draft: NewQuestionDraft, marks: number) => Promise<void>;
}) {
  const [marks, setMarks] = useState(1);
  const inPaper = new Set(memberships.map((m) => m.question.id));
  const available = bank.filter((q) => !inPaper.has(q.id));

  return (
    <div className="space-y-3">
      {!locked && examId && <NewQuestionForm examId={examId} onCreate={onAddNew} />}

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          {available.length} of {bank.length} bank questions not yet on the paper.
        </p>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          Marks
          <input
            type="number"
            min={1}
            value={marks}
            onChange={(event) => setMarks(Math.max(1, Number(event.target.value)))}
            className="w-16 rounded-lg border border-surface-border px-2 py-1 text-center"
          />
        </label>
      </div>
      {available.length === 0 && (
        <div className="rounded-2xl border border-dashed border-surface-border bg-white p-6 text-sm text-ink-muted">
          Every bank question is already on the paper.
        </div>
      )}
      {available.map((question) => (
        <div key={question.id} className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-navy">
              <span className="font-semibold">{question.topic}: </span>
              {question.question_text}
            </p>
            {!locked && (
              <button
                onClick={() => void onAdd(question.id, marks)}
                className="shrink-0 rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-navy transition hover:bg-gold-400"
              >
                Add to paper
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-surface-grey px-2.5 py-1 text-ink-soft capitalize">{question.difficulty}</span>
            <span className="rounded-full bg-surface-grey px-2.5 py-1 text-ink-soft">
              {question.source_type === "faculty" ? "Faculty" : question.source ?? "AI generated"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

const EMPTY_OPTIONS = ["", "", "", ""];

function NewQuestionForm({
  examId,
  onCreate,
}: {
  examId: string;
  onCreate: (draft: NewQuestionDraft, marks: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [options, setOptions] = useState<string[]>(EMPTY_OPTIONS);
  const [answer, setAnswer] = useState(0);
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<NewQuestionDraft["difficulty"]>("medium");
  const [explanation, setExplanation] = useState("");
  const [marks, setMarks] = useState(1);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setQuestionText("");
    setOptions(EMPTY_OPTIONS);
    setAnswer(0);
    setTopic("");
    setDifficulty("medium");
    setExplanation("");
    setMarks(1);
    setFormError(null);
  };

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((option, i) => (i === index ? value : option)));
  };

  const submit = async () => {
    const trimmedOptions = options.map((o) => o.trim());
    const filledOptions = trimmedOptions.filter(Boolean);
    if (questionText.trim().length < 5) {
      setFormError("Question text needs at least 5 characters.");
      return;
    }
    if (filledOptions.length < 2) {
      setFormError("Provide at least 2 options.");
      return;
    }
    if (!trimmedOptions[answer]) {
      setFormError("Pick a correct answer among the filled options.");
      return;
    }
    if (!topic.trim()) {
      setFormError("Topic is required.");
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      await onCreate(
        {
          questionText: questionText.trim(),
          options: trimmedOptions,
          answer,
          topic: topic.trim(),
          difficulty,
          explanation: explanation.trim() || undefined,
          examId,
        },
        marks
      );
      reset();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-dashed border-surface-border bg-white px-4 py-3 text-sm font-semibold text-ink-soft transition hover:border-crimson/40 hover:text-crimson"
      >
        + Write a new question
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-crimson/30 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-ink-muted">New question</h3>
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-xs font-semibold text-ink-muted hover:text-navy"
        >
          Cancel
        </button>
      </div>

      {formError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{formError}</p>}

      <textarea
        value={questionText}
        onChange={(event) => setQuestionText(event.target.value)}
        placeholder="Question text…"
        rows={2}
        className="mt-3 w-full rounded-lg border border-surface-border bg-surface-form px-3 py-2 text-sm outline-none focus:border-crimson"
      />

      <div className="mt-3 space-y-2">
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="radio"
              name="new-question-answer"
              checked={answer === index}
              onChange={() => setAnswer(index)}
              className="shrink-0"
            />
            <input
              value={option}
              onChange={(event) => updateOption(index, event.target.value)}
              placeholder={`Option ${String.fromCharCode(65 + index)}`}
              className="flex-1 rounded-lg border border-surface-border bg-surface-form px-3 py-1.5 text-sm outline-none focus:border-crimson"
            />
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-ink-muted">Select the radio button next to the correct option.</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="Topic"
          className="rounded-lg border border-surface-border bg-surface-form px-3 py-2 text-sm outline-none focus:border-crimson"
        />
        <select
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value as NewQuestionDraft["difficulty"])}
          className="rounded-lg border border-surface-border bg-surface-form px-3 py-2 text-sm outline-none focus:border-crimson"
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <input
          type="number"
          min={1}
          value={marks}
          onChange={(event) => setMarks(Math.max(1, Number(event.target.value)))}
          placeholder="Marks"
          className="rounded-lg border border-surface-border bg-surface-form px-3 py-2 text-sm outline-none focus:border-crimson"
        />
        <button
          onClick={() => void submit()}
          disabled={saving}
          className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add to paper"}
        </button>
      </div>

      <textarea
        value={explanation}
        onChange={(event) => setExplanation(event.target.value)}
        placeholder="Explanation (optional)…"
        rows={2}
        className="mt-2 w-full rounded-lg border border-surface-border bg-surface-form px-3 py-2 text-sm outline-none focus:border-crimson"
      />
    </div>
  );
}