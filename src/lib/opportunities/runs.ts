import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The agent's run ledger.
 *
 * Every sweep opens a row before it does any work and closes it afterwards.
 * Opening first is the point: the blog pipeline's rule that "a crash mid-run
 * leaves a visible failed post rather than nothing at all" applies here too —
 * a run that dies halfway should be legible as a failure in the console, not
 * vanish as though the agent never woke up.
 *
 * All access is service-role: `opportunity_runs` has RLS enabled with no
 * policies (0012_opportunity_agent.sql), so the capability check on the caller
 * is the real boundary.
 */

export type RunTrigger = "cron" | "manual";
export type RunStatus = "running" | "success" | "partial" | "failed";

/** One entry in a run's `sources` array — the evidence behind "real sources". */
export interface RunSource {
  host: string;
  plan?: string;
  results: number;
  kept: number;
}

export interface RunCounts {
  pages_searched?: number;
  extracted?: number;
  verified?: number;
  pending?: number;
  rejected?: number;
  duplicates?: number;
  rechecked?: number;
  retired?: number;
}

export interface OpportunityRun {
  id: string;
  status: RunStatus;
  trigger: RunTrigger;
  runDate: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  pagesSearched: number;
  extracted: number;
  verified: number;
  pending: number;
  rejected: number;
  duplicates: number;
  rechecked: number;
  retired: number;
  sources: RunSource[];
  error: string | null;
}

/** The IST calendar day a run belongs to. Shared with the blog agent's batching. */
export function istDate(at: Date = new Date()): string {
  return new Date(at.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function toRun(row: Record<string, unknown>): OpportunityRun {
  const num = (value: unknown): number => (typeof value === "number" ? value : 0);
  return {
    id: String(row.id),
    status: (row.status as RunStatus) ?? "running",
    trigger: (row.trigger as RunTrigger) ?? "cron",
    runDate: String(row.run_date ?? ""),
    startedAt: String(row.started_at ?? ""),
    finishedAt: typeof row.finished_at === "string" ? row.finished_at : null,
    durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null,
    pagesSearched: num(row.pages_searched),
    extracted: num(row.extracted),
    verified: num(row.verified),
    pending: num(row.pending),
    rejected: num(row.rejected),
    duplicates: num(row.duplicates),
    rechecked: num(row.rechecked),
    retired: num(row.retired),
    sources: Array.isArray(row.sources) ? (row.sources as RunSource[]) : [],
    error: typeof row.error === "string" ? row.error : null,
  };
}

export interface StartRunResult {
  run: OpportunityRun;
  /** True when today's run already existed and was returned instead of a new one. */
  reused: boolean;
}

/**
 * Open a run for today, or hand back the one that already exists.
 *
 * `(run_date, trigger)` is unique, so a cron retry after a timeout — or an
 * admin double-clicking "Run now" — cannot start a second sweep and spend the
 * quota twice. `force` is what the button sends when a refresh is genuinely
 * wanted on a day that already ran.
 */
export async function startRun(
  supabase: SupabaseClient,
  options: { trigger: RunTrigger; triggeredBy?: string | null; force?: boolean; now?: Date }
): Promise<StartRunResult> {
  const runDate = istDate(options.now);

  const { data: existing } = await supabase
    .from("opportunity_runs")
    .select("*")
    .eq("run_date", runDate)
    .eq("trigger", options.trigger)
    .maybeSingle();

  if (existing) {
    // A run left `running` by a crashed invocation must not block today
    // forever — reopen it rather than refusing to work.
    const stale = existing.status === "running";
    if (!options.force && !stale) return { run: toRun(existing), reused: true };

    const { data: reopened, error } = await supabase
      .from("opportunity_runs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        duration_ms: null,
        error: null,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw new Error(`Could not reopen today's run: ${error.message}`);
    return { run: toRun(reopened), reused: false };
  }

  const { data, error } = await supabase
    .from("opportunity_runs")
    .insert({
      trigger: options.trigger,
      triggered_by: options.triggeredBy ?? null,
      run_date: runDate,
      status: "running",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Could not open a run: ${error.message}`);
  return { run: toRun(data), reused: false };
}

/** Close a run, recording its counts, duration and any error. */
export async function finishRun(
  supabase: SupabaseClient,
  runId: string,
  outcome: {
    status: RunStatus;
    startedAt: string;
    counts?: RunCounts;
    sources?: RunSource[];
    error?: string | null;
    model?: string | null;
  }
): Promise<void> {
  const finishedAt = new Date();
  const patch: Record<string, unknown> = {
    status: outcome.status,
    finished_at: finishedAt.toISOString(),
    duration_ms: Math.max(0, finishedAt.getTime() - new Date(outcome.startedAt).getTime()),
    ...(outcome.counts ?? {}),
  };
  if (outcome.sources) patch.sources = outcome.sources;
  if (outcome.error !== undefined) patch.error = outcome.error;
  if (outcome.model !== undefined) patch.model = outcome.model;

  const { error } = await supabase.from("opportunity_runs").update(patch).eq("id", runId);
  if (error) console.error(`[opportunity-runs] could not close ${runId}: ${error.message}`);
}

export async function listRuns(supabase: SupabaseClient, limit = 30): Promise<OpportunityRun[]> {
  const { data, error } = await supabase
    .from("opportunity_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not load runs: ${error.message}`);
  return (data ?? []).map(toRun);
}

export interface DailyStat {
  day: string;
  discovered: number;
  verified: number;
  retired: number;
  runs: number;
  avgDurationMs: number | null;
  rechecked: number;
}

export async function listDailyStats(supabase: SupabaseClient, days = 7): Promise<DailyStat[]> {
  const { data, error } = await supabase
    .from("opportunity_daily_stats")
    .select("*")
    .limit(days);

  if (error) throw new Error(`Could not load daily stats: ${error.message}`);

  return (data ?? []).map((row) => ({
    day: String(row.day),
    discovered: Number(row.discovered ?? 0),
    verified: Number(row.verified ?? 0),
    retired: Number(row.retired ?? 0),
    runs: Number(row.runs ?? 0),
    avgDurationMs: row.avg_duration_ms == null ? null : Number(row.avg_duration_ms),
    rechecked: Number(row.rechecked ?? 0),
  }));
}
