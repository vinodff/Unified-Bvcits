// Marketing Studio — domain model.
// Source of truth for every entity used by the agent pipeline, approval flow,
// scheduler and publishing adapters. See docs/architecture/agent-research.md.

/**
 * The single source of truth for campaign types.
 *
 * Declared as a runtime array with the union *derived* from it, so the list the
 * UI renders, the list the API validates against, and the type the pipeline
 * checks can never disagree. They previously did: the create form offered
 * "competition", "tieup" and "admission", none of which are valid types, and
 * `REQUIRED_FIELDS[type]` in agents/context-agent.ts returned undefined for
 * them. The JSON store accepted the bad value silently; Postgres rejects it.
 *
 * Adding a member here also needs `alter type public.campaign_type add value`
 * — see supabase/migrations/0002_marketing.sql.
 */
export const CAMPAIGN_TYPES = [
  "event",
  "hackathon",
  "workshop",
  "seminar",
  "achievement",
  "placement",
  "award",
  "faculty_achievement",
  "student_achievement",
  "admission_announcement",
  "exam_announcement",
  "campus_news",
  "research",
  "sports",
  "cultural_event",
  "other",
] as const;

export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

/** Human-readable labels for the create form. */
export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  event: "Event",
  hackathon: "Hackathon",
  workshop: "Workshop",
  seminar: "Seminar",
  achievement: "Achievement",
  placement: "Placement",
  award: "Award",
  faculty_achievement: "Faculty Achievement",
  student_achievement: "Student Achievement",
  admission_announcement: "Admission Announcement",
  exam_announcement: "Exam Announcement",
  campus_news: "Campus News",
  research: "Research",
  sports: "Sports",
  cultural_event: "Cultural Event",
  other: "Other",
};

export function isCampaignType(value: unknown): value is CampaignType {
  return typeof value === "string" && (CAMPAIGN_TYPES as readonly string[]).includes(value);
}

export type CampaignStatus =
  | "DRAFT"
  | "NEEDS_INFORMATION"
  | "GENERATING"
  | "READY_FOR_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "GENERATION_FAILED"
  | "PUBLISH_FAILED"
  | "SCHEDULE_FAILED";

export type Platform =
  | "website"
  | "instagram"
  | "facebook"
  | "linkedin"
  | "whatsapp";

export type FactSource = "admin" | "ai_observation" | "vision_observation" | "inferred";
export type FactValue = string | number | boolean | string[] | null;

export interface CampaignFact {
  field: string;
  value: FactValue;
  /** Where the fact came from — admin input is authoritative. */
  source: FactSource;
  /** 0–1 confidence for AI-derived values. */
  confidence: number;
  /** Whether the admin has explicitly confirmed this fact. */
  verified: boolean;
}

export interface Campaign {
  id: string;
  title: string;
  type: CampaignType;
  status: CampaignStatus;
  source: "manual" | "assistant";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  /** True once an approval exists; any post-approval edit invalidates it. */
  approvalInvalidated?: boolean;
  schedule?: CampaignSchedule;
  /** Strategy output produced by the strategy agent (raw JSON). */
  strategy?: Record<string, unknown>;
  /** Latest approved/published content version number. */
  approvedVersion?: number;
  publishedAt?: string | null;
  publishError?: string | null;
}

export interface CampaignSchedule {
  platforms: Platform[];
  /** ISO timestamps per platform (timezone stored in tz). */
  times: Partial<Record<Platform, string>>;
  tz: string;
}

export interface CampaignAsset {
  id: string;
  campaignId: string;
  originalFile: string;
  processedFile?: string | null;
  type: "image" | "video" | "pdf" | "document" | "reference_design";
  dimensions?: { width: number; height: number } | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  aiGenerated: boolean;
  referenceAssets?: string[];
  altText?: string | null;
  caption?: string | null;
  title?: string | null;
  description?: string | null;
  archived?: boolean;
  metadata?: Record<string, unknown>;
  /** Vision-agent observations about the image (never identities). */
  observations?: string[];
}

export interface ContentVersion {
  id: string;
  campaignId: string;
  version: number;
  platform: Platform;
  contentType: string;
  body: string;
  title?: string | null;
  /** Factual claims made, for QC grounding. */
  claims: string[];
  status: "draft" | "approved" | "superseded";
  createdAt: string;
  createdBy: string;
}

export interface Approval {
  id: string;
  campaignId: string;
  contentVersion: number;
  approvedBy: string;
  approvedAt: string;
  platforms: Platform[];
  scheduledAt?: string | null;
  assetHashes: Record<string, string>;
  status: "approved" | "rejected" | "invalidated";
  note?: string | null;
}

export interface SeoMetadata {
  campaignId: string;
  contentVersion: number;
  seoTitle: string;
  metaDescription: string;
  primaryIntent: string;
  primaryTopic: string;
  supportingTopics: string[];
  slug: string;
  h1: string;
  h2Structure: string[];
  internalLinks: { label: string; href: string }[];
  imageAltText: string;
  imageFilename: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  schemaJsonLd: Record<string, unknown>;
  relatedContent: string[];
}

export interface QualityScore {
  campaignId: string;
  contentVersion: number;
  overall: number;
  breakdown: Record<string, number>;
  issues: { severity: "critical" | "warning" | "info"; message: string }[];
  verdict: "pass" | "needs_correction";
  checkedAt: string;
  by: string;
}

export interface AgentRun {
  id: string;
  campaignId: string;
  agentName: string;
  runId: string;
  model: string;
  status: "running" | "success" | "failed" | "skipped";
  summary: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error?: string | null;
  tokens?: { input: number; output: number } | null;
}

export interface SocialAccount {
  id: string;
  platform: Platform;
  label: string;
  connectedBy: string;
  status: "connected" | "disconnected" | "token_expired" | "permission_error" | "mock";
  /** Capabilities verified against official API docs. */
  capabilities: {
    publishing: boolean;
    scheduling: boolean;
    media: boolean;
    analytics: boolean;
    note: string;
  };
  permissions: string[];
  connectedAt: string;
  requiresAppReview: boolean;
  /** Mock accounts carry a fake token marker; real tokens live server-side only. */
  mock: boolean;
}

export interface PublishJob {
  id: string;
  campaignId: string;
  platform: Platform;
  accountId: string;
  contentVersion: number;
  mediaVersion: string | null;
  scheduledFor: string;
  status:
    | "scheduled"
    | "ready"
    | "publishing"
    | "published"
    | "failed"
    | "canceled"
    | "skipped";
  publishedAt?: string | null;
  platformPostId?: string | null;
  /** Remote schedule id returned by platforms with API-side scheduling. */
  platformScheduleId?: string | null;
  error?: string | null;
  retryCount: number;
  maxRetries: number;
  nextAttemptAt?: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  lockedUntil?: string | null;
}

export interface PublishAttempt {
  id: string;
  jobId: string;
  campaignId: string;
  platform: Platform;
  attempt: number;
  status: "success" | "failure" | "retryable";
  error?: string | null;
  httpStatus?: number | null;
  at: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  detail: Record<string, unknown>;
  ip?: string | null;
}

export interface BrandSettings {
  collegeName: string;
  shortName: string;
  abbreviation: string;
  website: string;
  counsellingCode: string;
  logoPath: string;
  colors: { black: string; gold: string; goldDark: string; ivory: string; white: string; charcoal: string; maroon: string };
  tone: string;
  preferredTerminology: string[];
  departments: string[];
  socialHandles: Partial<Record<Platform, string>>;
  contact: { phone: string; email: string; address: string };
  officialHashtags: string[];
  forbiddenTerminology: string[];
  approvalRule: string;
}

export interface AssistantMessage {
  id: string;
  campaignId: string;
  role: "admin" | "assistant";
  text: string;
  at: string;
}

export interface CampaignConversation {
  campaignId: string;
  messages: AssistantMessage[];
  pendingQuestions: string[];
  facts: CampaignFact[];
}

export interface SupervisorStatus {
  campaignId: string;
  steps: {
    context: "done" | "pending" | "failed";
    images: "done" | "pending" | "failed" | "skipped";
    strategy: "done" | "pending" | "failed";
    writing: "done" | "pending" | "failed";
    seo: "done" | "pending" | "failed";
    creative: "done" | "pending" | "failed";
    quality: "done" | "pending" | "failed";
    approval: "waiting" | "approved" | "rejected";
    publishing: "idle" | "scheduled" | "running" | "published" | "failed";
  };
  contentVersion: number;
}