// Supervisor (spec Section 30): orchestrates the agent pipeline, records every
// agent run, and enforces the state machine. No agent bypasses the approval
// gate — the pipeline stops at READY_FOR_REVIEW.

import type { AgentRun, Campaign, CampaignFact, SupervisorStatus } from "../domain";
import { transition, canTransition } from "../state-machine";
import type { StorageProvider } from "../storage";
import { newId, nowIso } from "../storage";

export async function recordRun(
  store: StorageProvider,
  campaignId: string,
  agentName: string,
  status: AgentRun["status"],
  summary: string,
  opts: { runId?: string; model?: string; startedAt?: string; error?: string } = {}
): Promise<AgentRun> {
  const startedAt = opts.startedAt ?? nowIso();
  const finishedAt = nowIso();
  const run: AgentRun = {
    id: newId("run"),
    campaignId,
    agentName,
    runId: opts.runId ?? newId("rid"),
    model: opts.model ?? "mock-v1",
    status,
    summary,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
    error: opts.error ?? null,
  };
  await store.saveAgentRun(run);
  await store.appendAudit({
    id: newId("audit"),
    at: finishedAt,
    actor: `agent:${agentName}`,
    action: `run_${status}`,
    entity: "campaign",
    entityId: campaignId,
    detail: { summary, model: run.model },
  });
  return run;
}

export async function setCampaignStatus(
  store: StorageProvider,
  campaign: Campaign,
  to: Campaign["status"],
  actor: string,
  detail: Record<string, unknown> = {}
): Promise<Campaign> {
  if (campaign.status === to) return campaign;
  if (!canTransition(campaign.status, to)) {
    throw new Error(`Illegal status transition ${campaign.status} → ${to} for campaign ${campaign.id}`);
  }
  campaign.status = transition(campaign.status, to);
  campaign.updatedAt = nowIso();
  await store.saveCampaign(campaign);
  await store.appendAudit({
    id: newId("audit"),
    at: campaign.updatedAt,
    actor,
    action: "status_change",
    entity: "campaign",
    entityId: campaign.id,
    detail: { from: campaign.status, to, ...detail },
  });
  return campaign;
}

export async function saveSupervisorStatus(store: StorageProvider, campaignId: string, status: SupervisorStatus): Promise<void> {
  const facts = (await store.listFacts(campaignId)).filter((f) => f.field !== "supervisorStatus");
  facts.push({
    field: "supervisorStatus",
    value: status as unknown as string,
    source: "ai_observation",
    confidence: 1,
    verified: false,
  });
  await store.replaceFacts(campaignId, facts);
}

export async function getSupervisorStatus(store: StorageProvider, campaignId: string): Promise<SupervisorStatus | null> {
  const facts = await store.listFacts(campaignId);
  const s = facts.find((f) => f.field === "supervisorStatus");
  return s ? (s.value as unknown as SupervisorStatus) : null;
}

export function emptySupervisorStatus(campaignId: string): SupervisorStatus {
  return {
    campaignId,
    steps: {
      context: "pending",
      images: "pending",
      strategy: "pending",
      writing: "pending",
      seo: "pending",
      creative: "pending",
      quality: "pending",
      approval: "waiting",
      publishing: "idle",
    },
    contentVersion: 0,
  };
}

export { transition };

export type { Campaign, CampaignFact };