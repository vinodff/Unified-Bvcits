"use client";

// Shared UI primitives for the Marketing Studio — premium black + gold system.

import { useState, type ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-brand-gold/15 bg-brand-black p-5 shadow-[0_1px_0_rgba(245,184,0,0.06)_inset] ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, right }: { eyebrow: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="eyebrow text-brand-gold">{eyebrow}</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.01em] text-brand-white">{title}</h2>
      </div>
      {right}
    </div>
  );
}

const TONES: Record<string, string> = {
  success: "border-brand-gold/40 bg-brand-gold/10 text-brand-gold",
  info: "border-white/15 bg-white/5 text-white/80",
  danger: "border-brand-maroon/50 bg-brand-maroon/20 text-red-300",
  neutral: "border-white/10 bg-white/5 text-white/60",
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
    primary: "bg-brand-gold text-brand-black hover:bg-gold-300",
    ghost: "border border-white/15 text-white/85 hover:border-brand-gold/50 hover:text-brand-gold",
    danger: "border border-brand-maroon/60 text-red-300 hover:bg-brand-maroon/20",
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
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-white/50">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-brand-gold/60";

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-8 w-full max-w-lg rounded-2xl border border-brand-gold/20 bg-[#121214] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-brand-white">{title}</h3>
          <button onClick={onClose} className="text-white/50 hover:text-brand-gold" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-white/40">{text}</div>;
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
  return <div className="rounded-lg border border-brand-maroon/50 bg-brand-maroon/15 px-3 py-2 text-sm text-red-200">{message}</div>;
}