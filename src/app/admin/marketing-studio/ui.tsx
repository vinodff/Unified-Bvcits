"use client";

// Shared UI primitives for the Marketing Studio — clean white + brand colors system.

import { useState, type ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-surface-border bg-white p-5 shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, right }: { eyebrow: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="eyebrow text-goldDark font-bold uppercase tracking-[0.14em] text-xs">{eyebrow}</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.01em] text-navy">{title}</h2>
      </div>
      {right}
    </div>
  );
}

const TONES: Record<string, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-surface-border bg-surface-subtle text-ink-soft",
};

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone = status === "PUBLISHED" || status === "published" || status === "approved" ? "success"
    : status === "READY_FOR_REVIEW" || status === "ready" || status === "scheduled" ? "info"
    : status === "CHANGES_REQUESTED" || status === "failed" || status === "PUBLISH_FAILED" || status === "GENERATION_FAILED" ? "danger"
    : "neutral";
  return <Pill tone={tone}>{status.replace(/_/g, " ")}</Pill>;
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  className?: string;
}) {
  const styles = {
    primary: "bg-gold text-navy font-bold shadow-sm hover:bg-gold-400 active:scale-[0.98]",
    ghost: "border border-surface-border bg-white text-navy hover:bg-surface-subtle hover:border-gold hover:text-crimson shadow-xs",
    danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "w-full rounded-xl border border-surface-border bg-white px-3.5 py-2.5 text-sm text-navy placeholder:text-ink-muted outline-none transition focus:border-gold focus:ring-1 focus:ring-gold";

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-xs" onClick={onClose}>
      <div className="my-8 w-full max-w-lg rounded-2xl border border-surface-border bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-navy">{title}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-navy" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-surface-border bg-surface-subtle px-6 py-10 text-center text-sm text-ink-muted">{text}</div>;
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, wrap };
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</div>;
}