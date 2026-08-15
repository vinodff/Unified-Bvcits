// Content Strategy Agent (spec Section 8): objective, audience, message hierarchy,
// per-platform strategy, recommended times. Outputs JSON from the LLM provider.

import type { CampaignFact, CampaignType } from "../domain";
import { getLlm } from "../providers/llm";
import type { StorageProvider } from "../storage";

export interface StrategyOutput {
  objective: string;
  audience: string[];
  primaryMessage: string;
  secondaryMessage: string;
  cta: string;
  tone: string;
  contentTypes: string[];
  platformStrategy: Record<string, string>;
  recommendedTimes: Record<string, string>;
  recommendBlog: boolean;
  recommendCarousel: boolean;
  multiplePosts: boolean;
}

export function factsToRecord(facts: CampaignFact[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of facts) out[f.field] = f.value;
  return out;
}

export const DEFAULT_CTA = "Admissions Open 2026–27 · Counselling Code BVTS · Call +91 99854 22678";

export async function generateStrategy(campaignId: string, type: CampaignType, store: StorageProvider): Promise<StrategyOutput> {
  const facts = factsToRecord(await store.listFacts(campaignId));
  const llm = getLlm("strategy");
  const res = await llm.complete({
    kind: "strategy",
    instruction: "Produce the content strategy JSON for this institutional campaign. Ground every statement in context.facts. Do not invent statistics.",
    context: { facts, type, campaignId },
    jsonSchemaHint: true,
  });
  try {
    return JSON.parse(res.text) as StrategyOutput;
  } catch {
    // Deterministic fallback — keeps the pipeline functional with mock routing.
    const departments = facts.departments as string[] | undefined;
    return {
      objective: `Promote ${String(facts.type ?? type)} outcomes and strengthen BVCITS brand in Amalapuram / Konaseema`,
      audience: ["Prospective students & parents", "Alumni", "Faculty", "Local media"],
      primaryMessage: String(facts.title ?? "BVCITS event"),
      secondaryMessage: `${departments?.length ? departments.join(", ") + " students" : "Students"} participation drives outcomes`,
      cta: DEFAULT_CTA,
      tone: "premium_institutional",
      contentTypes: ["website_article", "instagram_post", "facebook_post", "linkedin_post", "whatsapp_message"],
      platformStrategy: {
        instagram: "Visual + emotional + concise",
        facebook: "More contextual, community-focused",
        linkedin: "Professional + institutional + achievement-oriented",
        whatsapp: "Short broadcast/announcement message",
        website: "Detailed event article",
      },
      recommendedTimes: { instagram: "19:00", facebook: "19:05", linkedin: "08:00", whatsapp: "18:00" },
      recommendBlog: true,
      recommendCarousel: Array.isArray(facts.images) ? (facts.images as string[]).length >= 3 : false,
      multiplePosts: true,
    };
  }
}