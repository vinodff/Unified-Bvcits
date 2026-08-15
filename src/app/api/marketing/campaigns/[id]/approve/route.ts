// Approval gate (spec Sections 22, 29): the ONLY road from READY_FOR_REVIEW
// to publishing. Server-side re-verification: content exists for every chosen
// platform, quality gate passed, asset hashes captured at approval time.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/marketing/api-guard";
import { store } from "@/lib/marketing/storage";
import { newId, nowIso } from "@/lib/marketing/storage";
import { schedulePublishing } from "@/lib/marketing/queue";
import { setCampaignStatus } from "@/lib/marketing/agents/supervisor";
import type { Approval, Platform } from "@/lib/marketing/domain";

export const dynamic = "force-dynamic";

const VALID_PLATFORMS: Platform[] = ["website", "instagram", "facebook", "linkedin", "whatsapp"];

async function sha256File(p: string): Promise<string> {
  const buf = await fs.readFile(p);
  return createHash("sha256").update(buf).digest("hex");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const campaign = await store.getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "READY_FOR_REVIEW" && campaign.status !== "APPROVED") {
    return NextResponse.json({ error: `Approval requires READY_FOR_REVIEW (current: ${campaign.status})` }, { status: 409 });
  }

  const body = (await req.json().catch(() => ({}))) as { platforms?: Platform[]; scheduledAt?: string; tz?: string };
  const platforms = (body.platforms ?? []).filter((p) => VALID_PLATFORMS.includes(p));
  if (!platforms.length) return NextResponse.json({ error: "platforms required" }, { status: 400 });
  const scheduledAt = body.scheduledAt ?? new Date(Date.now() + 15 * 60 * 1000).toISOString();
  if (Number.isNaN(Date.parse(scheduledAt))) return NextResponse.json({ error: "invalid scheduledAt" }, { status: 400 });

  const content = await store.listContentVersions(id);
  const versions = new Map(content.map((c) => [c.platform, c.version]));
  for (const p of platforms) {
    if (!versions.has(p)) return NextResponse.json({ error: `No content version for ${p} — run the pipeline first.` }, { status: 409 });
  }
  const version = Math.max(...versions.values());

  // Every chosen platform must have a connected account BEFORE approval is
  // recorded — otherwise we'd leave a half-approved campaign behind.
  const accounts = await store.listSocialAccounts();
  for (const p of platforms) {
    if (!accounts.some((a) => a.platform === p && a.status !== "disconnected")) {
      return NextResponse.json({ error: `No connected ${p} account — connect one in Social Accounts first.` }, { status: 409 });
    }
  }

  // Quality gate must have passed for this version.
  const quality = await store.getQuality(id, version);
  if (!quality || quality.verdict !== "pass") {
    return NextResponse.json({ error: `Quality gate not passed for v${version} (${quality?.verdict ?? "no check"})` }, { status: 409 });
  }

  // Capture hashes of the media that will be published (hash match is
  // re-verified at publish time by the worker).
  const assets = await store.listAssets(id);
  const assetHashes: Record<string, string> = {};
  for (const a of assets.filter((x) => x.aiGenerated)) {
    try {
      assetHashes[a.id] = await sha256File(a.originalFile);
    } catch {
      /* asset file missing — will fail preflight at publish */
    }
  }

  const approval: Approval = {
    id: newId("appr"),
    campaignId: id,
    contentVersion: version,
    approvedBy: "admin",
    approvedAt: nowIso(),
    platforms,
    scheduledAt,
    assetHashes,
    status: "approved",
  };
  await store.saveApproval(approval);
  campaign.approvedVersion = version;
  campaign.approvalInvalidated = false;
  campaign.schedule = {
    platforms,
    times: Object.fromEntries(platforms.map((p) => [p, scheduledAt])) as Record<Platform, string>,
    tz: body.tz ?? "Asia/Kolkata",
  };
  await store.saveCampaign(campaign);
  await setCampaignStatus(store, campaign, "APPROVED", "admin", { note: `approved v${version} for ${platforms.join(", ")}` });

  const jobs = await schedulePublishing(store, campaign, version, "admin");
  return NextResponse.json({ approval, jobs, campaign });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, detail: String((e as Error).stack ?? "") }, { status: 500 });
  }
}