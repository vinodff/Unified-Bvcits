import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { listRuns, listDailyStats, type OpportunityRun } from "@/lib/opportunities/runs";
import { KIND_LABELS, isOpportunityKind, type OpportunityKind } from "@/lib/opportunities/types";
import {
  Sparkles,
  BarChart3,
  Briefcase,
  Archive,
  Clock,
  Globe,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from "@/components/ui/icons";
import { SectionCard, StatTile, Chip, EmptyState, ProgressBar, type Tone } from "@/components/dashboard/ui";
import { RunNowButton } from "./run-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Opportunities Agent | BVCITS",
  robots: { index: false, follow: false },
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Today" / "Yesterday" / "Mon 02 Sep" — the day-wise report's row label. */
function dayLabel(day: string, todayIso: string, yesterdayIso: string): string {
  if (day === todayIso) return "Today";
  if (day === yesterdayIso) return "Yesterday";
  return new Date(day).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}

function runTone(status: OpportunityRun["status"]): Tone {
  if (status === "success") return "success";
  if (status === "failed") return "danger";
  if (status === "partial") return "warning";
  return "neutral";
}

export default async function OpportunitiesAgentPage() {
  const user = await getSessionUser();
  if (!user) return null;
  // `opportunity_runs` is service-role only (RLS enabled, no policies), so this
  // capability check IS the authorization boundary — same arrangement as
  // /dashboard/enquiries and /dashboard/users.
  if (!can(user.role, "opportunities.moderate")) notFound();

  const supabase = getServiceClient();

  const runsForFind = await listRuns(supabase, 1).catch(() => []);
  const latestRunId = runsForFind[0]?.id ?? null;

  const [runsResult, statsResult, liveResult, retiredResult, foundResult] = await Promise.allSettled([
    listRuns(supabase, 20),
    listDailyStats(supabase, 7),
    supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("status", "verified")
      .is("retired_at", null),
    supabase
      .from("opportunities")
      .select("id, title, apply_url, retired_at, retired_reason")
      .not("retired_at", "is", null)
      .order("retired_at", { ascending: false })
      .limit(8),
    // Exactly what the most recent run brought in — `first_seen_run` is stamped
    // at insert, so this is the run's own catch rather than "recent rows".
    latestRunId
      ? supabase
          .from("opportunities")
          .select("id, title, organization, kind, apply_url, location, deadline, status, source_tier")
          .eq("first_seen_run", latestRunId)
          .order("kind")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const runs = runsResult.status === "fulfilled" ? runsResult.value : [];
  const stats = statsResult.status === "fulfilled" ? statsResult.value : [];
  const liveCount = liveResult.status === "fulfilled" ? (liveResult.value.count ?? 0) : 0;
  const retiredRows =
    retiredResult.status === "fulfilled" ? (retiredResult.value.data ?? []) : [];

  interface FoundRow {
    id: string;
    title: string;
    organization: string;
    kind: string;
    apply_url: string;
    location: string | null;
    deadline: string | null;
    status: string;
    source_tier: string;
  }
  const foundRows: FoundRow[] =
    foundResult.status === "fulfilled" ? ((foundResult.value.data ?? []) as FoundRow[]) : [];

  // Grouped the way a student thinks about them — internships, jobs, hackathons —
  // not in database insertion order.
  const foundByKind = new Map<OpportunityKind, FoundRow[]>();
  for (const row of foundRows) {
    if (!isOpportunityKind(row.kind)) continue;
    const list = foundByKind.get(row.kind) ?? [];
    list.push(row);
    foundByKind.set(row.kind, list);
  }
  const KIND_ORDER: OpportunityKind[] = [
    "internship",
    "job",
    "hackathon",
    "competition",
    "scholarship",
    "fellowship",
    "ambassador",
    "event",
    "workshop",
    "webinar",
  ];
  const foundGroups = KIND_ORDER.filter((kind) => foundByKind.has(kind)).map((kind) => ({
    kind,
    rows: foundByKind.get(kind) as FoundRow[],
  }));

  const setupError =
    runsResult.status === "rejected"
      ? (runsResult.reason as Error).message
      : statsResult.status === "rejected"
        ? (statsResult.reason as Error).message
        : null;

  const today = stats[0];
  const lastRun = runs[0];
  const peakDiscovered = Math.max(1, ...stats.map((s) => s.discovered + s.retired));

  const todayIso = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const yesterdayIso = new Date(Date.now() + 5.5 * 3600_000 - 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-navy">
            <Sparkles className="h-6 w-6 text-crimson" />
            Opportunities Agent
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Re-verifies every published opportunity daily and retires the ones that are no longer
            live — with the evidence for each removal.{" "}
            <Link href="/dashboard/opportunities" className="font-semibold text-crimson hover:underline">
              View the student feed
            </Link>
          </p>
        </div>
        <RunNowButton />
      </div>

      {setupError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">The agent tables are not there yet.</p>
          <p className="mt-1">
            Apply <code className="rounded bg-amber-100 px-1">0012_opportunity_agent.sql</code> in the
            Supabase SQL editor, then reload this page.
          </p>
          <p className="mt-2 text-xs text-amber-800">{setupError}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<Briefcase className="h-5 w-5" />}
          label="Live opportunities"
          value={String(liveCount)}
          hint="verified and still open"
          tone="success"
        />
        <StatTile
          icon={<BarChart3 className="h-5 w-5" />}
          label="Found today"
          value={String(today?.discovered ?? 0)}
          hint={today ? `${today.verified} verified` : undefined}
          delayMs={60}
        />
        <StatTile
          icon={<Archive className="h-5 w-5" />}
          label="Retired today"
          value={String(today?.retired ?? 0)}
          tone={(today?.retired ?? 0) > 0 ? "warning" : "neutral"}
          hint="no longer available"
          delayMs={120}
        />
        <StatTile
          icon={<Globe className="h-5 w-5" />}
          label="Sources searched"
          value={String(lastRun?.sources.length ?? 0)}
          hint={
            lastRun
              ? `${lastRun.pagesSearched} pages · ${lastRun.rechecked} links re-checked`
              : "never run"
          }
          tone={(lastRun?.sources.length ?? 0) > 0 ? "gold" : "neutral"}
          delayMs={180}
        />
      </div>

      <SectionCard title="Day by day" icon={<BarChart3 className="h-4 w-4" />}>
        {stats.length === 0 ? (
          <EmptyState icon={<BarChart3 className="h-8 w-8" />} text="No activity recorded yet." />
        ) : (
          <ul className="space-y-3">
            {stats.map((day) => (
              <li key={day.day}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-navy">
                    {dayLabel(day.day, todayIso, yesterdayIso)}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {day.discovered} found · {day.verified} verified · {day.retired} retired ·{" "}
                    {day.rechecked} re-checked
                    {day.runs > 0 && ` · ${day.runs} run${day.runs === 1 ? "" : "s"}`}
                  </span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar
                    percent={((day.discovered + day.retired) / peakDiscovered) * 100}
                    tone={day.retired > day.discovered ? "warning" : "gold"}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        // The run row is keyed to the IST day and reopened on a forced re-run,
        // so these accumulate across today's executions. "Today" is therefore
        // the accurate label — "this run" would undercount a second press.
        title={`Opportunities found today${foundRows.length ? ` — ${foundRows.length}` : ""}`}
        icon={<Sparkles className="h-4 w-4" />}
        action={
          lastRun ? (
            <span className="text-xs text-ink-muted">{formatDateTime(lastRun.startedAt)}</span>
          ) : undefined
        }
      >
        {foundGroups.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            text={
              lastRun
                ? "Today's run found nothing new — every listing it saw was already on the board."
                : "Press Run now to search the web for new opportunities."
            }
          />
        ) : (
          <div className="space-y-5">
            {foundGroups.map((group) => (
              <div key={group.kind}>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-crimson">
                  {KIND_LABELS[group.kind]}
                  <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[10px] text-ink-muted">
                    {group.rows.length}
                  </span>
                </h3>
                <ul className="space-y-2">
                  {group.rows.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-lg border border-surface-border bg-surface-subtle px-3 py-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <a
                          href={row.apply_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 text-sm font-semibold text-navy hover:text-crimson hover:underline"
                        >
                          {row.title}
                          <ExternalLink className="ml-1 inline h-3 w-3 align-baseline" />
                        </a>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {row.status === "verified" ? (
                            <Chip tone="success">published</Chip>
                          ) : (
                            <Chip tone="warning">needs review</Chip>
                          )}
                        </div>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {row.organization}
                        {row.location && ` · ${row.location}`}
                        {row.deadline && ` · closes ${row.deadline}`}
                        {" · "}
                        <span className="text-ink-faint">{hostOf(row.apply_url)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Where these opportunities came from"
        icon={<Globe className="h-4 w-4" />}
        action={
          lastRun ? (
            <span className="text-xs text-ink-muted">last run · {formatDateTime(lastRun.startedAt)}</span>
          ) : undefined
        }
      >
        {!lastRun || lastRun.sources.length === 0 ? (
          <EmptyState
            icon={<Globe className="h-8 w-8" />}
            text={
              lastRun
                ? "The last run only re-checked existing links — no new search was performed."
                : "Press Run now to search career pages and job boards."
            }
          />
        ) : (
          <>
            <p className="mb-3 text-xs text-ink-muted">
              Every site the agent actually searched on its last run, and how many listings each
              one produced. These are the search engine&rsquo;s own citations, not a self-reported
              list.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {lastRun.sources.map((source) => (
                <li
                  key={source.host}
                  className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-subtle px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-navy">{source.host}</span>
                    {source.plan && (
                      <span className="text-[10px] uppercase tracking-wide text-ink-faint">
                        {source.plan}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right text-xs text-ink-muted">
                    <span className="block">{source.results} found</span>
                    {source.kept > 0 && (
                      <span className="block font-semibold text-emerald-700">{source.kept} published</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Recent runs" icon={<Clock className="h-4 w-4" />}>
          {runs.length === 0 ? (
            <EmptyState icon={<Clock className="h-8 w-8" />} text="The agent has not run yet." />
          ) : (
            <ul className="space-y-2">
              {runs.map((run) => (
                <li
                  key={run.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-border bg-surface-subtle px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy">
                      {run.trigger === "cron" ? "Scheduled run" : "Manual run"}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {run.sources.length > 0
                        ? `${run.sources.length} source${run.sources.length === 1 ? "" : "s"} · ${run.pagesSearched} pages · `
                        : ""}
                      {run.verified > 0 && `${run.verified} added · `}
                      {run.rechecked} re-checked · {run.retired} retired
                    </p>
                    {run.sources.length > 0 && (
                      <p className="mt-0.5 truncate text-[10px] text-ink-faint">
                        {run.sources.slice(0, 4).map((s) => s.host).join(" · ")}
                        {run.sources.length > 4 && ` +${run.sources.length - 4} more`}
                      </p>
                    )}
                    {run.error && <p className="mt-0.5 truncate text-[10px] text-red-600">{run.error}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-ink-muted">{formatDateTime(run.startedAt)}</span>
                    <Chip tone={runTone(run.status)}>{run.status}</Chip>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recently retired" icon={<Archive className="h-4 w-4" />}>
          {retiredRows.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-8 w-8" />}
              text="Nothing has been retired — every published opportunity is still live."
            />
          ) : (
            <ul className="space-y-2">
              {retiredRows.map((row) => (
                <li
                  key={String(row.id)}
                  className="rounded-lg border border-surface-border bg-surface-subtle px-3 py-2"
                >
                  <p className="truncate text-sm font-medium text-navy">{String(row.title)}</p>
                  <p className="mt-0.5 flex items-start gap-1 text-xs text-ink-muted">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                    <span>{String(row.retired_reason ?? "no reason recorded")}</span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-ink-faint">
                    {formatDateTime(String(row.retired_at))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

    </div>
  );
}
