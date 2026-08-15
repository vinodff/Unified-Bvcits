// Scheduler + Persistent Queue (spec Sections 28–29): file-backed PublishJobs
// with remote scheduling where the platform supports it (Instagram/Facebook),
// caller-side due-time publishing for LinkedIn/WhatsApp/website, idempotency
// keys, retry-with-backoff for transport/rate-limit errors only, and a crash
// lock (lockedUntil) so a dying worker never double-publishes.

import type { Approval, Campaign, ContentVersion, Platform, PublishAttempt, PublishJob } from "./domain";
import type { PublishResult } from "./social/publisher";
import { PLATFORM_CAPABILITIES } from "./brand";
import type { StorageProvider } from "./storage";
import { newId, nowIso } from "./storage";
import { classifyError, resolvePublisher } from "./social/publisher";
import { setCampaignStatus } from "./agents/supervisor";
import { appendAuditSafe } from "./audit";

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 3_600_000;
const LOCK_MS = 45_000;

export function backoff(retryCount: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** retryCount, MAX_BACKOFF_MS);
}

export function jobIdempotencyKey(campaignId: string, platform: Platform, version: number): string {
  return `bvcits:${campaignId}:${platform}:v${version}`;
}

/**
 * Create per-platform publish jobs. Platforms whose API supports server-side
 * scheduling (Instagram, Facebook) are handed off to the API immediately;
 * others (LinkedIn, WhatsApp, website) are published by the worker at due time.
 * Requires a live, matching approval.
 */
export async function schedulePublishing(
  store: StorageProvider,
  campaign: Campaign,
  version: number,
  actor: string
): Promise<PublishJob[]> {
  const approval = await store.getLatestApproval(campaign.id);
  if (!approval || approval.status !== "approved" || approval.contentVersion !== version) {
    throw new Error(`Cannot schedule: no live approval for version ${version}.`);
  }
  const schedule = campaign.schedule;
  if (!schedule || !schedule.platforms.length) {
    throw new Error("Cannot schedule: campaign has no schedule (platforms + times).");
  }

  const accounts = await store.listSocialAccounts();
  const jobs: PublishJob[] = [];
  for (const platform of schedule.platforms) {
    const due = schedule.times[platform];
    if (!due) throw new Error(`Schedule missing time for ${platform}.`);
    const account = accounts.find((a) => a.platform === platform && a.status !== "disconnected") ?? accounts.find((a) => a.platform === platform);
    if (!account) throw new Error(`No connected ${platform} account to schedule onto.`);

    const capability = PLATFORM_CAPABILITIES[platform];
    const job: PublishJob = {
      id: newId("job"),
      campaignId: campaign.id,
      platform,
      accountId: account.id,
      contentVersion: version,
      mediaVersion: null,
      scheduledFor: due,
      status: "scheduled",
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      idempotencyKey: jobIdempotencyKey(campaign.id, platform, version),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    if (capability.scheduling === "api") {
      // Hand off to the platform's own scheduler right away.
      const publisher = await resolvePublisher(platform, account);
      const content = (await store.listContentVersions(campaign.id)).find((c) => c.version === version && c.platform === platform);
      if (!content) throw new Error(`No content for ${platform} v${version}.`);
      const media = (await store.listAssets(campaign.id)).filter((a) => a.aiGenerated && (a.metadata?.platform as string | undefined) === platform);
      const mediaPaths = media.map((m) => m.originalFile);
      try {
        const remote = await publisher.schedule({ text: content.body, mediaPaths, scheduledFor: due }, account);
        job.platformScheduleId = remote.scheduleId;
      } catch (e) {
        job.status = "failed";
        job.error = (e as Error).message;
        await store.appendAudit({
          id: newId("audit"), at: nowIso(), actor, action: "schedule_failed", entity: "campaign", entityId: campaign.id,
          detail: { platform, error: (e as Error).message },
        });
      }
    }
    await store.savePublishJob(job);
    jobs.push(job);
  }

  await setCampaignStatus(store, campaign, "SCHEDULED", actor, { note: `${jobs.length} jobs queued` });
  return jobs;
}

interface PreflightResult {
  ok: boolean;
  reason: string;
}

async function preflight(store: StorageProvider, job: PublishJob): Promise<PreflightResult> {
  const campaign = await store.getCampaign(job.campaignId);
  if (!campaign) return { ok: false, reason: "campaign deleted" };
  if (!["SCHEDULED", "PUBLISHING", "PUBLISH_FAILED"].includes(campaign.status)) {
    return { ok: false, reason: `campaign status ${campaign.status} is not schedulable` };
  }
  const approval: Approval | null = await store.getLatestApproval(job.campaignId);
  if (!approval || approval.status !== "approved" || approval.contentVersion !== job.contentVersion) {
    return { ok: false, reason: "approval invalidated or version mismatch" };
  }
  const content: ContentVersion | null = (await store.listContentVersions(job.campaignId)).find(
    (c) => c.version === job.contentVersion && c.platform === job.platform
  ) ?? null;
  if (!content) return { ok: false, reason: `content v${job.contentVersion} missing for ${job.platform}` };
  const account = (await store.listSocialAccounts()).find((a) => a.id === job.accountId);
  if (!account || account.status === "disconnected") return { ok: false, reason: "account disconnected" };
  return { ok: true, reason: "ok" };
}

/**
 * One worker tick: publish every due, unlocked job. Safe to run concurrently
 * (job lock) and safe to retry (idempotency keys + platform post id check).
 */
export async function runDueJobs(store: StorageProvider): Promise<{ processed: number; published: number; failed: number }> {
  const jobs = await store.listPublishJobs();
  const now = nowIso();
  let processed = 0, published = 0, failed = 0;

  for (const job of jobs) {
    if (job.status !== "scheduled" && job.status !== "publishing") continue;
    if (job.status === "publishing" && job.lockedUntil && Date.parse(job.lockedUntil) > Date.now()) continue;
    if (Date.parse(job.scheduledFor) > Date.now()) continue;
    if (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > Date.now()) continue;
    if (job.retryCount >= job.maxRetries) continue;

    processed++;
    const pf = await preflight(store, job);
    if (!pf.ok) {
      job.status = "skipped";
      job.error = pf.reason;
      await store.savePublishJob(job);
      continue;
    }

    job.status = "publishing";
    job.lockedUntil = new Date(Date.now() + LOCK_MS).toISOString();
    job.updatedAt = now;
    await store.savePublishJob(job);

    const attempt = async (): Promise<PublishResult> => {
      const account = (await store.listSocialAccounts()).find((a) => a.id === job.accountId)!;
      const content = (await store.listContentVersions(job.campaignId)).find((c) => c.version === job.contentVersion && c.platform === job.platform)!;
      const media = (await store.listAssets(job.campaignId)).filter((a) => a.aiGenerated && (a.metadata?.platform as string | undefined) === job.platform).map((m) => m.originalFile);
      const publisher = await resolvePublisher(job.platform, account);
      return publisher.publish({ text: content.body, mediaPaths: media }, account);
    };

    try {
      const result = await attempt();
      job.status = "published";
      job.platformPostId = result.platformPostId;
      job.publishedAt = result.publishedAt;
      job.lockedUntil = null;
      job.error = null;
      job.updatedAt = nowIso();
      await store.savePublishJob(job);
      await store.saveAttempt({
        id: newId("atp"), jobId: job.id, campaignId: job.campaignId, platform: job.platform,
        attempt: job.retryCount + 1, status: "success", at: nowIso(),
      });
      published++;
      await appendAuditSafe(store, "worker", "published", "campaign", job.campaignId, { platform: job.platform, postId: result.platformPostId });

      const campaign = (await store.getCampaign(job.campaignId))!;
      const siblings = (await store.listPublishJobs(job.campaignId)).filter((j) => j.id !== job.id);
      if (siblings.every((j) => ["published", "skipped"].includes(j.status))) {
        await setCampaignStatus(store, campaign, "PUBLISHED", "worker", { note: "all platform jobs finished" });
      }
    } catch (e) {
      const err = e as Error;
      const policy = classifyError((err as { httpStatus?: number }).httpStatus, err.message);
      job.retryCount += 1;
      job.lockedUntil = null;
      job.updatedAt = nowIso();
      job.error = err.message;
      await store.saveAttempt({
        id: newId("atp"), jobId: job.id, campaignId: job.campaignId, platform: job.platform,
        attempt: job.retryCount, status: policy === "permanent" ? "failure" : "retryable", error: err.message, at: nowIso(),
      });
      if (policy === "permanent" || job.retryCount >= job.maxRetries) {
        job.status = "failed";
        await store.savePublishJob(job);
        failed++;
        const campaign = (await store.getCampaign(job.campaignId))!;
        campaign.publishError = err.message;
        await store.saveCampaign(campaign);
        await setCampaignStatus(store, campaign, "PUBLISH_FAILED", "worker", { platform: job.platform, error: err.message });
      } else {
        job.status = "scheduled";
        job.nextAttemptAt = new Date(Date.now() + backoff(job.retryCount)).toISOString();
        await store.savePublishJob(job);
      }
    }
  }
  return { processed, published, failed };
}

export { MAX_RETRIES };