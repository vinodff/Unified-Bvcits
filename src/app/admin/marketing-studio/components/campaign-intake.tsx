"use client";

// Guided intake — the interview an admin walks through before any agent runs.
//
// The flow deliberately mirrors how a colleague would take a brief:
//   describe → gaps → photos → confirm
//
// It opens with a single free-text box rather than a form, because an admin
// describing an event in their own words ("we ran a hackathon in CSE today,
// around 50 students, chief guest was Dr Rao") answers half the questions in
// one go. Extraction takes what it recognises and the wizard only asks about
// what is genuinely still missing — so the interview gets shorter the more the
// admin writes, instead of being a fixed wall of fields.

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type IntakePayload, type IntakeStep } from "../api";
import { Button, Card, ErrorNote, Pill, SectionTitle, inputCls, useBusy } from "../ui";

const PHASE_COPY: Record<IntakePayload["phase"], { eyebrow: string; title: string }> = {
  describe: { eyebrow: "Step 1 of 4", title: "Tell me about it" },
  gaps: { eyebrow: "Step 2 of 4", title: "A few details I still need" },
  photos: { eyebrow: "Step 3 of 4", title: "Photographs" },
  confirm: { eyebrow: "Step 4 of 4", title: "Check this over" },
};

export function CampaignIntake({
  id,
  onGenerate,
  onOpenCampaign,
}: {
  id: string;
  onGenerate: () => void;
  onOpenCampaign: () => void;
}) {
  const [data, setData] = useState<IntakePayload | null>(null);
  const [brief, setBrief] = useState("");
  const [answer, setAnswer] = useState("");
  const [editing, setEditing] = useState<IntakeStep | null>(null);
  const [understood, setUnderstood] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { busy, error, wrap } = useBusy();
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.intake(id));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // A fresh question needs a blank field — otherwise the previous answer is
  // still sitting there and an admin can submit it twice without noticing.
  const apply = (next: IntakePayload & { understood?: string[] }) => {
    setData(next);
    setAnswer("");
    setEditing(null);
    if (next.understood) setUnderstood(next.understood);
  };

  if (loadError) return <ErrorNote message={loadError} />;
  if (!data) return <Card><p className="text-sm text-ink-muted">Loading the interview…</p></Card>;

  const step = editing ?? data.step;
  const phase = editing ? "gaps" : data.phase;
  const copy = PHASE_COPY[phase];
  const pct = data.total ? Math.round((data.answered / data.total) * 100) : 0;

  const submitBrief = () =>
    void wrap(async () => {
      apply(await api.intakeBrief(id, brief));
      setBrief("");
    });

  const submitAnswer = () => {
    if (!step || !answer.trim()) return;
    void wrap(async () => apply(await api.intakeAnswer(id, step.field, answer)));
  };

  const skip = () => {
    if (!step) return;
    void wrap(async () => apply(await api.intakeSkip(id, step.field)));
  };

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    void wrap(async () => {
      await api.uploadAssets(id, Array.from(files));
      apply(await api.intake(id));
    });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        eyebrow={copy.eyebrow}
        title={copy.title}
        right={<Button variant="ghost" onClick={onOpenCampaign}>Open full campaign</Button>}
      />

      <div className="mb-5">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
          <span>{data.campaign.title}</span>
          <span>{data.answered} of {data.total} answered</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-border">
          <div className="h-full rounded-full bg-gold transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ErrorNote message={error} />

      {understood && understood.length > 0 && phase !== "describe" && (
        <div className="mb-4 rounded-xl border border-gold/30 bg-goldLight/20 px-4 py-3">
          <p className="text-xs text-ink-soft">
            <span className="font-semibold text-goldDark">Picked up from your description:</span>{" "}
            {understood.join(", ")}.
          </p>
        </div>
      )}

      {phase === "describe" && (
        <Card>
          <p className="mb-3 text-sm text-ink-soft">
            Describe it the way you would to a colleague — what happened, when, where, who was involved,
            who won, what the prizes were. Anything you mention here I won&apos;t ask again.
          </p>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={7}
            autoFocus
            placeholder="Today we conducted a hackathon in the Department of CSE. Around 50 students took part. We invited some guests from outside. First prize went to Team Alpha…"
            className={`${inputCls} resize-y leading-relaxed`}
          />
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">
              The more you write, the fewer questions follow.
            </p>
            <Button onClick={submitBrief} disabled={busy || brief.trim().length < 15}>
              {busy ? "Reading…" : "Continue"}
            </Button>
          </div>
        </Card>
      )}

      {phase === "gaps" && step && (
        <Card>
          <div className="mb-1 flex items-center gap-2">
            <Pill tone={step.required ? "success" : "neutral"}>{step.required ? "Required" : "Optional"}</Pill>
            {editing && <span className="text-[11px] text-ink-muted">editing an earlier answer</span>}
          </div>
          <p className="font-display text-lg font-bold text-navy">{step.prompt}</p>
          {step.help && <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{step.help}</p>}

          <div className="mt-4">
            <AnswerInput step={step} value={answer} onChange={setAnswer} onSubmit={submitAnswer} />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            {step.required ? (
              <p className="text-xs text-ink-muted">This one is needed before generation can start.</p>
            ) : (
              <button onClick={skip} disabled={busy} className="text-xs text-ink-muted underline-offset-4 hover:text-goldDark hover:underline disabled:opacity-40">
                I don&apos;t have this — skip
              </button>
            )}
            <Button onClick={submitAnswer} disabled={busy || !answer.trim()}>
              {busy ? "Saving…" : "Next"}
            </Button>
          </div>
        </Card>
      )}

      {phase === "photos" && (
        <Card>
          <p className="font-display text-lg font-bold text-navy">
            {data.photosRequired ? "Upload the photographs" : "Add photos (optional)"}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
            {data.photosRequired
              ? "At least one real photograph is required before generation starts. The creative agent composes your photos into posters — it never generates people or invents a scene."
              : "This campaign is dated in the future, so there may be nothing to upload yet."}
          </p>

          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-surface-border bg-surface-subtle px-6 py-12 transition hover:border-gold hover:bg-goldLight/10 disabled:opacity-40"
          >
            <span className="text-2xl text-goldDark">⇪</span>
            <span className="text-sm font-semibold text-navy">{busy ? "Uploading…" : "Choose photographs"}</span>
            <span className="text-xs text-ink-muted">JPG or PNG · you can select several at once</span>
          </button>

          {data.photoCount > 0 && (
            <p className="mt-3 text-center text-xs font-semibold text-goldDark">
              {data.photoCount} photo{data.photoCount === 1 ? "" : "s"} uploaded.
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            {!data.photosRequired && (
              <button onClick={skip} disabled={busy} className="text-xs text-ink-muted underline-offset-4 hover:text-goldDark hover:underline disabled:opacity-40">
                No photos — continue
              </button>
            )}
            <Button onClick={() => void load()} disabled={busy || (data.photosRequired && data.photoCount === 0)} className="ml-auto">
              Continue
            </Button>
          </div>
        </Card>
      )}

      {phase === "confirm" && (
        <Card>
          <p className="mb-1 font-display text-lg font-bold text-navy">Everything I have on this campaign</p>
          <p className="mb-4 text-xs text-ink-muted">
            Click any row to correct it. Agents treat these as fact and publish them verbatim.
          </p>

          <div className="divide-y divide-surface-border overflow-hidden rounded-xl border border-surface-border bg-surface-subtle">
            {data.summary.map((row) => (
              <button
                key={row.field}
                onClick={() => {
                  setEditing({
                    field: row.field,
                    prompt: `Update the ${row.label}`,
                    kind: row.field === "date" ? "date" : "text",
                    required: row.required,
                  });
                  setAnswer(row.value ?? "");
                }}
                disabled={row.field === "photos"}
                className="flex w-full items-start justify-between gap-4 px-3.5 py-2.5 text-left transition hover:bg-white disabled:hover:bg-transparent"
              >
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-goldDark">{row.label}</span>
                <span className={`min-w-0 flex-1 text-right text-sm ${row.value ? "text-navy font-medium" : "text-ink-muted italic"}`}>
                  {row.value ?? (row.skipped ? "skipped" : "not provided")}
                </span>
              </button>
            ))}
          </div>

          {!data.canGenerate && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              Still blocked: {data.missingRequired.join(", ") || "a required photograph"}.
            </p>
          )}

          <Button onClick={onGenerate} disabled={!data.canGenerate} className="mt-5 w-full">
            Looks right — run the agents
          </Button>
        </Card>
      )}
    </div>
  );
}

/** Renders the control the question actually calls for, not a generic text box. */
function AnswerInput({
  step,
  value,
  onChange,
  onSubmit,
}: {
  step: IntakeStep;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const common = {
    value,
    autoFocus: true,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    className: inputCls,
    placeholder: step.placeholder,
  };

  // Enter submits single-line answers; textareas keep Enter for newlines.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  };

  if (step.kind === "longtext") return <textarea {...common} rows={4} className={`${inputCls} resize-y leading-relaxed`} />;
  if (step.kind === "date") return <input {...common} type="date" onKeyDown={onKeyDown} />;
  if (step.kind === "time") return <input {...common} type="time" onKeyDown={onKeyDown} />;
  if (step.kind === "number") return <input {...common} type="number" min={0} onKeyDown={onKeyDown} />;
  return <input {...common} type="text" onKeyDown={onKeyDown} />;
}
