import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { checkLiveness, nextFailureCount, shouldRetire, type LivenessResult } from "./liveness";

/**
 * The daily liveness sweep — re-checks published opportunities and retires the
 * ones that are no longer live.
 *
 * Runs against the service client: `opportunities` grants UPDATE only to
 * `is_admin()`, and this is a cron with no user attached.
 *
 * Two deliberate limits:
 *
 *   * **Bounded per run.** The sweep takes the least-recently-checked rows
 *     first and stops at `limit`. A Vercel invocation has a wall clock, and a
 *     sweep that tries to verify the whole table in one go eventually exceeds
 *     it and verifies nothing. Oldest-first means every row is still reached,
 *     just across several nights.
 *
 *   * **Small concurrency.** These are other people's servers. Five at a time
 *     with an honest User-Agent is a crawl; fifty is an incident.
 */

/** Rows re-checked per run. Bounded so one invocation cannot run out of clock. */
export const DEFAULT_SWEEP_LIMIT = 40;
/** Simultaneous outbound requests. Deliberately polite. */
const CONCURRENCY = 5;

export interface RefreshOutcome {
  id: string;
  title: string;
  applyUrl: string;
  verdict: LivenessResult["verdict"];
  evidence: string[];
  retired: boolean;
}

export interface RefreshSummary {
  rechecked: number;
  retired: number;
  outcomes: RefreshOutcome[];
}

interface SweepRow {
  id: string;
  title: string;
  apply_url: string;
  check_failures: number;
}

/** Run `worker` over `items`, at most `size` in flight at once. */
async function inBatches<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(worker))));
  }
  return results;
}

export async function runRefresh(
  supabase: SupabaseClient,
  options: { runId?: string; limit?: number; now?: Date } = {}
): Promise<RefreshSummary> {
  const limit = options.limit ?? DEFAULT_SWEEP_LIMIT;
  const now = options.now ?? new Date();

  // Least-recently-checked first, nulls (never checked) ahead of everything —
  // this is the index created in 0012_opportunity_agent.sql.
  const { data, error } = await supabase
    .from("opportunities")
    .select("id, title, apply_url, check_failures")
    .eq("status", "verified")
    .is("retired_at", null)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(`Could not load the recheck queue: ${error.message}`);

  const rows = (data ?? []) as SweepRow[];
  if (rows.length === 0) return { rechecked: 0, retired: 0, outcomes: [] };

  const outcomes = await inBatches(rows, CONCURRENCY, async (row): Promise<RefreshOutcome> => {
    const result = await checkLiveness(row.apply_url, now);
    const prior = row.check_failures ?? 0;
    const retire = shouldRetire(result.verdict, prior);

    const patch: Record<string, unknown> = {
      last_checked_at: result.checkedAt,
      last_check_result: result.verdict,
      check_failures: nextFailureCount(result.verdict, prior),
    };

    if (retire) {
      patch.retired_at = result.checkedAt;
      // The DB CHECK refuses a retirement with no reason, so this is never
      // allowed to be empty — the fallback exists to satisfy that contract
      // rather than to paper over a missing explanation.
      patch.retired_reason = result.evidence.join(" · ") || `Liveness check returned ${result.verdict}`;
    }
    if (options.runId) patch.last_seen_run = options.runId;

    const { error: updateError } = await supabase.from("opportunities").update(patch).eq("id", row.id);
    if (updateError) {
      // One row failing to save must not abandon the rest of the sweep — but it
      // must not be reported as a successful check either.
      console.error(`[opportunity-refresh] ${row.id}: ${updateError.message}`);
      return {
        id: row.id,
        title: row.title,
        applyUrl: row.apply_url,
        verdict: result.verdict,
        evidence: [...result.evidence, `NOT SAVED: ${updateError.message}`],
        retired: false,
      };
    }

    return {
      id: row.id,
      title: row.title,
      applyUrl: row.apply_url,
      verdict: result.verdict,
      evidence: result.evidence,
      retired: retire,
    };
  });

  return {
    rechecked: outcomes.length,
    retired: outcomes.filter((o) => o.retired).length,
    outcomes,
  };
}
