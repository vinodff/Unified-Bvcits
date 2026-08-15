// Audit log (spec Section 24) + worker tick (spec Section 29).

import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/marketing/storage";
import { runDueJobs } from "@/lib/marketing/queue";
import { isDevMode } from "@/lib/marketing/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(500, Number(searchParams.get("limit") ?? 200));
  return NextResponse.json({ audit: await store.listAudit(limit) });
}

/**
 * Worker tick — callable via cron/vercel.json. Protected by an optional
 * MARKETING_WORKER_SECRET; in DEV MODE it runs without a secret but only
 * processes due, preflight-validated jobs (never skips approval checks).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.MARKETING_WORKER_SECRET;
  if (secret && req.headers.get("x-worker-secret") !== secret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!secret && !isDevMode()) {
    return NextResponse.json({ error: "set MARKETING_WORKER_SECRET in production" }, { status: 403 });
  }
  const result = await runDueJobs(store);
  return NextResponse.json({ ok: true, ...result });
}