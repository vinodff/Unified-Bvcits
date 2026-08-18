// Campaign detail, edit, delete (spec Section 47).

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/marketing/api-guard";
import { store } from "@/lib/marketing/storage";
import { newId, nowIso } from "@/lib/marketing/storage";
import { buildCampaignDetail } from "@/lib/marketing/api-payload";
import { setCampaignStatus } from "@/lib/marketing/agents/supervisor";
import { factCheck } from "@/lib/marketing/agents/fact-check";
import { canTransition } from "@/lib/marketing/state-machine";
import type { CampaignFact, CampaignStatus, Platform } from "@/lib/marketing/domain";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const detail = await buildCampaignDetail(id);
  if (!detail) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const campaign = await store.getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    facts?: CampaignFact[];
    schedule?: { platforms: Platform[]; times: Record<string, string>; tz: string };
    status?: CampaignStatus;
    note?: string;
  };

  /*
   * Explicit admin status moves: "Request changes" from the review screen, and
   * releasing a campaign that a dead pipeline run left in GENERATING.
   *
   * Only these two are allowed. Approval and publishing deliberately do not go
   * through here — they have their own routes that re-verify server-side, and a
   * generic status setter would be a way around the approval gate.
   */
  if (body.status) {
    const ALLOWED: CampaignStatus[] = ["CHANGES_REQUESTED", "DRAFT"];
    if (!ALLOWED.includes(body.status)) {
      return NextResponse.json(
        { error: `Status ${body.status} cannot be set directly. Use the approve or publish route.` },
        { status: 400 }
      );
    }
    if (!canTransition(campaign.status, body.status)) {
      return NextResponse.json(
        { error: `Cannot move a campaign from ${campaign.status} to ${body.status}.` },
        { status: 409 }
      );
    }
    await setCampaignStatus(store, campaign, body.status, "admin", { note: body.note ?? "set by admin" });
    return NextResponse.json({ campaign });
  }

  let changed = false;
  if (body.title?.trim()) {
    campaign.title = body.title.trim();
    changed = true;
  }
  if (body.schedule) {
    campaign.schedule = {
      platforms: body.schedule.platforms,
      times: body.schedule.times,
      tz: body.schedule.tz ?? "Asia/Kolkata",
    };
    changed = true;
  }
  if (body.facts) {
    const adminFacts: CampaignFact[] = body.facts.map((f) => ({ ...f, source: "admin", verified: true, confidence: 1 }));
    await store.replaceFacts(id, adminFacts);
    const fc = await factCheck(adminFacts, store);
    changed = true;
    if (fc.warnings.length) {
      await store.appendAudit({ id: newId("audit"), at: nowIso(), actor: "admin", action: "facts_updated", entity: "campaign", entityId: id, detail: { warnings: fc.warnings.slice(0, 5) } });
    }
  }

  if (changed) {
    campaign.updatedAt = nowIso();
    if (["APPROVED", "SCHEDULED", "PUBLISHING"].includes(campaign.status)) {
      // Any edit after approval invalidates it and sends the campaign back.
      await store.invalidateApprovals(id);
      campaign.approvalInvalidated = true;
      campaign.approvedVersion = undefined;
      await setCampaignStatus(store, campaign, "CHANGES_REQUESTED", "admin", { note: "content edited after approval" });
    } else {
      await store.saveCampaign(campaign);
    }
  }

  return NextResponse.json({ campaign });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const campaign = await store.getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  campaign.deletedAt = nowIso();
  campaign.updatedAt = nowIso();
  await store.saveCampaign(campaign);
  await store.appendAudit({ id: newId("audit"), at: nowIso(), actor: "admin", action: "campaign_deleted", entity: "campaign", entityId: id, detail: {} });
  return NextResponse.json({ ok: true });
}