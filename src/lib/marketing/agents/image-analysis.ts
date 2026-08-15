// Image Analysis Agent (spec Section 7): runs the vision provider over uploaded
// photographs, records dimensions (sharp), and stores observations as
// AI observations — never as identity claims.

import sharp from "sharp";
import type { CampaignAsset, CampaignFact } from "../domain";
import { getVision } from "../providers/vision";
import type { StorageProvider } from "../storage";

export async function analyzeCampaignAssets(campaignId: string, store: StorageProvider, run: (agent: string, summary: string) => Promise<void> | void): Promise<void> {
  const assets = await store.listAssets(campaignId);
  const images = assets.filter((a) => a.type === "image");
  if (!images.length) {
    await run("Image Analysis Agent", "No photographs uploaded — skipped.");
    return;
  }

  const vision = getVision();
  const observations: string[] = [];
  let dimensionErrors = 0;

  for (const asset of images) {
    try {
      const meta = await sharp(asset.originalFile).metadata();
      asset.dimensions = { width: meta.width ?? 0, height: meta.height ?? 0 };
      const obs = await vision.analyze(asset.originalFile, asset.metadata?.adminTags as string[] | undefined);
      asset.observations = [
        obs.summary,
        `${meta.width}×${meta.height}px, ${meta.format?.toUpperCase() ?? "unknown"} image.`,
        obs.people === "group" ? "Multiple people visible." : obs.people === "single" ? "Single person prominent." : "No faces detected.",
        ...(obs.banner ? ["Event banner/backdrop visible."] : []),
        ...(obs.trophy ? ["Trophy/prize visible."] : []),
        ...(obs.winners ? ["Winners group visible (per administrator tags)."] : []),
        ...(obs.stage ? ["Stage/dais visible."] : []),
        ...(obs.audience ? ["Audience visible."] : []),
      ];
      observations.push(`${asset.id}: ${obs.summary}`);
      await store.saveAsset(asset);
    } catch {
      dimensionErrors++;
    }
  }

  await run(
    "Image Analysis Agent",
    `Analyzed ${images.length} photograph${images.length > 1 ? "s" : ""}${dimensionErrors ? ` (${dimensionErrors} failed metadata extraction)` : ""}.`
  );

  // Store a single aggregate observation fact (never identities).
  const facts = await store.listFacts(campaignId);
  const agg: CampaignFact = {
    field: "imageAnalysis",
    value: observations.slice(0, 20),
    source: "ai_observation",
    confidence: 0.6,
    verified: false,
  };
  await store.replaceFacts(campaignId, [...facts.filter((f) => f.field !== "imageAnalysis"), agg]);
}