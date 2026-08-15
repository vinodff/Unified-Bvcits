// Run the agent pipeline for a campaign (spec Section 30).

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/marketing/api-guard";
import { store } from "@/lib/marketing/storage";
import { runCampaignPipeline } from "@/lib/marketing/pipeline";
import { buildCampaignDetail } from "@/lib/marketing/api-payload";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const campaign = await store.getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  try {
    const updated = await runCampaignPipeline(store, id, { actor: "admin" });
    const detail = await buildCampaignDetail(id);
    return NextResponse.json({ campaign: updated, detail });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}