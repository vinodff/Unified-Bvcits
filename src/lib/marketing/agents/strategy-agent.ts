// Content Strategy Agent (spec Section 8): objective, audience, message hierarchy,
// per-platform strategy, recommended times. Outputs JSON from the LLM provider.

import type { CampaignFact, CampaignType } from "../domain";
import { getLlm } from "../providers/llm";
import {
  asBoolean,
  asString,
  asStringList,
  asStringMap,
  coerceShape,
  parseLlmJson,
} from "../providers/llm-json";
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

/**
 * The deterministic strategy every campaign is guaranteed to get.
 *
 * Also the floor the model's output is merged over: any field the model omits
 * or malforms falls back to the value here, so downstream agents always receive
 * a complete StrategyOutput.
 */
export function fallbackStrategy(facts: Record<string, unknown>, type: CampaignType): StrategyOutput {
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

/**
 * Coerce whatever the model returned into a valid StrategyOutput.
 *
 * Exported so it can be tested against real malformed responses without needing
 * a live model. `repaired` lists the fields that had to fall back.
 */
export function normalizeStrategy(
  parsed: unknown,
  fallback: StrategyOutput
): { strategy: StrategyOutput; repaired: string[] } {
  const { value, repaired } = coerceShape(parsed, fallback as unknown as Record<string, unknown>, {
    objective: { aliases: ["goal", "campaignObjective"], read: asString },
    audience: { aliases: ["targetAudience", "audiences"], read: asStringList },
    primaryMessage: { aliases: ["mainMessage", "headline", "keyMessage"], read: asString },
    secondaryMessage: { aliases: ["supportingMessage", "subMessage"], read: asString },
    cta: { aliases: ["callToAction"], read: asString },
    tone: { aliases: ["voice", "toneOfVoice"], read: asString },
    contentTypes: { aliases: ["formats", "deliverables"], read: asStringList },
    // The field whose absence crashed the writing agent.
    platformStrategy: { aliases: ["platforms", "channelStrategy", "perPlatform"], read: asStringMap },
    recommendedTimes: { aliases: ["postingTimes", "schedule", "timing"], read: asStringMap },
    recommendBlog: { aliases: ["blog", "includeBlog"], read: asBoolean },
    recommendCarousel: { aliases: ["carousel", "includeCarousel"], read: asBoolean },
    multiplePosts: { aliases: ["recommendMultiplePosts", "seriesOfPosts"], read: asBoolean },
  } as never);

  return { strategy: value as unknown as StrategyOutput, repaired };
}

export interface StrategyResult {
  strategy: StrategyOutput;
  /** Fields the model failed to supply usably; empty means a clean response. */
  repaired: string[];
}

export async function generateStrategy(campaignId: string, type: CampaignType, store: StorageProvider): Promise<StrategyResult> {
  const facts = factsToRecord(await store.listFacts(campaignId));
  const fallback = fallbackStrategy(facts, type);

  const llm = getLlm("strategy");
  const res = await llm.complete({
    kind: "strategy",
    instruction:
      "Produce the content strategy JSON for this institutional campaign. Ground every statement in context.facts. Do not invent statistics. " +
      "Return a single flat JSON object with exactly these keys: objective, audience, primaryMessage, secondaryMessage, cta, tone, contentTypes, " +
      "platformStrategy, recommendedTimes, recommendBlog, recommendCarousel, multiplePosts. Do not nest them under a wrapper key.",
    context: { facts, type, campaignId },
    jsonSchemaHint: true,
  });

  const parsed = parseLlmJson(res.text);
  if (!parsed) {
    // Unparseable output is a total repair, not a silent pass-through.
    return { strategy: fallback, repaired: ["<entire response unparseable>"] };
  }
  return normalizeStrategy(parsed, fallback);
}