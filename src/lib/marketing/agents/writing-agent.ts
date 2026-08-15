// Writing Agent (spec Section 9): generates one version per platform, each built
// from the source-of-truth facts object. The mock LLM produces fact-grounded copy;
// the OpenAI provider improves phrasing but is still bound by the same context.

import type { CampaignFact, Platform } from "../domain";
import { getLlm } from "../providers/llm";
import type { StorageProvider } from "../storage";
import { factsToRecord, type StrategyOutput } from "./strategy-agent";

export interface WrittenContent {
  platform: Platform;
  body: string;
  title?: string;
  claims: string[];
}

export async function writeContent(
  campaignId: string,
  platform: Platform,
  facts: CampaignFact[],
  strategy: StrategyOutput,
  store: StorageProvider,
  version: number
): Promise<WrittenContent> {
  const llm = getLlm("writing");
  const factRecord = factsToRecord(facts);
  const brand = await store.getBrand();

  const hashtags = [
    ...brand.officialHashtags,
    ...(factRecord.title
      ? [`#${String(factRecord.title).replace(/[^a-z0-9]+/gi, "")}`]
      : []),
  ].slice(0, 6);

  const res = await llm.complete({
    kind: "writing",
    instruction: `Write the ${platform} version for this BVCITS campaign. Assert ONLY facts present in context.facts (values may be re-worded, never changed). No invented names/dates/prizes. Tone: ${strategy.tone}.`,
    context: {
      facts: factRecord,
      platform,
      tone: strategy.tone,
      cta: strategy.cta,
      hashtags,
      strategy: strategy.platformStrategy[platform],
    },
    temperature: platform === "whatsapp" ? 0.2 : 0.5,
  });

  const claims = extractClaims(facts);
  const title = platform === "website" ? String(factRecord.title ?? "") : undefined;

  void store; // storage writes happen in the pipeline (versions)
  void campaignId;
  void version;
  return { platform, body: res.text.trim(), title, claims };
}

/** Grounding: every claim the copy may reference must exist in the fact base. */
function extractClaims(facts: CampaignFact[]): string[] {
  const claims: string[] = [];
  for (const f of facts) {
    if (f.value == null) continue;
    if (Array.isArray(f.value)) {
      for (const v of f.value) if (typeof v === "string" && v.length > 2) claims.push(v);
    } else if (typeof f.value === "string" && f.value.length > 2) {
      claims.push(f.value);
    }
  }
  return claims.slice(0, 40);
}