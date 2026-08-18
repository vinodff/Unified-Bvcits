import type { Metadata } from "next";
import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import {
  KIND_LABELS,
  OPPORTUNITY_COLUMNS,
  OPPORTUNITY_KINDS,
  daysUntil,
  fromRow,
  isOpportunityKind,
  rankOpportunities,
} from "@/lib/opportunities";
import { isTrackerStatus, type TrackerStatus } from "@/lib/opportunities/tracker";
import { SaveControls } from "./save-controls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Opportunities | BVCITS",
  robots: { index: false, follow: false },
};

/** Postgres reports an absent table this way; 0006 has not been applied yet. */
const TABLE_MISSING = "PGRST205";

function deadlineTone(days: number | null): string {
  if (days === null) return "text-ink-muted";
  if (days <= 3) return "text-crimson font-semibold";
  if (days <= 7) return "text-amber-700 font-semibold";
  return "text-ink-muted";
}

function deadlineLabel(deadline: string | null, days: number | null): string {
  if (!deadline || days === null) return "No stated deadline";
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  return `Closes in ${days} days`;
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) return null;

  const params = await searchParams;
  const activeKind = isOpportunityKind(params.kind) ? params.kind : null;

  const supabase = await createClient();

  // Both queries are independent, so they go out together rather than in a
  // waterfall. Neither filters by status: the RLS policy decides what exists
  // for this reader, and opportunity_saves is already scoped to auth.uid().
  const [opportunityResult, savesResult] = await Promise.all([
    supabase.from("opportunities").select(OPPORTUNITY_COLUMNS).limit(200),
    supabase.from("opportunity_saves").select("opportunity_id, status"),
  ]);

  const setupNeeded = opportunityResult.error?.code === TABLE_MISSING;

  const savedByOpportunity = new Map<string, TrackerStatus>();
  for (const row of savesResult.data ?? []) {
    if (typeof row.opportunity_id === "string" && isTrackerStatus(row.status)) {
      savedByOpportunity.set(row.opportunity_id, row.status);
    }
  }

  const records = (opportunityResult.data ?? [])
    .map((row) => fromRow(row as Record<string, unknown>))
    .filter((record): record is NonNullable<typeof record> => record !== null)
    .filter((record) => (activeKind ? record.kind === activeKind : true));

  const now = new Date();
  const ranked = rankOpportunities(records, { department: user.department }, now);
  const canModerate = can(user.role, "opportunities.moderate");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-navy">Opportunities</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Verified jobs, internships, hackathons and scholarships gathered from the open web
          {user.department ? (
            <>
              , ranked for <strong>{user.department}</strong>
            </>
          ) : null}
          .{" "}
          {!user.department && (
            <Link href="/dashboard/profile" className="font-medium text-crimson underline">
              Add your department
            </Link>
          )}
          {!user.department && " to personalise this list."}
        </p>
      </div>

      {setupNeeded && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Opportunities table not created yet.</p>
          <p className="mt-1">
            Run <code className="rounded bg-amber-100 px-1">supabase/migrations/0006_opportunities.sql</code>{" "}
            in the Supabase SQL editor, then run{" "}
            <code className="rounded bg-amber-100 px-1">npm run discover:opportunities</code> to
            populate this feed.
          </p>
        </div>
      )}

      {opportunityResult.error && !setupNeeded && (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load opportunities: {opportunityResult.error.message}
        </p>
      )}

      <nav aria-label="Filter by type" className="flex flex-wrap gap-2">
        <Link
          href="/dashboard/opportunities"
          aria-current={activeKind === null ? "page" : undefined}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            activeKind === null
              ? "bg-navy text-white"
              : "border border-surface-border bg-white text-ink-muted hover:border-crimson hover:text-crimson"
          }`}
        >
          All
        </Link>
        {OPPORTUNITY_KINDS.map((kind) => (
          <Link
            key={kind}
            href={`/dashboard/opportunities?kind=${kind}`}
            aria-current={activeKind === kind ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              activeKind === kind
                ? "bg-navy text-white"
                : "border border-surface-border bg-white text-ink-muted hover:border-crimson hover:text-crimson"
            }`}
          >
            {KIND_LABELS[kind]}
          </Link>
        ))}
      </nav>

      {!opportunityResult.error && ranked.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border bg-white p-8 text-center text-sm text-ink-muted">
          Nothing open here right now. The discovery run adds new opportunities as it finds them.
        </p>
      ) : (
        <ul className="space-y-4">
          {ranked.map(({ opportunity, score }) => {
            const days = daysUntil(opportunity.deadline, now);
            const savedStatus = savedByOpportunity.get(opportunity.id) ?? null;

            return (
              <li
                key={opportunity.id}
                className="rounded-xl border border-surface-border bg-white p-5 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-bold text-navy">{opportunity.title}</h2>
                    <p className="text-sm text-ink-muted">
                      {opportunity.organization}
                      {opportunity.location && ` · ${opportunity.location}`}
                      {opportunity.workMode && ` · ${opportunity.workMode}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-navy/5 px-2 py-0.5 text-xs font-semibold text-navy">
                      {KIND_LABELS[opportunity.kind]}
                    </span>
                    {opportunity.sourceTier === "official" ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        Official source
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        Second-hand listing
                      </span>
                    )}
                    {canModerate && opportunity.status !== "verified" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        {opportunity.status}
                      </span>
                    )}
                  </div>
                </div>

                {opportunity.description && (
                  <p className="mt-3 line-clamp-3 text-sm text-ink">{opportunity.description}</p>
                )}

                {opportunity.skills.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {opportunity.skills.slice(0, 8).map((skill) => (
                      <li
                        key={skill}
                        className="rounded bg-surface-subtle px-1.5 py-0.5 text-xs text-ink-muted"
                      >
                        {skill}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className={deadlineTone(days)}>
                      {deadlineLabel(opportunity.deadline, days)}
                    </span>
                    {score.reasons
                      .filter((reason) => !reason.startsWith("Closes"))
                      .map((reason) => (
                        <span key={reason} className="text-ink-muted">
                          · {reason}
                        </span>
                      ))}
                    <span className="text-ink-muted" title="Match score for your profile">
                      · {score.total}/100 match
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <SaveControls opportunityId={opportunity.id} savedStatus={savedStatus} />
                    <a
                      href={opportunity.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-crimson px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-crimson/90"
                    >
                      Apply
                    </a>
                  </div>
                </div>

                {canModerate && opportunity.signals.length > 0 && (
                  <p className="mt-3 border-t border-surface-border pt-2 text-xs text-ink-muted">
                    Verifier notes: {opportunity.signals.join(" · ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
