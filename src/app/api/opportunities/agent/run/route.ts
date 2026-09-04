// Opportunities Agent — the daily run.
//
// Phase 1 (this file today) re-verifies published opportunities and retires the
// ones that are no longer live. Phase 2 adds discovery of new ones in front of
// the sweep; the ledger already has columns for it, so wiring it in does not
// change this route's shape.
//
// Wired up in vercel.json:
//   { "path": "/api/opportunities/agent/run", "schedule": "0 3 * * *" }
// 03:00 UTC = 08:30 IST, offset from the blog agent's 01:30 UTC so the two
// agents do not contend for the same free-tier window.

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { runRefresh, DEFAULT_SWEEP_LIMIT } from "@/lib/opportunities/refresh";
import { runDiscovery } from "@/lib/opportunities/discover";
import { startRun, finishRun } from "@/lib/opportunities/runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

interface Caller {
  ok: boolean;
  trigger: "cron" | "manual";
  userId: string | null;
}

/**
 * Two accepted callers: the platform scheduler holding CRON_SECRET, and a
 * signed-in user with `opportunities.moderate`.
 *
 * When CRON_SECRET is unset the secret path is closed rather than open — the
 * blog cron's reasoning applies unchanged: an unauthenticated endpoint that
 * fires off dozens of outbound requests on every call is a denial-of-wallet
 * hole, not a convenience.
 */
async function authorise(req: NextRequest): Promise<Caller> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) {
    return { ok: true, trigger: "cron", userId: null };
  }

  const user = await getSessionUser();
  if (user && can(user.role, "opportunities.moderate")) {
    return { ok: true, trigger: "manual", userId: user.id };
  }

  return { ok: false, trigger: "manual", userId: null };
}

/**
 * Vercel invokes a cron with **GET**, so that verb has to be the one the
 * scheduler can reach — a POST-only route would deploy fine, report no error,
 * and simply never run. POST is kept for the "Run now" button, which is a
 * state-changing user action and should not be a GET.
 */
export async function GET(req: NextRequest) {
  return handleRun(req);
}

export async function POST(req: NextRequest) {
  return handleRun(req);
}

async function handleRun(req: NextRequest) {
  const caller = await authorise(req);
  if (!caller.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = new URL(req.url).searchParams.get("force") === "1";
  const supabase = getServiceClient();

  let run;
  try {
    const started = await startRun(supabase, {
      trigger: caller.trigger,
      triggeredBy: caller.userId,
      force,
    });

    // Already ran today and nobody asked for a repeat: report the existing run
    // rather than sweeping the same rows twice.
    if (started.reused) {
      return NextResponse.json({ ok: true, reused: true, run: started.run });
    }
    run = started.run;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  // The work is awaited, not fired and forgotten. The placement pipeline's
  // `void runPipeline(...)` works because a human is polling it; on a cron
  // invocation an un-awaited promise can be cut off the moment the response is
  // returned, and Vercel makes no delivery guarantee without waitUntil.
  try {
    /*
     * Discovery first, then the sweep.
     *
     * That order matters: a listing found this morning is checked in the same
     * run rather than waiting a day, and the sweep's oldest-first queue picks
     * up anything discovery could not reach.
     *
     * Discovery is allowed to fail without failing the run. Searching the web
     * depends on a third-party model and a dozen third-party sites; retiring
     * dead links depends on neither. Letting a search outage cancel the
     * retirement sweep would mean the feed silently keeps showing closed
     * opportunities on exactly the days the agent is least healthy.
     */
    let discovery: Awaited<ReturnType<typeof runDiscovery>> | null = null;
    let discoveryError: string | null = null;
    try {
      discovery = await runDiscovery(supabase, { runId: run.id });
    } catch (error) {
      discoveryError = (error as Error).message;
      console.error("[opportunity-agent] discovery failed:", discoveryError);
    }

    const summary = await runRefresh(supabase, { runId: run.id, limit: DEFAULT_SWEEP_LIMIT });

    await finishRun(supabase, run.id, {
      // `partial` is an honest third state: the sweep worked, discovery did not.
      status: discoveryError ? "partial" : "success",
      startedAt: run.startedAt,
      counts: {
        rechecked: summary.rechecked,
        retired: summary.retired,
        pages_searched: discovery?.pagesSearched ?? 0,
        extracted: discovery?.extracted ?? 0,
        verified: discovery?.verified ?? 0,
        pending: discovery?.pending ?? 0,
        rejected: discovery?.rejected ?? 0,
        duplicates: discovery?.duplicates ?? 0,
      },
      sources: discovery?.sources ?? [],
      model: discovery?.model ?? null,
      error: discoveryError,
    });

    // Both halves change what students see.
    if (summary.retired > 0 || (discovery?.verified ?? 0) > 0) {
      revalidatePath("/dashboard/opportunities");
    }

    return NextResponse.json({
      ok: true,
      reused: false,
      runId: run.id,
      discovery: discovery
        ? {
            pagesSearched: discovery.pagesSearched,
            extracted: discovery.extracted,
            verified: discovery.verified,
            pending: discovery.pending,
            rejected: discovery.rejected,
            sources: discovery.sources,
            added: discovery.added,
          }
        : { error: discoveryError },
      rechecked: summary.rechecked,
      retired: summary.retired,
      // Only the rows that actually changed state — a full dump of 40 "still
      // fine" checks is noise in a cron log.
      retirements: summary.outcomes
        .filter((o) => o.retired)
        .map((o) => ({ title: o.title, url: o.applyUrl, evidence: o.evidence })),
    });
  } catch (error) {
    const message = (error as Error).message;
    await finishRun(supabase, run.id, {
      status: "failed",
      startedAt: run.startedAt,
      error: message,
    });
    return NextResponse.json({ error: message, runId: run.id }, { status: 500 });
  }
}
