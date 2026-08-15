// Campaign list + create (spec Section 47).

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/marketing/api-guard";
import { store } from "@/lib/marketing/storage";
import { createCampaign } from "@/lib/marketing/pipeline";
import { isCampaignType } from "@/lib/marketing/domain";
import { isDevMode } from "@/lib/marketing/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const campaigns = await store.listCampaigns();
  return NextResponse.json({ campaigns, dev: isDevMode() });
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { title?: string; type?: string; createdBy?: string };
  if (!body.title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });
  // Validated against the domain list rather than a hand-copied one, so the
  // route cannot drift from CampaignType (and from the Postgres enum) again.
  if (!isCampaignType(body.type)) {
    return NextResponse.json({ error: "invalid campaign type" }, { status: 400 });
  }
  const campaign = await createCampaign(store, {
    title: body.title.trim(),
    type: body.type,
    createdBy: body.createdBy ?? "admin",
    source: "manual",
  });
  return NextResponse.json({ campaign }, { status: 201 });
}