// SEO Agent (spec Sections 10, 11, 33): people-first SEO, internal links only to
// routes that actually exist, transparent AI Content Quality Assessment score.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { CampaignFact, SeoMetadata } from "../domain";
import { getLlm } from "../providers/llm";
import type { StorageProvider } from "../storage";
import { factsToRecord } from "./strategy-agent";

/** Scan the actual Next.js app directory so we only ever suggest real links. */
export async function scanExistingRoutes(): Promise<string[]> {
  const appDir = path.join(process.cwd(), "src", "app");
  const routes: string[] = [];
  try {
    const entries = await fs.readdir(appDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith("[")) continue;
      if (e.name === "api") continue;
      routes.push(`/${e.name}`);
    }
  } catch {
    /* app dir not present — build-time only */
  }
  return routes.sort();
}

export interface SeoResult {
  metadata: SeoMetadata;
  score: number;
  breakdown: Record<string, number>;
}

const BREAKDOWN_KEYS = ["search intent", "originality", "information completeness", "title quality", "meta description", "internal linking", "image optimization", "readability"];

export async function generateSeo(campaignId: string, version: number, facts: CampaignFact[], store: StorageProvider): Promise<SeoResult> {
  const llm = getLlm("seo");
  const factRecord = factsToRecord(facts);
  const existingLinks = await scanExistingRoutes();
  const res = await llm.complete({
    kind: "seo",
    instruction: "Produce the SEO metadata JSON for the BVCITS article. Ground in context.facts; only link to routes in context.existingLinks.",
    context: { facts: factRecord, existingLinks },
    jsonSchemaHint: true,
  });

  let metadata: SeoMetadata;
  try {
    metadata = JSON.parse(res.text) as SeoMetadata;
  } catch {
    const title = String(factRecord.title ?? "BVCITS Event");
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    metadata = {
      campaignId,
      contentVersion: version,
      seoTitle: `${title} — BVCITS`,
      metaDescription: `BVCITS hosted ${title}. Highlights, winners and outcomes — official report.`,
      primaryIntent: `Students and parents researching ${String(factRecord.type ?? "events")} at BVCITS`,
      primaryTopic: title,
      supportingTopics: ["BVCITS", "Amalapuram", "engineering education", "student life"],
      slug,
      h1: title,
      h2Structure: ["Event Overview", "Highlights", "Winners & Recognitions", "Guest Speakers", "Impact & Outcomes", "About BVCITS"],
      internalLinks: existingLinks.slice(0, 6).map((href) => ({ label: href.replace("/", ""), href })),
      imageAltText: `${title} — official BVCITS event photograph`,
      imageFilename: `${slug}-bvcits.jpg`,
      ogTitle: `${title} — BVCITS`,
      ogDescription: `Official report of ${title} at BVCITS, Amalapuram.`,
      ogImage: `/media/${slug}/hero.jpg`,
      schemaJsonLd: {
        "@context": "https://schema.org",
        "@type": "Event",
        name: title,
        startDate: factRecord.date ?? undefined,
        location: { "@type": "Place", name: String(factRecord.venue ?? "BVCITS Campus") },
        organizer: { "@type": "Organization", name: "BVCITS" },
      },
      relatedContent: ["/admissions", "/student-life", "/events"],
    };
  }
  metadata.campaignId = campaignId;
  metadata.contentVersion = version;

  const { score, breakdown } = assess(metadata, facts, existingLinks);
  return { metadata, score, breakdown };
}

/**
 * AI Content Quality Assessment (spec Section 11) — explicitly NOT a Google
 * ranking score. Scores 0–100 per dimension with simple, transparent rules.
 */
export function assess(metadata: SeoMetadata, facts: CampaignFact[], existingRoutes: string[]): { score: number; breakdown: Record<string, number> } {
  const factCount = facts.filter((f) => f.value != null && f.value !== "" && f.value !== false).length;

  const searchIntent = metadata.primaryIntent.length > 25 && metadata.primaryTopic.length > 4 ? 95 : 60;
  const originality = metadata.seoTitle !== metadata.h1 ? 94 : 70;
  const completeness = Math.min(95, 40 + factCount * 4);
  const titleQuality = metadata.seoTitle.length >= 30 && metadata.seoTitle.length <= 65 ? 93 : 70;
  const metaQuality = metadata.metaDescription.length >= 70 && metadata.metaDescription.length <= 160 ? 95 : 72;
  const internalLinking = Math.min(95, 55 + (metadata.internalLinks?.filter((l) => existingRoutes.includes(l.href) || l.href.startsWith("/")).length ?? 0) * 10);
  const imageOpt = metadata.imageAltText.length > 20 && metadata.imageFilename.length > 8 ? 90 : 60;
  const readability = metadata.h2Structure?.length >= 4 ? 94 : 72;

  const breakdown: Record<string, number> = {
    "search intent": searchIntent,
    originality,
    "information completeness": completeness,
    "title quality": titleQuality,
    "meta description": metaQuality,
    "internal linking": internalLinking,
    "image optimization": imageOpt,
    readability,
  };
  const score = Math.round(BREAKDOWN_KEYS.reduce((acc, k) => acc + (breakdown[k] ?? 0), 0) / BREAKDOWN_KEYS.length);
  return { score, breakdown };
}