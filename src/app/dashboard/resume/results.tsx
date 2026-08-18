"use client";

import { useState } from "react";
import { ResumeDocument } from "./resume-document";
import type { EvidenceItem, OptimizationResult, SkillGap, SubScores } from "@/lib/resume";
import { CheckCircle2, XCircle, AlertTriangle, TrendingUp, BadgeCheck, Info, Download } from "@/components/ui/icons";

const SUB_SCORE_LABELS: Record<keyof SubScores, string> = {
  keywordMatch: "Keyword Match",
  atsCompatibility: "ATS Compatibility",
  impactLanguage: "Impact Language",
  roleAlignment: "Role Alignment",
};

function barTone(value: number): string {
  if (value >= 75) return "bg-emerald-400";
  if (value >= 50) return "bg-gold";
  return "bg-red-400";
}

function scoreColor(value: number): string {
  if (value >= 75) return "text-emerald-400";
  if (value >= 50) return "text-gold";
  return "text-red-400";
}

const panel = "rounded-2xl border border-white/10 bg-brand-charcoal p-5 sm:p-6";

export function Results({ result, originalText }: { result: OptimizationResult; originalText: string }) {
  const delta = result.after.overall - result.before.overall;

  return (
    <div className="space-y-5">
      <ScoreAnalysis result={result} delta={delta} />
      <KeywordPanel result={result} />
      <TrustPanel trustScore={result.evidence.trustScore} items={result.evidence.items} />
      {result.skillGaps.length > 0 && <GapsPanel gaps={result.skillGaps} />}
      <ComparePanel result={result} originalText={originalText} delta={delta} />

      {result.usedFallback && (
        <p className="flex items-start gap-2 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-xs text-gold-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          The language model was unavailable, so this used the offline optimizer — skills were reprioritised and the
          summary rebuilt from your own facts, but bullets were left as you wrote them.
        </p>
      )}
    </div>
  );
}

function ScoreAnalysis({ result, delta }: { result: OptimizationResult; delta: number }) {
  return (
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
          <TrendingUp className="h-4 w-4 text-gold" />
          Resume Score Analysis
        </h2>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-400">
          {delta >= 0 ? "+" : ""}
          {delta} pts improvement
        </span>
      </div>

      <p className="mt-6 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Before / After</p>

      <div className="mt-3 flex items-center justify-center gap-5 sm:gap-8">
        <ScoreBlock value={result.before.overall} label="Before" sub="Original" muted />
        <span aria-hidden className="text-2xl text-white/30">→</span>
        <ScoreBlock value={result.after.overall} label="After" sub="Optimized" />
        <div className="text-center">
          <p className={`font-display text-2xl font-extrabold ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {delta >= 0 ? "+" : ""}
            {delta}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-white/40">pts</p>
        </div>
      </div>

      <div className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {(Object.keys(SUB_SCORE_LABELS) as (keyof SubScores)[]).map((key) => (
          <div key={key}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-white/70">{SUB_SCORE_LABELS[key]}</span>
              <span className={`font-bold ${scoreColor(result.after.subScores[key])}`}>{result.after.subScores[key]}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-700 ${barTone(result.after.subScores[key])}`}
                style={{ width: `${result.after.subScores[key]}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ScoreBlock({ value, label, sub, muted = false }: { value: number; label: string; sub: string; muted?: boolean }) {
  return (
    <div
      className={`rounded-2xl border px-6 py-4 text-center sm:px-8 ${
        muted ? "border-white/10 bg-white/[0.03]" : "border-gold/40 bg-gold/[0.07] shadow-[0_0_30px_-10px_rgba(245,184,0,0.5)]"
      }`}
    >
      <p className={`font-display text-4xl font-extrabold sm:text-5xl ${muted ? "text-red-400" : "text-gold"}`}>{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/60">{label}</p>
      <p className="text-[10px] text-white/35">{sub}</p>
    </div>
  );
}

function KeywordPanel({ result }: { result: OptimizationResult }) {
  const { coveragePercent } = result.keywordCoverage;
  const label = coveragePercent >= 75 ? "Strong coverage" : coveragePercent >= 45 ? "Partial coverage" : "Low coverage";

  return (
    <section className={panel}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-bold text-white">Keyword Coverage</h2>
        <span className={`text-xs font-semibold ${scoreColor(coveragePercent)}`}>{label}</span>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full transition-all duration-700 ${barTone(coveragePercent)}`} style={{ width: `${coveragePercent}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-white/35">
        {["0%", "25%", "50%", "75%", "100%"].map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Matched ({result.matchedSkills.length})
          </h3>
          {result.matchedSkills.length === 0 ? (
            <p className="text-xs text-white/40">None yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {result.matchedSkills.map((s) => (
                <span key={s} className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs capitalize text-emerald-300">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="sm:border-l sm:border-white/10 sm:pl-6">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-400">
            <XCircle className="h-3.5 w-3.5" />
            Missing ({result.missingSkills.length})
          </h3>
          {result.missingSkills.length === 0 ? (
            <p className="text-xs text-white/40">Nothing missing — full coverage.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {result.missingSkills.map((s) => (
                  <span key={s} className="rounded-full border border-red-400/30 bg-red-400/10 px-2.5 py-1 text-xs capitalize text-red-300">
                    {s}
                  </span>
                ))}
              </div>
              <p className="mt-2.5 text-[11px] text-white/35">
                Add these to your resume only where they are genuinely true.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

const EVIDENCE_STYLES: Record<EvidenceItem["level"], { chip: string; label: string; icon: typeof CheckCircle2 }> = {
  verified: { chip: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", label: "VERIFIED", icon: CheckCircle2 },
  partial: { chip: "border-gold/30 bg-gold/10 text-gold-200", label: "PARTIAL", icon: Info },
  weak: { chip: "border-red-400/30 bg-red-400/10 text-red-300", label: "WEAK", icon: AlertTriangle },
};

function TrustPanel({ trustScore, items }: { trustScore: number; items: EvidenceItem[] }) {
  const label = trustScore >= 75 ? "High trust" : trustScore >= 50 ? "Medium trust" : "Low trust";

  return (
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
          <BadgeCheck className="h-4 w-4 text-gold" />
          Trust &amp; Evidence
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50">{label}</span>
          <span className={`rounded-lg border border-white/10 bg-white/5 px-3 py-1 font-display text-lg font-bold ${scoreColor(trustScore)}`}>
            {trustScore}
            <span className="text-xs text-white/40">/100</span>
          </span>
        </div>
      </div>

      <p className="mt-2 text-xs text-white/45">
        How well the optimized resume&apos;s claims are backed by your original. Higher = safer in interviews.
      </p>

      {items.length > 0 && (
        <>
          <h3 className="mb-3 mt-6 text-[10px] font-bold uppercase tracking-wider text-white/40">Skill evidence map</h3>
          <ul className="space-y-2">
            {items.map((item) => {
              const style = EVIDENCE_STYLES[item.level];
              const Icon = style.icon;
              return (
                <li key={item.claim} className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-white/50" />
                    <span className="font-semibold capitalize text-white">{item.claim}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-wider ${style.chip}`}>{style.label}</span>
                  </div>
                  <p className="mt-1.5 pl-6 text-xs text-white/45">{item.detail}</p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

const SEVERITY_STYLES: Record<SkillGap["severity"], string> = {
  critical: "border-red-400/40 bg-red-400/10 text-red-300",
  high: "border-gold/40 bg-gold/10 text-gold-200",
  moderate: "border-white/15 bg-white/5 text-white/60",
};

function GapsPanel({ gaps }: { gaps: SkillGap[] }) {
  const counts = gaps.reduce<Record<string, number>>((acc, g) => ({ ...acc, [g.severity]: (acc[g.severity] ?? 0) + 1 }), {});

  return (
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-white">Skill Gaps</h2>
          <p className="mt-0.5 text-xs text-white/45">
            {gaps.length} gap{gaps.length === 1 ? "" : "s"} identified — address these to strengthen your application
          </p>
        </div>
        <div className="flex gap-1.5">
          {counts.critical && (
            <span className="rounded-full border border-red-400/40 bg-red-400/10 px-2.5 py-1 text-[10px] font-bold text-red-300">
              {counts.critical} Critical
            </span>
          )}
          {counts.high && (
            <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-bold text-gold-200">
              {counts.high} High
            </span>
          )}
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {gaps.map((gap) => (
          <li key={gap.skill} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <span className="font-semibold capitalize text-white">{gap.skill}</span>
            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${SEVERITY_STYLES[gap.severity]}`}>
              {gap.severity}
            </span>
            <span className="w-full text-xs text-white/45">{gap.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ComparePanel({ result, originalText, delta }: { result: OptimizationResult; originalText: string; delta: number }) {
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"after" | "compare">("after");

  async function copy() {
    try {
      await navigator.clipboard.writeText(toPlainText(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex flex-wrap items-center gap-2 font-display text-base font-bold text-white">
          Your Optimized Resume
          <span className="rounded border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-xs font-bold text-red-300">{result.before.overall}</span>
          <span className="text-white/30">→</span>
          <span className="rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-xs font-bold text-emerald-300">{result.after.overall}</span>
          <span className="text-xs font-semibold text-emerald-400">
            {delta >= 0 ? "+" : ""}
            {delta} pts
          </span>
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-white/15 p-0.5">
            {(["after", "compare"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  view === mode ? "bg-gold text-brand-black" : "text-white/60 hover:text-white"
                }`}
              >
                {mode === "after" ? "Final resume" : "Compare"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={copy}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-gold hover:text-gold"
          >
            {copied ? "Copied ✓" : "Copy text"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg bg-gold px-3.5 py-1.5 text-xs font-bold text-brand-black transition hover:bg-gold-500"
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </button>
        </div>
      </div>

      {view === "after" ? (
        <div className="mt-4 overflow-x-auto rounded-xl bg-white/5 p-3 sm:p-5">
          <div className="shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <ResumeDocument sections={result.optimizedSections} />
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Before — your original</span>
              <span className="rounded border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[10px] font-bold text-red-300">
                Score: {result.before.overall}
              </span>
            </div>
            <pre className="h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-white p-5 font-sans text-[10px] leading-relaxed text-neutral-700">
              {originalText}
            </pre>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">After — optimized</span>
              <span className="rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                Score: {result.after.overall} · ATS-optimized ✓
              </span>
            </div>
            <div className="h-[520px] overflow-auto rounded-xl border border-gold/30 bg-white/5 p-3">
              <ResumeDocument sections={result.optimizedSections} scale={0.62} />
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-xs text-white/35">
        Download PDF opens your browser&apos;s print dialog — choose <strong className="text-white/60">Save as PDF</strong> for a
        clean, ATS-safe A4 document.
      </p>

      {/* Print target. Hidden on screen; globals.css makes this the only
          visible node when printing, so the PDF is the resume alone. */}
      <div id="resume-print-root" aria-hidden>
        <ResumeDocument sections={result.optimizedSections} />
      </div>
    </section>
  );
}

/** Flattens the optimized resume for the clipboard. */
function toPlainText(result: OptimizationResult): string {
  const s = result.optimizedSections;
  const lines: string[] = [];

  if (s.contact.fullName) lines.push(s.contact.fullName);
  const contactLine = [s.contact.phone, s.contact.email, s.contact.location].filter(Boolean).join(" · ");
  if (contactLine) lines.push(contactLine);

  if (s.summary) lines.push("", "PROFESSIONAL SUMMARY", s.summary);
  if (s.skills.length) lines.push("", "TECHNICAL SKILLS", s.skills.join(", "));

  if (s.experience.length) {
    lines.push("", "EXPERIENCE");
    for (const e of s.experience) {
      lines.push(`${[e.role, e.organization].filter(Boolean).join(" — ")}${e.years ? ` (${e.years})` : ""}`);
      for (const b of e.bullets) lines.push(`- ${b}`);
    }
  }

  if (s.projects.length) {
    lines.push("", "PROJECTS");
    for (const p of s.projects) {
      lines.push(`${p.name}${p.stack ? ` — ${p.stack}` : ""}`);
      for (const b of p.bullets) lines.push(`- ${b}`);
    }
  }

  if (s.education.length) {
    lines.push("", "EDUCATION");
    for (const e of s.education) {
      lines.push(`${e.institution}${e.years ? ` (${e.years})` : ""}`);
      if (e.degree) lines.push(e.degree);
      if (e.detail) lines.push(e.detail);
    }
  }

  if (s.certifications.length) {
    lines.push("", "CERTIFICATIONS");
    for (const c of s.certifications) {
      lines.push([c.name, c.issuer, c.year].filter(Boolean).join(" — "));
    }
  }

  return lines.join("\n");
}
