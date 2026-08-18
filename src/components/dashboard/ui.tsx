import type { ReactNode } from "react";

/**
 * Shared visual primitives for the student/faculty/admin dashboard pages.
 *
 * One small kit rather than each page inventing its own card/tile markup —
 * so "attendance %" and "fee due" and "next class" all read as the same
 * design system instead of five slightly different premium-dashboard attempts.
 */

const TONE_STYLES = {
  neutral: "border-surface-border bg-white text-ink",
  gold: "border-gold-200 bg-gold-50 text-crimson-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
} as const;

export type Tone = keyof typeof TONE_STYLES;

/** A single number-forward stat card — attendance %, CGPA, amount due, next class. */
export function StatTile({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
  delayMs = 0,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  delayMs?: number;
}) {
  return (
    <div
      className="fade-up rounded-2xl border border-surface-border bg-white p-5 shadow-card transition duration-300 hover:-translate-y-0.5 hover:shadow-lift"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${TONE_STYLES[tone]}`}>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-navy">{value}</p>
      <p className="text-sm font-medium text-ink-soft">{label}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/** A clickable icon tile for "everything they can access from here" quick-access grids. */
export function AccessTile({
  href,
  icon,
  label,
  description,
  delayMs = 0,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  description: string;
  delayMs?: number;
}) {
  return (
    <a
      href={href}
      className="fade-up group flex items-start gap-3.5 rounded-2xl border border-surface-border bg-white p-4 shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-crimson-200 hover:shadow-lift"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-50 text-crimson-700 transition-colors group-hover:bg-crimson group-hover:text-white">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-navy group-hover:text-crimson">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{description}</span>
      </span>
    </a>
  );
}

export function SectionCard({
  title,
  icon,
  action,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-surface-border bg-white p-5 shadow-card sm:p-6 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_STYLES[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-surface-border bg-surface-subtle px-6 py-10 text-center">
      {icon && <span className="text-ink-faint">{icon}</span>}
      <p className="text-sm text-ink-muted">{text}</p>
    </div>
  );
}

/** A thin horizontal progress bar — attendance %, fee paid ratio. */
export function ProgressBar({ percent, tone = "gold" }: { percent: number; tone?: Tone }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const barColor =
    tone === "danger" ? "bg-red-500" : tone === "warning" ? "bg-amber-500" : tone === "success" ? "bg-emerald-500" : "bg-crimson";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-border">
      <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
