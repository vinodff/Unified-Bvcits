// Row <-> domain mapping for the Supabase marketing store.
//
// Postgres columns are snake_case; the domain model in ../domain.ts is
// camelCase. Rather than sprinkle conversions through the store, every shape
// gets one `toX` (row -> domain) and one `fromX` (domain -> row) here, so the
// store file reads as pure query logic.
//
// Two shapes are flattened on the way into Postgres and rebuilt on the way out:
//   CampaignSchedule -> schedule_platforms / schedule_times / schedule_tz
//   asset.dimensions -> width / height
//   agentRun.tokens  -> input_tokens / output_tokens
// Each is a fixed 1:1 sub-object, so a join table would cost a round trip and
// buy nothing.

import type {
  AgentRun,
  Approval,
  AssistantMessage,
  AuditEntry,
  BrandSettings,
  Campaign,
  CampaignAsset,
  CampaignFact,
  CampaignSchedule,
  ContentVersion,
  Platform,
  PublishAttempt,
  PublishJob,
  QualityScore,
  SeoMetadata,
  SocialAccount,
} from "../domain";

/** A PostgREST row. Values are narrowed by the individual mappers. */
export type Row = Record<string, unknown>;

// --- primitive coercion -----------------------------------------------------

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);
const bool = (v: unknown): boolean => v === true;
const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * Postgres returns timestamptz as "2026-08-15 09:20:00+00"; the domain model
 * stores ISO strings everywhere and compares them with localeCompare, so a
 * mismatched format would silently break every sort.
 */
const iso = (v: unknown): string => (v ? new Date(String(v)).toISOString() : "");
const isoOrNull = (v: unknown): string | null =>
  v ? new Date(String(v)).toISOString() : null;

// --- campaigns --------------------------------------------------------------

function toSchedule(row: Row): CampaignSchedule | undefined {
  const platforms = strArray(row.schedule_platforms) as Platform[];
  if (platforms.length === 0) return undefined;
  return {
    platforms,
    times: obj(row.schedule_times) as Partial<Record<Platform, string>>,
    tz: str(row.schedule_tz) || "Asia/Kolkata",
  };
}

export function toCampaign(row: Row): Campaign {
  return {
    id: str(row.id),
    title: str(row.title),
    type: row.type as Campaign["type"],
    status: row.status as Campaign["status"],
    source: row.source as Campaign["source"],
    createdBy: str(row.created_by),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    deletedAt: isoOrNull(row.deleted_at),
    approvalInvalidated: bool(row.approval_invalidated),
    schedule: toSchedule(row),
    strategy: row.strategy ? obj(row.strategy) : undefined,
    approvedVersion: row.approved_version === null ? undefined : num(row.approved_version),
    publishedAt: isoOrNull(row.published_at),
    publishError: strOrNull(row.publish_error),
  };
}

export function fromCampaign(c: Campaign): Row {
  return {
    id: c.id,
    title: c.title,
    type: c.type,
    status: c.status,
    source: c.source,
    created_by: c.createdBy,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt ?? null,
    approval_invalidated: c.approvalInvalidated ?? false,
    schedule_platforms: c.schedule?.platforms ?? [],
    schedule_times: c.schedule?.times ?? {},
    schedule_tz: c.schedule?.tz ?? "Asia/Kolkata",
    strategy: c.strategy ?? null,
    approved_version: c.approvedVersion ?? null,
    published_at: c.publishedAt ?? null,
    publish_error: c.publishError ?? null,
  };
}

// --- facts ------------------------------------------------------------------

export function toFact(row: Row): CampaignFact {
  return {
    field: str(row.field),
    value: row.value as CampaignFact["value"],
    source: row.source as CampaignFact["source"],
    confidence: num(row.confidence),
    verified: bool(row.verified),
  };
}

export function fromFact(campaignId: string, f: CampaignFact): Row {
  return {
    campaign_id: campaignId,
    field: f.field,
    value: f.value ?? null,
    source: f.source,
    confidence: f.confidence,
    verified: f.verified,
  };
}

// --- assets -----------------------------------------------------------------

export function toAsset(row: Row): CampaignAsset {
  const width = numOrNull(row.width);
  const height = numOrNull(row.height);
  return {
    id: str(row.id),
    campaignId: str(row.campaign_id),
    originalFile: str(row.original_file),
    processedFile: strOrNull(row.processed_file),
    type: row.type as CampaignAsset["type"],
    dimensions: width !== null && height !== null ? { width, height } : null,
    mimeType: str(row.mime_type),
    sizeBytes: num(row.size_bytes),
    createdAt: iso(row.created_at),
    aiGenerated: bool(row.ai_generated),
    referenceAssets: strArray(row.reference_assets),
    altText: strOrNull(row.alt_text),
    caption: strOrNull(row.caption),
    title: strOrNull(row.title),
    description: strOrNull(row.description),
    archived: bool(row.archived),
    metadata: obj(row.metadata),
    observations: strArray(row.observations),
  };
}

export function fromAsset(a: CampaignAsset): Row {
  return {
    id: a.id,
    campaign_id: a.campaignId,
    original_file: a.originalFile,
    processed_file: a.processedFile ?? null,
    type: a.type,
    width: a.dimensions?.width ?? null,
    height: a.dimensions?.height ?? null,
    mime_type: a.mimeType,
    size_bytes: a.sizeBytes,
    created_at: a.createdAt,
    ai_generated: a.aiGenerated,
    reference_assets: a.referenceAssets ?? [],
    alt_text: a.altText ?? null,
    caption: a.caption ?? null,
    title: a.title ?? null,
    description: a.description ?? null,
    archived: a.archived ?? false,
    metadata: a.metadata ?? {},
    observations: a.observations ?? [],
  };
}

// --- content versions -------------------------------------------------------

export function toContentVersion(row: Row): ContentVersion {
  return {
    id: str(row.id),
    campaignId: str(row.campaign_id),
    version: num(row.version),
    platform: row.platform as Platform,
    contentType: str(row.content_type),
    body: str(row.body),
    title: strOrNull(row.title),
    claims: strArray(row.claims),
    status: row.status as ContentVersion["status"],
    createdAt: iso(row.created_at),
    createdBy: str(row.created_by),
  };
}

export function fromContentVersion(v: ContentVersion): Row {
  return {
    id: v.id,
    campaign_id: v.campaignId,
    version: v.version,
    platform: v.platform,
    content_type: v.contentType,
    body: v.body,
    title: v.title ?? null,
    claims: v.claims ?? [],
    status: v.status,
    created_at: v.createdAt,
    created_by: v.createdBy,
  };
}

// --- approvals --------------------------------------------------------------

export function toApproval(row: Row): Approval {
  return {
    id: str(row.id),
    campaignId: str(row.campaign_id),
    contentVersion: num(row.content_version),
    approvedBy: str(row.approved_by),
    approvedAt: iso(row.approved_at),
    platforms: strArray(row.platforms) as Platform[],
    scheduledAt: isoOrNull(row.scheduled_at),
    assetHashes: obj(row.asset_hashes) as Record<string, string>,
    status: row.status as Approval["status"],
    note: strOrNull(row.note),
  };
}

export function fromApproval(a: Approval): Row {
  return {
    id: a.id,
    campaign_id: a.campaignId,
    content_version: a.contentVersion,
    approved_by: a.approvedBy,
    approved_at: a.approvedAt,
    platforms: a.platforms ?? [],
    scheduled_at: a.scheduledAt ?? null,
    asset_hashes: a.assetHashes ?? {},
    status: a.status,
    note: a.note ?? null,
  };
}

// --- seo + quality ----------------------------------------------------------

export function toSeo(row: Row): SeoMetadata {
  return {
    campaignId: str(row.campaign_id),
    contentVersion: num(row.content_version),
    seoTitle: str(row.seo_title),
    metaDescription: str(row.meta_description),
    primaryIntent: str(row.primary_intent),
    primaryTopic: str(row.primary_topic),
    supportingTopics: strArray(row.supporting_topics),
    slug: str(row.slug),
    h1: str(row.h1),
    h2Structure: strArray(row.h2_structure),
    internalLinks: (Array.isArray(row.internal_links) ? row.internal_links : []) as SeoMetadata["internalLinks"],
    imageAltText: str(row.image_alt_text),
    imageFilename: str(row.image_filename),
    ogTitle: str(row.og_title),
    ogDescription: str(row.og_description),
    ogImage: str(row.og_image),
    schemaJsonLd: obj(row.schema_json_ld),
    relatedContent: strArray(row.related_content),
  };
}

export function fromSeo(s: SeoMetadata): Row {
  return {
    campaign_id: s.campaignId,
    content_version: s.contentVersion,
    seo_title: s.seoTitle,
    meta_description: s.metaDescription,
    primary_intent: s.primaryIntent,
    primary_topic: s.primaryTopic,
    supporting_topics: s.supportingTopics ?? [],
    slug: s.slug,
    h1: s.h1,
    h2_structure: s.h2Structure ?? [],
    internal_links: s.internalLinks ?? [],
    image_alt_text: s.imageAltText ?? "",
    image_filename: s.imageFilename ?? "",
    og_title: s.ogTitle ?? "",
    og_description: s.ogDescription ?? "",
    og_image: s.ogImage ?? "",
    schema_json_ld: s.schemaJsonLd ?? {},
    related_content: s.relatedContent ?? [],
  };
}

export function toQuality(row: Row): QualityScore {
  return {
    campaignId: str(row.campaign_id),
    contentVersion: num(row.content_version),
    overall: num(row.overall),
    breakdown: obj(row.breakdown) as Record<string, number>,
    issues: (Array.isArray(row.issues) ? row.issues : []) as QualityScore["issues"],
    verdict: row.verdict as QualityScore["verdict"],
    checkedAt: iso(row.checked_at),
    by: str(row.checked_by),
  };
}

export function fromQuality(q: QualityScore): Row {
  return {
    campaign_id: q.campaignId,
    content_version: q.contentVersion,
    overall: q.overall,
    breakdown: q.breakdown ?? {},
    issues: q.issues ?? [],
    verdict: q.verdict,
    checked_at: q.checkedAt,
    checked_by: q.by,
  };
}

// --- agent runs -------------------------------------------------------------

export function toAgentRun(row: Row): AgentRun {
  const input = numOrNull(row.input_tokens);
  const output = numOrNull(row.output_tokens);
  return {
    id: str(row.id),
    campaignId: str(row.campaign_id),
    agentName: str(row.agent_name),
    runId: str(row.run_id),
    model: str(row.model),
    status: row.status as AgentRun["status"],
    summary: str(row.summary),
    startedAt: iso(row.started_at),
    finishedAt: isoOrNull(row.finished_at),
    durationMs: numOrNull(row.duration_ms),
    error: strOrNull(row.error),
    tokens: input !== null && output !== null ? { input, output } : null,
  };
}

export function fromAgentRun(r: AgentRun): Row {
  return {
    id: r.id,
    campaign_id: r.campaignId,
    agent_name: r.agentName,
    run_id: r.runId,
    model: r.model,
    status: r.status,
    summary: r.summary,
    started_at: r.startedAt,
    finished_at: r.finishedAt,
    duration_ms: r.durationMs,
    error: r.error ?? null,
    input_tokens: r.tokens?.input ?? null,
    output_tokens: r.tokens?.output ?? null,
  };
}

// --- social accounts --------------------------------------------------------

export function toSocialAccount(row: Row): SocialAccount {
  return {
    id: str(row.id),
    platform: row.platform as Platform,
    label: str(row.label),
    connectedBy: str(row.connected_by),
    status: row.status as SocialAccount["status"],
    capabilities: obj(row.capabilities) as SocialAccount["capabilities"],
    permissions: strArray(row.permissions),
    connectedAt: iso(row.connected_at),
    requiresAppReview: bool(row.requires_app_review),
    mock: bool(row.mock),
  };
}

export function fromSocialAccount(a: SocialAccount): Row {
  return {
    id: a.id,
    platform: a.platform,
    label: a.label,
    connected_by: a.connectedBy,
    status: a.status,
    capabilities: a.capabilities ?? {},
    permissions: a.permissions ?? [],
    connected_at: a.connectedAt,
    requires_app_review: a.requiresAppReview,
    mock: a.mock,
  };
}

// --- publish jobs + attempts ------------------------------------------------

export function toPublishJob(row: Row): PublishJob {
  return {
    id: str(row.id),
    campaignId: str(row.campaign_id),
    platform: row.platform as Platform,
    accountId: str(row.account_id),
    contentVersion: num(row.content_version),
    mediaVersion: strOrNull(row.media_version),
    scheduledFor: iso(row.scheduled_for),
    status: row.status as PublishJob["status"],
    publishedAt: isoOrNull(row.published_at),
    platformPostId: strOrNull(row.platform_post_id),
    platformScheduleId: strOrNull(row.platform_schedule_id),
    error: strOrNull(row.error),
    retryCount: num(row.retry_count),
    maxRetries: num(row.max_retries),
    nextAttemptAt: isoOrNull(row.next_attempt_at),
    idempotencyKey: str(row.idempotency_key),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    lockedUntil: isoOrNull(row.locked_until),
  };
}

export function fromPublishJob(j: PublishJob): Row {
  return {
    id: j.id,
    campaign_id: j.campaignId,
    platform: j.platform,
    account_id: j.accountId,
    content_version: j.contentVersion,
    media_version: j.mediaVersion,
    scheduled_for: j.scheduledFor,
    status: j.status,
    published_at: j.publishedAt ?? null,
    platform_post_id: j.platformPostId ?? null,
    platform_schedule_id: j.platformScheduleId ?? null,
    error: j.error ?? null,
    retry_count: j.retryCount,
    max_retries: j.maxRetries,
    next_attempt_at: j.nextAttemptAt ?? null,
    idempotency_key: j.idempotencyKey,
    created_at: j.createdAt,
    updated_at: j.updatedAt,
    locked_until: j.lockedUntil ?? null,
  };
}

export function toAttempt(row: Row): PublishAttempt {
  return {
    id: str(row.id),
    jobId: str(row.job_id),
    campaignId: str(row.campaign_id),
    platform: row.platform as Platform,
    attempt: num(row.attempt),
    status: row.status as PublishAttempt["status"],
    error: strOrNull(row.error),
    httpStatus: numOrNull(row.http_status),
    at: iso(row.at),
  };
}

export function fromAttempt(a: PublishAttempt): Row {
  return {
    id: a.id,
    job_id: a.jobId,
    campaign_id: a.campaignId,
    platform: a.platform,
    attempt: a.attempt,
    status: a.status,
    error: a.error ?? null,
    http_status: a.httpStatus ?? null,
    at: a.at,
  };
}

// --- audit + messages -------------------------------------------------------

export function toAudit(row: Row): AuditEntry {
  return {
    id: str(row.id),
    at: iso(row.at),
    actor: str(row.actor),
    action: str(row.action),
    entity: str(row.entity),
    entityId: str(row.entity_id),
    detail: obj(row.detail),
    ip: strOrNull(row.ip),
  };
}

export function fromAudit(e: AuditEntry): Row {
  return {
    id: e.id,
    at: e.at,
    actor: e.actor,
    action: e.action,
    entity: e.entity,
    entity_id: e.entityId,
    detail: e.detail ?? {},
    ip: e.ip ?? null,
  };
}

export function toMessage(row: Row): AssistantMessage {
  return {
    id: str(row.id),
    campaignId: str(row.campaign_id),
    role: row.role as AssistantMessage["role"],
    text: str(row.text),
    at: iso(row.at),
  };
}

export function fromMessage(m: AssistantMessage): Row {
  return {
    id: m.id,
    campaign_id: m.campaignId,
    role: m.role,
    text: m.text,
    at: m.at,
  };
}

// --- brand ------------------------------------------------------------------

export function toBrand(row: Row): BrandSettings {
  return {
    collegeName: str(row.college_name),
    shortName: str(row.short_name),
    abbreviation: str(row.abbreviation),
    website: str(row.website),
    counsellingCode: str(row.counselling_code),
    logoPath: str(row.logo_path),
    colors: obj(row.colors) as BrandSettings["colors"],
    tone: str(row.tone),
    preferredTerminology: strArray(row.preferred_terminology),
    departments: strArray(row.departments),
    socialHandles: obj(row.social_handles) as BrandSettings["socialHandles"],
    contact: obj(row.contact) as BrandSettings["contact"],
    officialHashtags: strArray(row.official_hashtags),
    forbiddenTerminology: strArray(row.forbidden_terminology),
    approvalRule: str(row.approval_rule),
  };
}

export function fromBrand(b: BrandSettings): Row {
  return {
    id: true, // Singleton row — the check constraint rejects anything else.
    college_name: b.collegeName,
    short_name: b.shortName,
    abbreviation: b.abbreviation,
    website: b.website,
    counselling_code: b.counsellingCode,
    logo_path: b.logoPath,
    colors: b.colors ?? {},
    tone: b.tone ?? "",
    preferred_terminology: b.preferredTerminology ?? [],
    departments: b.departments ?? [],
    social_handles: b.socialHandles ?? {},
    contact: b.contact ?? {},
    official_hashtags: b.officialHashtags ?? [],
    forbidden_terminology: b.forbiddenTerminology ?? [],
    approval_rule: b.approvalRule ?? "",
  };
}
