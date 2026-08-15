// SupabaseStore — StorageProvider backed by Postgres.
//
// A drop-in replacement for JsonFileStore. Same interface, same semantics, so
// nothing in src/lib/marketing/ or src/app/api/marketing/ changes; only which
// object `store` points at (see ../storage-provider.ts).
//
// Three behaviours are now enforced by the database rather than by hand:
//   - invalidateApprovals() is one atomic RPC instead of read-modify-write.
//   - saveContentVersion() cannot create a duplicate (campaign, version,
//     platform) — the unique index rejects it.
//   - savePublishJob() cannot duplicate an idempotency key, so a racing worker
//     gets a constraint error instead of double-publishing to Instagram.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/client";
import { DEFAULT_BRAND } from "../brand";
import type {
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
} from "../domain";
import type { StorageProvider } from "../storage";
import * as map from "./mappers";

/**
 * PostgREST reports "no rows" for .single() as PGRST116. That is an expected
 * outcome for every getX() in this interface, not an error worth throwing.
 */
const NO_ROWS = "PGRST116";

export class SupabaseStore implements StorageProvider {
  private injected: SupabaseClient | null;
  private resolved: SupabaseClient | null = null;

  constructor(client?: SupabaseClient) {
    this.injected = client ?? null;
  }

  /**
   * Resolved on first query, not in the constructor. `next build` imports this
   * module while collecting page data, and a constructor that threw on a
   * missing key would fail the build instead of failing the request that
   * actually needed the database.
   */
  private get client(): SupabaseClient {
    if (this.injected) return this.injected;
    if (!this.resolved) this.resolved = getAdminClient();
    return this.resolved;
  }

  /**
   * Every query funnels through here so a database failure surfaces as a
   * labelled error instead of an empty array. Silently returning [] on failure
   * would let the pipeline treat "database down" as "campaign has no content"
   * and generate a fresh version over the top of approved copy.
   */
  private async rows<T>(
    table: string,
    build: (q: ReturnType<SupabaseClient["from"]>) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
    toDomain: (row: map.Row) => T
  ): Promise<T[]> {
    const { data, error } = await build(this.client.from(table));
    if (error) throw new Error(`Supabase ${table} read failed: ${error.message}`);
    return (data as map.Row[] | null ?? []).map(toDomain);
  }

  private async upsert(table: string, row: map.Row): Promise<void> {
    const { error } = await this.client.from(table).upsert(row);
    if (error) throw new Error(`Supabase ${table} write failed: ${error.message}`);
  }

  private async insert(table: string, row: map.Row): Promise<void> {
    const { error } = await this.client.from(table).insert(row);
    if (error) throw new Error(`Supabase ${table} insert failed: ${error.message}`);
  }

  // ---- campaigns ----
  async listCampaigns(): Promise<Campaign[]> {
    return this.rows("campaigns", (q) =>
      q.select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      map.toCampaign
    );
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    const { data, error } = await this.client
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error) {
      if (error.code === NO_ROWS) return null;
      throw new Error(`Supabase campaign read failed: ${error.message}`);
    }
    return map.toCampaign(data as map.Row);
  }

  async saveCampaign(c: Campaign): Promise<void> {
    await this.upsert("campaigns", map.fromCampaign(c));
  }

  // ---- facts ----
  async listFacts(campaignId: string): Promise<CampaignFact[]> {
    return this.rows("campaign_facts", (q) =>
      q.select("*").eq("campaign_id", campaignId).order("field"),
      map.toFact
    );
  }

  async setFact(campaignId: string, fact: CampaignFact): Promise<void> {
    await this.upsert("campaign_facts", map.fromFact(campaignId, fact));
  }

  async replaceFacts(campaignId: string, facts: CampaignFact[]): Promise<void> {
    // Delete-then-insert, matching JsonFileStore: facts absent from the new set
    // are retractions, not omissions, so an upsert alone would leave stale ones.
    const { error: delError } = await this.client
      .from("campaign_facts")
      .delete()
      .eq("campaign_id", campaignId);
    if (delError) throw new Error(`Supabase facts clear failed: ${delError.message}`);

    if (facts.length === 0) return;
    const { error } = await this.client
      .from("campaign_facts")
      .insert(facts.map((f) => map.fromFact(campaignId, f)));
    if (error) throw new Error(`Supabase facts write failed: ${error.message}`);
  }

  // ---- assets ----
  async listAssets(campaignId: string): Promise<CampaignAsset[]> {
    return this.rows("campaign_assets", (q) =>
      q.select("*").eq("campaign_id", campaignId).eq("archived", false)
        .order("created_at", { ascending: false }),
      map.toAsset
    );
  }

  async saveAsset(a: CampaignAsset): Promise<void> {
    await this.upsert("campaign_assets", map.fromAsset(a));
  }

  async getAsset(id: string): Promise<CampaignAsset | null> {
    const { data, error } = await this.client
      .from("campaign_assets").select("*").eq("id", id).single();
    if (error) {
      if (error.code === NO_ROWS) return null;
      throw new Error(`Supabase asset read failed: ${error.message}`);
    }
    return map.toAsset(data as map.Row);
  }

  // ---- content versions ----
  async listContentVersions(campaignId: string): Promise<ContentVersion[]> {
    return this.rows("content_versions", (q) =>
      q.select("*").eq("campaign_id", campaignId)
        .order("version", { ascending: false }).order("platform"),
      map.toContentVersion
    );
  }

  async saveContentVersion(v: ContentVersion): Promise<void> {
    await this.upsert("content_versions", map.fromContentVersion(v));
  }

  async getContentVersion(id: string): Promise<ContentVersion | null> {
    const { data, error } = await this.client
      .from("content_versions").select("*").eq("id", id).single();
    if (error) {
      if (error.code === NO_ROWS) return null;
      throw new Error(`Supabase content read failed: ${error.message}`);
    }
    return map.toContentVersion(data as map.Row);
  }

  async listApprovedContent(campaignId: string): Promise<ContentVersion[]> {
    return this.rows("content_versions", (q) =>
      q.select("*").eq("campaign_id", campaignId).eq("status", "approved"),
      map.toContentVersion
    );
  }

  // ---- approvals ----
  async listApprovals(campaignId: string): Promise<Approval[]> {
    return this.rows("approvals", (q) =>
      q.select("*").eq("campaign_id", campaignId).order("approved_at", { ascending: false }),
      map.toApproval
    );
  }

  async saveApproval(a: Approval): Promise<void> {
    await this.insert("approvals", map.fromApproval(a));
  }

  async getLatestApproval(campaignId: string): Promise<Approval | null> {
    const { data, error } = await this.client
      .from("approvals")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Supabase approval read failed: ${error.message}`);
    return data ? map.toApproval(data as map.Row) : null;
  }

  async invalidateApprovals(campaignId: string): Promise<void> {
    // Flips every live approval AND the campaign flag in one transaction —
    // see invalidate_campaign_approvals() in 0003_functions.sql.
    const { error } = await this.client.rpc("invalidate_campaign_approvals", {
      p_campaign_id: campaignId,
    });
    if (error) throw new Error(`Supabase approval invalidation failed: ${error.message}`);
  }

  // ---- seo + quality ----
  async saveSeo(seo: SeoMetadata): Promise<void> {
    await this.upsert("seo_metadata", map.fromSeo(seo));
  }

  async getSeo(campaignId: string, version: number): Promise<SeoMetadata | null> {
    const { data, error } = await this.client
      .from("seo_metadata").select("*")
      .eq("campaign_id", campaignId).eq("content_version", version).maybeSingle();
    if (error) throw new Error(`Supabase seo read failed: ${error.message}`);
    return data ? map.toSeo(data as map.Row) : null;
  }

  async saveQuality(q: QualityScore): Promise<void> {
    await this.upsert("quality_scores", map.fromQuality(q));
  }

  async getQuality(campaignId: string, version: number): Promise<QualityScore | null> {
    const { data, error } = await this.client
      .from("quality_scores").select("*")
      .eq("campaign_id", campaignId).eq("content_version", version).maybeSingle();
    if (error) throw new Error(`Supabase quality read failed: ${error.message}`);
    return data ? map.toQuality(data as map.Row) : null;
  }

  // ---- agent runs ----
  async listAgentRuns(campaignId: string): Promise<AgentRun[]> {
    return this.rows("agent_runs", (q) =>
      q.select("*").eq("campaign_id", campaignId).order("started_at", { ascending: false }),
      map.toAgentRun
    );
  }

  async saveAgentRun(r: AgentRun): Promise<void> {
    // Upsert, not insert: a run row is written once when it starts and again
    // when it finishes, and both calls carry the same id.
    await this.upsert("agent_runs", map.fromAgentRun(r));
  }

  // ---- social accounts ----
  async listSocialAccounts(): Promise<SocialAccount[]> {
    return this.rows("social_accounts", (q) => q.select("*").order("platform"), map.toSocialAccount);
  }

  async saveSocialAccount(a: SocialAccount): Promise<void> {
    await this.upsert("social_accounts", map.fromSocialAccount(a));
  }

  // ---- publish jobs ----
  async listPublishJobs(campaignId?: string): Promise<PublishJob[]> {
    return this.rows("publish_jobs", (q) => {
      const base = q.select("*").order("scheduled_for");
      return campaignId ? base.eq("campaign_id", campaignId) : base;
    }, map.toPublishJob);
  }

  async savePublishJob(j: PublishJob): Promise<void> {
    await this.upsert("publish_jobs", map.fromPublishJob(j));
  }

  async listAttempts(jobId: string): Promise<PublishAttempt[]> {
    return this.rows("publish_attempts", (q) =>
      q.select("*").eq("job_id", jobId).order("at"),
      map.toAttempt
    );
  }

  async saveAttempt(a: PublishAttempt): Promise<void> {
    await this.insert("publish_attempts", map.fromAttempt(a));
  }

  // ---- audit ----
  async listAudit(limit = 200): Promise<AuditEntry[]> {
    return this.rows("audit_log", (q) =>
      q.select("*").order("at", { ascending: false }).limit(limit),
      map.toAudit
    );
  }

  async appendAudit(e: AuditEntry): Promise<void> {
    await this.insert("audit_log", map.fromAudit(e));
  }

  // ---- conversation ----
  async listMessages(campaignId: string): Promise<AssistantMessage[]> {
    return this.rows("campaign_messages", (q) =>
      q.select("*").eq("campaign_id", campaignId).order("at"),
      map.toMessage
    );
  }

  async appendMessage(m: AssistantMessage): Promise<void> {
    await this.insert("campaign_messages", map.fromMessage(m));
  }

  // ---- brand ----
  async getBrand(): Promise<BrandSettings> {
    const { data, error } = await this.client
      .from("brand_settings").select("*").eq("id", true).maybeSingle();
    if (error) throw new Error(`Supabase brand read failed: ${error.message}`);
    // No row yet means the studio has never customised the brand; the compiled
    // default is the correct answer, not an error.
    return data ? map.toBrand(data as map.Row) : DEFAULT_BRAND;
  }

  async saveBrand(b: BrandSettings): Promise<void> {
    await this.upsert("brand_settings", map.fromBrand(b));
  }

  // ---- Postgres-only extras (not part of StorageProvider) ----

  /**
   * Atomically claim due publish jobs. Concurrent workers receive disjoint
   * sets thanks to FOR UPDATE SKIP LOCKED — the file store had no equivalent
   * and relied on a single worker never overlapping with itself.
   */
  async claimDueJobs(limit = 10, lockSeconds = 45): Promise<PublishJob[]> {
    const { data, error } = await this.client.rpc("claim_due_publish_jobs", {
      p_limit: limit,
      p_lock_seconds: lockSeconds,
    });
    if (error) throw new Error(`Supabase job claim failed: ${error.message}`);
    return (data as map.Row[] | null ?? []).map(map.toPublishJob);
  }

  /** Return jobs abandoned by a crashed worker to the ready queue. */
  async releaseStaleLocks(): Promise<number> {
    const { data, error } = await this.client.rpc("release_stale_publish_locks");
    if (error) throw new Error(`Supabase lock release failed: ${error.message}`);
    return typeof data === "number" ? data : 0;
  }
}
