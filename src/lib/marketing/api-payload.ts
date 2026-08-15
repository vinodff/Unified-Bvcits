// Central campaign-detail payload for the API + Studio UI.

import { store } from "./storage";
import { getSupervisorStatus } from "./agents/supervisor";

export async function buildCampaignDetail(id: string) {
  const campaign = await store.getCampaign(id);
  if (!campaign) return null;
  const [facts, assets, content, approvals, runs, audit] = await Promise.all([
    store.listFacts(id),
    store.listAssets(id),
    store.listContentVersions(id),
    store.listApprovals(id),
    store.listAgentRuns(id),
    store.listAudit(200),
  ]);
  const latestApproval = approvals.find((a) => a.status === "approved") ?? null;
  const latestVersion = content.reduce((m, c) => Math.max(m, c.version), 0) || (latestApproval?.contentVersion ?? 0);
  const seo = await store.getSeo(id, latestVersion);
  const quality = await store.getQuality(id, latestVersion);
  const supervisor = await getSupervisorStatus(store, id);
  const jobs = await store.listPublishJobs(id);
  return {
    campaign,
    facts,
    assets,
    content,
    approvals,
    seo,
    quality,
    runs,
    supervisor,
    jobs,
    audit: audit.filter((e) => e.entityId === id),
  };
}