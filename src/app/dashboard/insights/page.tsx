import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Assistant Insights | BVCITS",
  robots: { index: false, follow: false },
};

interface GapRow {
  question: string;
  times_asked: number;
  times_answered: number;
  miss_rate_pct: number;
  last_asked_at: string;
  sample_phrasings: string[];
}

export default async function InsightsPage() {
  const user = await getSessionUser();
  if (!user) return null;
  if (!can(user.role, "assistant.insights")) notFound();

  const { data, error } = await getServiceClient()
    .from("assistant_gap_report")
    .select("*")
    .limit(50);

  const rows = (data ?? []) as GapRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Assistant insights</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Questions visitors asked the campus assistant that it could not answer, ranked by
          how often they were missed. This is the content backlog.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load insights: {error.message}
        </p>
      )}

      {rows.length === 0 && !error ? (
        <p className="rounded-xl border border-dashed border-surface-border bg-white p-8 text-center text-sm text-ink-muted">
          No gaps recorded in the last 90 days.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.question} className="rounded-xl border border-surface-border bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="font-semibold text-navy">{row.question}</h2>
                <span className="shrink-0 rounded-full bg-crimson-100 px-2.5 py-0.5 text-xs font-semibold text-crimson">
                  {row.miss_rate_pct}% missed
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                Asked {row.times_asked}×, answered {row.times_answered}×. Last asked{" "}
                {new Date(row.last_asked_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                .
              </p>
              {row.sample_phrasings?.length > 0 && (
                <p className="mt-2 text-xs italic text-ink-muted">
                  &ldquo;{row.sample_phrasings.join("”  “")}&rdquo;
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
