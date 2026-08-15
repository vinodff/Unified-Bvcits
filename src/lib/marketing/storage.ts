// Storage layer — StorageProvider interface + two implementations.
//
// JsonFileStore is the zero-infrastructure default: fine for local development,
// but .data/ is gitignored and process-local, so it loses every campaign on a
// serverless deploy. SupabaseStore (./supabase/store.ts) implements the same
// interface against Postgres. selectStore() at the bottom picks between them.

import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_BRAND } from "./brand";
import { isSupabaseAdminConfigured } from "@/lib/supabase/client";
import { SupabaseStore } from "./supabase/store";
import {
  AgentRun,
  Approval,
  AssistantMessage,
  AuditEntry,
  BrandSettings,
  Campaign,
  CampaignAsset,
  CampaignFact,
  ContentVersion,
  PublishAttempt,
  PublishJob,
  QualityScore,
  SeoMetadata,
  SocialAccount,
} from "./domain";

export interface StorageProvider {
  // campaigns
  listCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | null>;
  saveCampaign(c: Campaign): Promise<void>;
  // facts
  listFacts(campaignId: string): Promise<CampaignFact[]>;
  setFact(campaignId: string, fact: CampaignFact): Promise<void>;
  replaceFacts(campaignId: string, facts: CampaignFact[]): Promise<void>;
  // assets
  listAssets(campaignId: string): Promise<CampaignAsset[]>;
  saveAsset(a: CampaignAsset): Promise<void>;
  getAsset(id: string): Promise<CampaignAsset | null>;
  // content versions
  listContentVersions(campaignId: string): Promise<ContentVersion[]>;
  saveContentVersion(v: ContentVersion): Promise<void>;
  getContentVersion(id: string): Promise<ContentVersion | null>;
  listApprovedContent(campaignId: string): Promise<ContentVersion[]>;
  // approvals
  listApprovals(campaignId: string): Promise<Approval[]>;
  saveApproval(a: Approval): Promise<void>;
  getLatestApproval(campaignId: string): Promise<Approval | null>;
  invalidateApprovals(campaignId: string): Promise<void>;
  // seo + quality
  saveSeo(seo: SeoMetadata): Promise<void>;
  getSeo(campaignId: string, version: number): Promise<SeoMetadata | null>;
  saveQuality(q: QualityScore): Promise<void>;
  getQuality(campaignId: string, version: number): Promise<QualityScore | null>;
  // agent runs
  listAgentRuns(campaignId: string): Promise<AgentRun[]>;
  saveAgentRun(r: AgentRun): Promise<void>;
  // social accounts
  listSocialAccounts(): Promise<SocialAccount[]>;
  saveSocialAccount(a: SocialAccount): Promise<void>;
  // publish jobs + attempts
  listPublishJobs(campaignId?: string): Promise<PublishJob[]>;
  savePublishJob(j: PublishJob): Promise<void>;
  listAttempts(jobId: string): Promise<PublishAttempt[]>;
  saveAttempt(a: PublishAttempt): Promise<void>;
  // audit
  listAudit(limit?: number): Promise<AuditEntry[]>;
  appendAudit(e: AuditEntry): Promise<void>;
  // assistant conversation
  listMessages(campaignId: string): Promise<AssistantMessage[]>;
  appendMessage(m: AssistantMessage): Promise<void>;
  // brand
  getBrand(): Promise<BrandSettings>;
  saveBrand(b: BrandSettings): Promise<void>;
}

const ENTITIES = [
  "campaigns",
  "facts",
  "assets",
  "content",
  "approvals",
  "seo",
  "quality",
  "agentRuns",
  "socialAccounts",
  "publishJobs",
  "attempts",
  "audit",
  "messages",
  "brand",
] as const;

export class JsonFileStore implements StorageProvider {
  private readonly dir: string;

  constructor(baseDir?: string) {
    this.dir = baseDir ?? path.join(process.cwd(), ".data", "marketing");
  }

  private file(entity: string): string {
    return path.join(this.dir, `${entity}.json`);
  }

  private async read<T>(entity: string): Promise<T[]> {
    try {
      const raw = await fs.readFile(this.file(entity), "utf-8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  private async write<T>(entity: string, rows: T[]): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.file(entity)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf-8");
    await fs.rename(tmp, this.file(entity));
  }

  private async readOne<T>(entity: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(this.file(entity), "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private async writeOne<T>(entity: string, value: T): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.file(entity)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf-8");
    await fs.rename(tmp, this.file(entity));
  }

  // ---- campaigns ----
  async listCampaigns(): Promise<Campaign[]> {
    const rows = await this.read<Campaign>("campaigns");
    return rows.filter((c) => !c.deletedAt);
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    const rows = await this.read<Campaign>("campaigns");
    return rows.find((c) => c.id === id && !c.deletedAt) ?? null;
  }

  async saveCampaign(c: Campaign): Promise<void> {
    const rows = await this.read<Campaign>("campaigns");
    const idx = rows.findIndex((r) => r.id === c.id);
    if (idx >= 0) rows[idx] = c;
    else rows.push(c);
    await this.write("campaigns", rows);
  }

  // ---- facts ----
  async listFacts(campaignId: string): Promise<CampaignFact[]> {
    const rows = await this.read<{ campaignId: string; fact: CampaignFact }>("facts");
    return rows.filter((r) => r.campaignId === campaignId).map((r) => r.fact);
  }

  async setFact(campaignId: string, fact: CampaignFact): Promise<void> {
    const rows = await this.read<{ campaignId: string; fact: CampaignFact }>("facts");
    const idx = rows.findIndex((r) => r.campaignId === campaignId && r.fact.field === fact.field);
    if (idx >= 0) rows[idx].fact = fact;
    else rows.push({ campaignId, fact });
    await this.write("facts", rows);
  }

  async replaceFacts(campaignId: string, facts: CampaignFact[]): Promise<void> {
    const rows = await this.read<{ campaignId: string; fact: CampaignFact }>("facts");
    const rest = rows.filter((r) => r.campaignId !== campaignId);
    for (const fact of facts) rest.push({ campaignId, fact });
    await this.write("facts", rest);
  }

  // ---- assets ----
  async listAssets(campaignId: string): Promise<CampaignAsset[]> {
    const rows = await this.read<CampaignAsset>("assets");
    return rows.filter((a) => a.campaignId === campaignId && !a.archived);
  }

  async saveAsset(a: CampaignAsset): Promise<void> {
    const rows = await this.read<CampaignAsset>("assets");
    const idx = rows.findIndex((r) => r.id === a.id);
    if (idx >= 0) rows[idx] = a;
    else rows.push(a);
    await this.write("assets", rows);
  }

  async getAsset(id: string): Promise<CampaignAsset | null> {
    const rows = await this.read<CampaignAsset>("assets");
    return rows.find((r) => r.id === id) ?? null;
  }

  // ---- content versions ----
  async listContentVersions(campaignId: string): Promise<ContentVersion[]> {
    const rows = await this.read<ContentVersion>("content");
    return rows
      .filter((r) => r.campaignId === campaignId)
      .sort((a, b) => b.version - a.version || a.platform.localeCompare(b.platform));
  }

  async saveContentVersion(v: ContentVersion): Promise<void> {
    const rows = await this.read<ContentVersion>("content");
    const idx = rows.findIndex((r) => r.id === v.id);
    if (idx >= 0) rows[idx] = v;
    else rows.push(v);
    await this.write("content", rows);
  }

  async getContentVersion(id: string): Promise<ContentVersion | null> {
    const rows = await this.read<ContentVersion>("content");
    return rows.find((r) => r.id === id) ?? null;
  }

  async listApprovedContent(campaignId: string): Promise<ContentVersion[]> {
    const rows = await this.read<ContentVersion>("content");
    return rows.filter((r) => r.campaignId === campaignId && r.status === "approved");
  }

  // ---- approvals ----
  async listApprovals(campaignId: string): Promise<Approval[]> {
    const rows = await this.read<Approval>("approvals");
    return rows.filter((r) => r.campaignId === campaignId).sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));
  }

  async saveApproval(a: Approval): Promise<void> {
    const rows = await this.read<Approval>("approvals");
    rows.push(a);
    await this.write("approvals", rows);
  }

  async getLatestApproval(campaignId: string): Promise<Approval | null> {
    const rows = await this.read<Approval>("approvals");
    const valid = rows
      .filter((r) => r.campaignId === campaignId && r.status === "approved")
      .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));
    return valid[0] ?? null;
  }

  async invalidateApprovals(campaignId: string): Promise<void> {
    const rows = await this.read<Approval>("approvals");
    let changed = false;
    for (const r of rows) {
      if (r.campaignId === campaignId && r.status === "approved") {
        r.status = "invalidated";
        changed = true;
      }
    }
    if (changed) await this.write("approvals", rows);
  }

  // ---- seo + quality ----
  async saveSeo(seo: SeoMetadata): Promise<void> {
    const rows = await this.read<SeoMetadata>("seo");
    const idx = rows.findIndex((r) => r.campaignId === seo.campaignId && r.contentVersion === seo.contentVersion);
    if (idx >= 0) rows[idx] = seo;
    else rows.push(seo);
    await this.write("seo", rows);
  }

  async getSeo(campaignId: string, version: number): Promise<SeoMetadata | null> {
    const rows = await this.read<SeoMetadata>("seo");
    return rows.find((r) => r.campaignId === campaignId && r.contentVersion === version) ?? null;
  }

  async saveQuality(q: QualityScore): Promise<void> {
    const rows = await this.read<QualityScore>("quality");
    const idx = rows.findIndex((r) => r.campaignId === q.campaignId && r.contentVersion === q.contentVersion);
    if (idx >= 0) rows[idx] = q;
    else rows.push(q);
    await this.write("quality", rows);
  }

  async getQuality(campaignId: string, version: number): Promise<QualityScore | null> {
    const rows = await this.read<QualityScore>("quality");
    return rows.find((r) => r.campaignId === campaignId && r.contentVersion === version) ?? null;
  }

  // ---- agent runs ----
  async listAgentRuns(campaignId: string): Promise<AgentRun[]> {
    const rows = await this.read<AgentRun>("agentRuns");
    return rows
      .filter((r) => r.campaignId === campaignId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async saveAgentRun(r: AgentRun): Promise<void> {
    const rows = await this.read<AgentRun>("agentRuns");
    rows.push(r);
    await this.write("agentRuns", rows);
  }

  // ---- social accounts ----
  async listSocialAccounts(): Promise<SocialAccount[]> {
    return this.read<SocialAccount>("socialAccounts");
  }

  async saveSocialAccount(a: SocialAccount): Promise<void> {
    const rows = await this.read<SocialAccount>("socialAccounts");
    const idx = rows.findIndex((r) => r.id === a.id);
    if (idx >= 0) rows[idx] = a;
    else rows.push(a);
    await this.write("socialAccounts", rows);
  }

  // ---- publish jobs ----
  async listPublishJobs(campaignId?: string): Promise<PublishJob[]> {
    const rows = await this.read<PublishJob>("publishJobs");
    return campaignId ? rows.filter((r) => r.campaignId === campaignId) : rows;
  }

  async savePublishJob(j: PublishJob): Promise<void> {
    const rows = await this.read<PublishJob>("publishJobs");
    const idx = rows.findIndex((r) => r.id === j.id);
    if (idx >= 0) rows[idx] = j;
    else rows.push(j);
    await this.write("publishJobs", rows);
  }

  async listAttempts(jobId: string): Promise<PublishAttempt[]> {
    const rows = await this.read<PublishAttempt>("attempts");
    return rows.filter((r) => r.jobId === jobId).sort((a, b) => a.at.localeCompare(b.at));
  }

  async saveAttempt(a: PublishAttempt): Promise<void> {
    const rows = await this.read<PublishAttempt>("attempts");
    rows.push(a);
    await this.write("attempts", rows);
  }

  // ---- audit ----
  async listAudit(limit = 200): Promise<AuditEntry[]> {
    const rows = await this.read<AuditEntry>("audit");
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }

  async appendAudit(e: AuditEntry): Promise<void> {
    const rows = await this.read<AuditEntry>("audit");
    rows.push(e);
    await this.write("audit", rows);
  }

  // ---- conversation ----
  async listMessages(campaignId: string): Promise<AssistantMessage[]> {
    const rows = await this.read<AssistantMessage>("messages");
    return rows.filter((r) => r.campaignId === campaignId).sort((a, b) => a.at.localeCompare(b.at));
  }

  async appendMessage(m: AssistantMessage): Promise<void> {
    const rows = await this.read<AssistantMessage>("messages");
    rows.push(m);
    await this.write("messages", rows);
  }

  // ---- brand ----
  async getBrand(): Promise<BrandSettings> {
    const b = await this.readOne<BrandSettings>("brand");
    return b ?? DEFAULT_BRAND;
  }

  async saveBrand(b: BrandSettings): Promise<void> {
    await this.writeOne("brand", b);
  }
}

/**
 * Backend selection.
 *
 *   MARKETING_STORE=supabase  → require Postgres; fail loudly if unconfigured
 *   MARKETING_STORE=file      → force the JSON file store
 *   (unset)                   → Supabase when configured, files otherwise
 *
 * The explicit `supabase` setting exists so a production deploy fails fast on a
 * typo'd key rather than quietly writing campaigns to a serverless filesystem
 * that is discarded when the instance recycles.
 */
function selectStore(): StorageProvider {
  const mode = process.env.MARKETING_STORE;

  if (mode === "file") return new JsonFileStore();

  if (mode === "supabase") {
    if (!isSupabaseAdminConfigured()) {
      throw new Error(
        "MARKETING_STORE=supabase but NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY are missing. " +
          "See docs/SUPABASE.md."
      );
    }
    return new SupabaseStore();
  }

  return isSupabaseAdminConfigured() ? new SupabaseStore() : new JsonFileStore();
}

export const store: StorageProvider = selectStore();

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}