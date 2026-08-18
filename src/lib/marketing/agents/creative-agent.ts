// Creative Agent (spec Sections 13–15): selects platforms + variants, composes
// the graphics via the creative engine, records them as AI-generated assets
// tagged with their content version.

import path from "node:path";
import { promises as fs } from "node:fs";
import type { CampaignAsset, CampaignFact, Platform } from "../domain";
import type { StorageProvider } from "../storage";
import { composeCreative, type CreativeOptions, type CreativeVariant, PLATFORM_SPECS } from "./creative-engine";

export const DEFAULT_CREATIVE_PLATFORMS: Platform[] = ["instagram", "facebook", "website", "linkedin", "whatsapp"];

export interface CreativeJob {
  platform: string;
  variant: CreativeVariant;
  style: "dark" | "light";
  title?: string;
  tagline?: string;
}

export async function generateCreatives(
  campaignId: string,
  version: number,
  facts: CampaignFact[],
  store: StorageProvider,
  jobs: CreativeJob[],
  run: (agent: string, summary: string) => Promise<void> | void
): Promise<CampaignAsset[]> {
  const assets = await store.listAssets(campaignId);
  const usable = assets.filter((a) => a.type === "image" && !a.aiGenerated);
  if (!usable.length) {
    await run("Creative Agent", "No photographs available — skipped image generation.");
    return [];
  }

  const brand = await store.getBrand();

  /*
   * Retire the previous generation before composing a new one.
   *
   * Every pipeline run used to insert a fresh row per platform with a
   * timestamped id, while writing to the same filename. Three runs left fifteen
   * cards in the Media tab — most of them pointing at a file that had since
   * been overwritten. Archiving first, plus the deterministic id below, means
   * the library shows exactly one current creative per platform.
   */
  for (const stale of assets.filter((a) => a.aiGenerated && !a.archived)) {
    await store.saveAsset({ ...stale, archived: true });
  }

  const created: CampaignAsset[] = [];
  for (const job of jobs) {
    const spec = PLATFORM_SPECS[job.platform];
    if (!spec) continue;
    const relDir = path.join(".data", "marketing", "media", campaignId, `v${version}`);
    const absDir = path.join(process.cwd(), relDir);
    const outFile = path.join(absDir, `${job.platform}-${job.variant}-${job.style}.jpg`);

    await composeCreative(campaignId, job.platform, usable, facts, { ...job, colors: brand.colors, collegeName: brand.collegeName }, outFile);
    const stat = await fs.stat(outFile);

    const asset: CampaignAsset = {
      // Deterministic: one row per platform/variant/style, so regenerating
      // upserts the existing creative rather than stacking another copy.
      id: `as_${campaignId.slice(-6)}_${job.platform}_${job.variant}_${job.style}`,
      campaignId,
      archived: false,
      type: "image",
      originalFile: outFile,
      processedFile: path.join(relDir, path.basename(outFile)),
      mimeType: "image/jpeg",
      sizeBytes: stat.size,
      aiGenerated: true,
      metadata: {
        platform: job.platform,
        variant: job.variant,
        style: job.style,
        contentVersion: version,
        width: spec.width,
        height: spec.height,
      },
      observations: [`AI-composed ${spec.label} graphic from uploaded photographs (variant: ${job.variant}).`],
      createdAt: new Date().toISOString(),
    };
    await store.saveAsset(asset);
    created.push(asset);
  }

  void run("Creative Agent", `Composed ${created.length} platform graphic${created.length === 1 ? "" : "s"} from real photographs.`);
  return created;
}