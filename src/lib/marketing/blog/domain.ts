// Blog Agent — domain model.
//
// Sibling to ../domain.ts, not an extension of it. A Campaign promotes something
// that happened; a BlogPost is evergreen editorial that exists to be genuinely
// useful to a student or parent and, as a consequence, to be found on Google.
// The two share the LLM, brand and grounding layers and nothing else.

/** Categories the blog is organised by. Drives /blog filtering and the SEO topic map. */
export const BLOG_CATEGORIES = [
  "Study Skills",
  "Career & Placements",
  "Admissions Guide",
  "Campus Life",
  "Technology & Skills",
  "Parents' Corner",
  "Student Wellbeing",
  "Konaseema & Community",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export function isBlogCategory(v: unknown): v is BlogCategory {
  return typeof v === "string" && (BLOG_CATEGORIES as readonly string[]).includes(v);
}

export type BlogAudience = "students" | "parents" | "both" | "recruiters" | "faculty";

export const BLOG_AUDIENCES: BlogAudience[] = ["students", "parents", "both", "recruiters", "faculty"];

export type BlogTopicStatus = "proposed" | "approved" | "rejected" | "used" | "expired";
export type BlogTopicSource = "agent" | "admin";

/**
 * One idea in the daily queue.
 *
 * `rationale` and `promoAngle` are stored separately on purpose. The quality
 * gate checks that the article delivers on the rationale (real usefulness) and
 * that the promo angle stays a footnote — an article that is only promotion
 * fails both the reader and, in practice, search ranking.
 */
export interface BlogTopic {
  id: string;
  title: string;
  angle: string;
  rationale: string;
  searchIntent: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  promoAngle: string;
  audience: BlogAudience;
  category: BlogCategory;
  /** 0–100: search demand × institutional fit × freshness. */
  score: number;
  status: BlogTopicStatus;
  source: BlogTopicSource;
  /** IST date of the batch this idea belongs to (YYYY-MM-DD). */
  proposedOn: string;
  decidedBy?: string | null;
  decidedAt?: string | null;
  postId?: string | null;
  createdAt: string;
}

export type BlogPostStatus = "GENERATING" | "NEEDS_REVIEW" | "PUBLISHED" | "UNPUBLISHED" | "FAILED";

export interface BlogSeo {
  seoTitle: string;
  metaDescription: string;
  slug: string;
  h1: string;
  h2Structure: string[];
  primaryKeyword: string;
  secondaryKeywords: string[];
  internalLinks: { label: string; href: string }[];
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  schemaJsonLd: Record<string, unknown>;
  /** Fields the model failed to return, filled from defaults. Surfaced in the UI. */
  repaired: string[];
}

export interface BlogQualityIssue {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
}

export interface BlogQualityReport {
  overall: number;
  breakdown: Record<string, number>;
  issues: BlogQualityIssue[];
  verdict: "pass" | "needs_review";
  /** What the self-critique pass rewrote, if it ran. */
  revisions: string[];
  checkedAt: string;
}

export interface BlogImage {
  id: string;
  postId: string;
  url: string;
  alt: string;
  caption?: string | null;
  placement: "hero" | "section" | "og";
  sectionIndex?: number | null;
  width?: number | null;
  height?: number | null;
  /** True when composed from a real BVCITS photograph rather than pure typography. */
  photoBacked: boolean;
  sourceNote: string;
  createdAt: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** Markdown. Rendered through the allowlist renderer — never raw HTML. */
  bodyMd: string;
  category: BlogCategory;
  tags: string[];
  audience: BlogAudience;
  heroImageUrl?: string | null;
  heroImageAlt?: string | null;
  readingMinutes: number;
  wordCount: number;
  status: BlogPostStatus;
  seo: BlogSeo;
  quality: BlogQualityReport | null;
  /** The exact fact set handed to the writer, kept as provenance. */
  grounding: Record<string, unknown>;
  topicId?: string | null;
  createdBy: string;
  publishedAt?: string | null;
  unpublishedAt?: string | null;
  publishError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BlogAgentRun {
  id: string;
  postId?: string | null;
  /** YYYY-MM-DD when the run belongs to a topic batch rather than a post. */
  topicBatch?: string | null;
  agentName: string;
  status: "running" | "success" | "failed" | "skipped";
  summary: string;
  model: string;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  error?: string | null;
  tokens?: { input: number; output: number } | null;
}

/** One planned section of an article, from the outline agent. */
export interface BlogSection {
  heading: string;
  /** What this section must cover — the writer's brief for it. */
  brief: string;
  /** Target words. Sections vary deliberately so the article does not read as uniform slop. */
  targetWords: number;
  /** Grounded facts this section is allowed to cite, by key. */
  citeFacts: string[];
  /** Whether a section image belongs here. */
  wantsImage: boolean;
}

export interface BlogOutline {
  title: string;
  hook: string;
  sections: BlogSection[];
  /** Real routes on this site the article should link to. Validated before use. */
  internalLinks: { label: string; href: string }[];
  targetWords: number;
  repaired: string[];
}

/**
 * Id/time helpers, duplicated from ../storage.ts rather than imported.
 *
 * That module builds `export const store = selectStore()` at import time, which
 * throws when MARKETING_STORE=supabase is set without keys. The public /blog
 * pages import this file, and a marketing misconfiguration must not be able to
 * take the public site down.
 */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** IST calendar date, which is the batch key the daily queue is grouped by. */
export function istDate(at: Date = new Date()): string {
  const ist = new Date(at.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

/**
 * URL slug, truncated at a WORD boundary.
 *
 * A blind .slice(0, 80) produced
 * "…-9-things-to-check-before-you-l" on the first real article — a URL ending
 * mid-word, permanently, because the slug is the public address and is never
 * changed after publication.
 */
export function slugify(input: string, max = 72): string {
  const full = input
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  if (full.length <= max) return full;
  const cut = full.slice(0, max);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > max * 0.5 ? cut.slice(0, lastDash) : cut).replace(/-$/, "");
}

export function countWords(markdown: string): number {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`\[\]()!-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** 200 wpm, floored at 1 — the figure shown as "N min read". */
export function readingMinutes(markdown: string): number {
  return Math.max(1, Math.round(countWords(markdown) / 200));
}
