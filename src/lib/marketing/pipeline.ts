// Agent Pipeline (spec Section 30): runs the full production pipeline for one
// campaign. Every step records an AgentRun; the supervisor transitions the
// campaign DRAFT/CHANGES_REQUESTED/GENERATING → GENERATING → quality gate
// → READY_FOR_REVIEW (or back to CHANGES_REQUESTED).

import type { Campaign, ContentVersion, Platform } from "./domain";
import { nowIso, newId, type StorageProvider } from "./storage";
import { analyzeCampaignAssets } from "./agents/image-analysis";
import { generateStrategy, type StrategyOutput } from "./agents/strategy-agent";
import { writeContent } from "./agents/writing-agent";
import { generateSeo } from "./agents/seo-agent";
import { generateCreatives, DEFAULT_CREATIVE_PLATFORMS } from "./agents/creative-agent";
import { runQualityCheck, verdictSummary } from "./agents/quality-agent";
import { factCheck } from "./agents/fact-check";
import {
  recordRun,
  setCampaignStatus,
  saveSupervisorStatus,
  getSupervisorStatus,
  emptySupervisorStatus,
} from "./agents/supervisor";

export interface PipelineOptions {
  /** Re-run everything, or only the listed stages. */
  stages?: ("images" | "strategy" | "writing" | "seo" | "creative" | "quality")[];
  actor?: string;
}

const ALL_STAGES: NonNullable<PipelineOptions["stages"]> = ["images", "strategy", "writing", "seo", "creative", "quality"];

export async function createCampaign(store: StorageProvider, input: { title: string; type: Campaign["type"]; createdBy: string; source?: Campaign["source"] }): Promise<Campaign> {
  const now = nowIso();
  const campaign: Campaign = {
    id: newId("camp"),
    title: input.title,
    type: input.type,
    status: "DRAFT",
    source: input.source ?? "manual",
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  await store.saveCampaign(campaign);
  await store.appendAudit({
    id: newId("audit"),
    at: now,
    actor: input.createdBy,
    action: "campaign_created",
    entity: "campaign",
    entityId: campaign.id,
    detail: { title: campaign.title, type: campaign.type },
  });
  await saveSupervisorStatus(store, campaign.id, emptySupervisorStatus(campaign.id));
  return campaign;
}

export async function runCampaignPipeline(store: StorageProvider, campaignId: string, opts: PipelineOptions = {}): Promise<Campaign> {
  const campaign = (await store.getCampaign(campaignId)) ?? (() => {
    throw new Error(`Campaign ${campaignId} not found`);
  })();
  const actor = opts.actor ?? "supervisor";
  const stages = opts.stages ?? ALL_STAGES;

  if (!["DRAFT", "CHANGES_REQUESTED", "GENERATING"].includes(campaign.status)) {
    throw new Error(`Pipeline cannot run from status ${campaign.status}; only DRAFT / CHANGES_REQUESTED / GENERATING.`);
  }

  await setCampaignStatus(store, campaign, "GENERATING", actor, { note: "pipeline started" });

  const status = (await getSupervisorStatus(store, campaignId)) ?? emptySupervisorStatus(campaignId);
  const facts = await store.listFacts(campaignId);
  const brand = await store.getBrand();
  const platforms: Platform[] = campaign.schedule?.platforms ?? DEFAULT_CREATIVE_PLATFORMS;

  try {
    // 1. Fact check — never blocks, but surfaces review-worthy warnings.
    if (stages.includes("quality")) {
      const fc = await factCheck(facts, store);
      await recordRun(store, campaignId, "Fact-Check Agent", "success", fc.ok ? `No warnings — ${facts.length} facts checked.` : `${fc.warnings.length} review warning(s): ${fc.warnings.slice(0, 3).map((w) => w.message).join(" ")}`);
    }

    // 2. Image analysis (vision over uploaded photographs).
    if (stages.includes("images")) {
      const started = nowIso();
      try {
        status.steps.images = "running" as never;
        await analyzeCampaignAssets(campaignId, store, (agent, summary) => void recordRun(store, campaignId, agent, "success", summary, { startedAt: started }));
        status.steps.images = "done";
      } catch (e) {
        status.steps.images = "failed";
        await recordRun(store, campaignId, "Image Analysis Agent", "failed", "Vision analysis failed", { startedAt: started, error: (e as Error).message });
      }
    }

    // 3. Strategy.
    if (stages.includes("strategy")) {
      const started = nowIso();
      try {
        const strategy = await generateStrategy(campaignId, campaign.type, store);
        campaign.strategy = strategy as unknown as Record<string, unknown>;
        campaign.updatedAt = nowIso();
        await store.saveCampaign(campaign);
        status.steps.strategy = "done";
        await recordRun(store, campaignId, "Content Strategy Agent", "success", `Objective: ${strategy.objective}`, { startedAt: started });
      } catch (e) {
        status.steps.strategy = "failed";
        await recordRun(store, campaignId, "Content Strategy Agent", "failed", "Strategy generation failed", { startedAt: started, error: (e as Error).message });
      }
    }

    // 4. Writing — one version per platform.
    if (stages.includes("writing")) {
      const started = nowIso();
      try {
        const strategy = (campaign.strategy ?? {}) as unknown as StrategyOutput;
        const existing = await store.listContentVersions(campaignId);
        const version = (existing.reduce((m, v) => Math.max(m, v.version), 0)) + 1;
        const versions: ContentVersion[] = [];
        for (const platform of platforms) {
          const written = await writeContent(campaignId, platform, await store.listFacts(campaignId), strategy, store, version);
          const cv: ContentVersion = {
            id: newId("cv"),
            campaignId,
            version,
            platform,
            contentType: platform === "website" ? "article" : "post",
            body: written.body,
            title: written.title ?? null,
            claims: written.claims,
            status: "draft",
            createdAt: nowIso(),
            createdBy: "writing-agent",
          };
          await store.saveContentVersion(cv);
          versions.push(cv);
        }
        status.steps.writing = "done";
        status.contentVersion = version;
        await recordRun(store, campaignId, "Content Writing Agent", "success", `Generated ${versions.length} platform versions (v${version}).`);
        void started;
      } catch (e) {
        status.steps.writing = "failed";
        await recordRun(store, campaignId, "Content Writing Agent", "failed", "Content generation failed", { startedAt: started, error: (e as Error).message });
      }
    }

    // 5. SEO metadata for the website version.
    if (stages.includes("seo")) {
      const started = nowIso();
      try {
        const seo = await generateSeo(campaignId, status.contentVersion, await store.listFacts(campaignId), store);
        await store.saveSeo(seo.metadata);
        status.steps.seo = "done";
        await recordRun(store, campaignId, "SEO Agent", "success", `SEO score ${seo.score}/100 — ${JSON.stringify(seo.breakdown)}`);
        void started;
      } catch (e) {
        status.steps.seo = "failed";
        await recordRun(store, campaignId, "SEO Agent", "failed", "SEO generation failed", { startedAt: started, error: (e as Error).message });
      }
    }

    // 6. Creative — brand graphics from real photos.
    if (stages.includes("creative")) {
      const started = nowIso();
      try {
        const created = await generateCreatives(campaignId, status.contentVersion, await store.listFacts(campaignId), store, [
          ...DEFAULT_CREATIVE_PLATFORMS.map((p) => ({ platform: p, variant: "hero" as const, style: "dark" as const })),
        ], (agent, summary) => void recordRun(store, campaignId, agent, "success", summary, { startedAt: started }));
        status.steps.creative = "done";
        void created;
      } catch (e) {
        status.steps.creative = "failed";
        await recordRun(store, campaignId, "Creative Agent", "failed", "Creative generation failed", { startedAt: started, error: (e as Error).message });
      }
    }

    // 7. Quality gate — the only road to READY_FOR_REVIEW.
    if (stages.includes("quality")) {
      const started = nowIso();
      const score = await runQualityCheck(campaignId, status.contentVersion, await store.listFacts(campaignId), await store.listContentVersions(campaignId), store, campaign.type);
      await store.saveQuality(score);
      status.steps.quality = score.verdict === "pass" ? "done" : "failed";
      await recordRun(store, campaignId, "Quality Control Agent", "success", verdictSummary(score), { startedAt: started });
      if (score.verdict === "pass") {
        await setCampaignStatus(store, campaign, "READY_FOR_REVIEW", "quality-control-agent", { note: `quality ${score.overall}/100` });
      } else {
        await setCampaignStatus(store, campaign, "CHANGES_REQUESTED", "quality-control-agent", { note: "critical issues found" });
      }
    }

    await saveSupervisorStatus(store, campaignId, status);
    void brand;
    return campaign;
  } catch (e) {
    await recordRun(store, campaignId, "Supervisor", "failed", "Pipeline aborted", { error: (e as Error).message });
    await saveSupervisorStatus(store, campaignId, status);
    throw e;
  }
}

/** Regenerate only the creative graphics (edit support: new variant/style). */
export async function regenerateCreatives(store: StorageProvider, campaignId: string, variants: string[]): Promise<void> {
  const campaign = (await store.getCampaign(campaignId)) ?? (() => {
    throw new Error(`Campaign ${campaignId} not found`);
  })();
  const status = (await getSupervisorStatus(store, campaignId)) ?? emptySupervisorStatus(campaignId);
  const started = nowIso();
  try {
    await generateCreatives(campaignId, status.contentVersion, await store.listFacts(campaignId), store, [
      ...variants.map((v) => ({ platform: v, variant: "hero" as const, style: "dark" as const })),
    ], (agent, summary) => void recordRun(store, campaignId, agent, "success", summary, { startedAt: started }));
    campaign.updatedAt = nowIso();
    await store.saveCampaign(campaign);
  } catch (e) {
    await recordRun(store, campaignId, "Creative Agent", "failed", "Creative regeneration failed", { startedAt: started, error: (e as Error).message });
    throw e;
  }
}