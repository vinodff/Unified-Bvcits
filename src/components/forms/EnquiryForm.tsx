"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

const inputBase =
  "w-full rounded-md border border-surface-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-crimson focus:ring-2 focus:ring-crimson-100 disabled:opacity-60";

const PROGRAMS = [
  "B.Tech — CSE",
  "B.Tech — AI & DS",
  "B.Tech — ECE",
  "B.Tech — EEE",
  "B.Tech — Mechanical",
  "B.Tech — Civil",
  "MBA",
  "MCA",
] as const;

type Status = "idle" | "submitting" | "sent";

export default function EnquiryForm({
  title = "Admission Enquiry",
  compact = false,
}: {
  title?: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus("submitting");

    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: data.get("fullName"),
          mobile: data.get("mobile"),
          email: data.get("email"),
          program: data.get("program"),
          message: data.get("message"),
          sourcePath: pathname,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        // The route returns a visitor-safe message; only fall back if it didn't.
        setError(result.error ?? "Something went wrong. Please call +91 99854 22678.");
        setStatus("idle");
        return;
      }

      form.reset();
      setStatus("sent");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-xl border border-green-100 bg-green-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-2xl text-white">
          ✓
        </div>
        <h3 className="text-lg font-bold text-green-800">Thank you!</h3>
        <p className="mt-1 text-sm text-green-700">
          Your enquiry has been received. Our admissions team will contact you shortly.
        </p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-4 text-sm font-semibold text-green-700 underline"
        >
          Submit another response
        </button>
      </div>
    );
  }

  const busy = status === "submitting";

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-surface-border bg-white p-6 shadow-card">
      <h3 className="text-lg font-bold text-navy">{title}</h3>
      <p className="mt-1 text-sm text-ink-muted">Fields marked * are required.</p>

      <div className={`mt-5 grid gap-4 ${compact ? "" : "sm:grid-cols-2"}`}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Full Name *</span>
          <input name="fullName" required disabled={busy} className={inputBase} placeholder="Your name" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Mobile *</span>
          <input
            name="mobile"
            required
            disabled={busy}
            type="tel"
            inputMode="tel"
            pattern="[0-9+][0-9 +()\-]{6,19}"
            className={inputBase}
            placeholder="10-digit number"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Email</span>
          <input name="email" disabled={busy} type="email" className={inputBase} placeholder="you@example.com" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Program of Interest</span>
          <select name="program" disabled={busy} className={inputBase} defaultValue="">
            <option value="" disabled>
              Select a program
            </option>
            {PROGRAMS.map((program) => (
              <option key={program}>{program}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium text-ink">Message</span>
        <textarea
          name="message"
          rows={3}
          disabled={busy}
          maxLength={2000}
          className={inputBase}
          placeholder="Tell us how we can help"
        />
      </label>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary mt-5 w-full sm:w-auto disabled:opacity-60">
        {busy ? "Submitting…" : "Submit Enquiry"}
      </button>
    </form>
  );
}
