// Asset upload (spec Section 16): photographs only, size-capped, stored under
// .data/marketing/uploads/<campaignId>/. Never AI-flagged.

import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/marketing/api-guard";
import { store } from "@/lib/marketing/storage";
import { newId, nowIso } from "@/lib/marketing/storage";
import type { CampaignAsset } from "@/lib/marketing/domain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SIZE = 15 * 1024 * 1024;
const ALLOWED = /\.(jpe?g|png|webp|gif)$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const campaign = await store.getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart form required" }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "files required" }, { status: 400 });

  const uploadRoot = path.join(process.cwd(), ".data", "marketing", "uploads", id);
  await fs.mkdir(uploadRoot, { recursive: true });

  const assets: CampaignAsset[] = [];
  for (const file of files) {
    if (!ALLOWED.test(file.name)) return NextResponse.json({ error: `Unsupported file type: ${file.name}` }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: `${file.name} exceeds 15MB` }, { status: 413 });
    const ext = path.extname(file.name).toLowerCase();
    const filename = `${newId("img")}${ext}`;
    const abs = path.join(uploadRoot, filename);
    await fs.writeFile(abs, Buffer.from(await file.arrayBuffer()));
    const asset: CampaignAsset = {
      id: newId("as"),
      campaignId: id,
      originalFile: abs,
      type: "image",
      mimeType: file.type || "image/jpeg",
      sizeBytes: file.size,
      aiGenerated: false,
      metadata: { originalName: file.name },
      createdAt: nowIso(),
    };
    await store.saveAsset(asset);
    assets.push(asset);
  }

  await store.appendAudit({ id: newId("audit"), at: nowIso(), actor: "admin", action: "assets_uploaded", entity: "campaign", entityId: id, detail: { count: assets.length } });
  return NextResponse.json({ assets }, { status: 201 });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  return NextResponse.json({ assets: await store.listAssets(id) });
}