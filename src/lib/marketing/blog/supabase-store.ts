// SupabaseBlogStore — BlogStore backed by Postgres (migration 0009_blog.sql).
//
// Row <-> domain mapping lives inline here rather than in a mappers module: the
// four blog tables are flat, and every conversion is a rename plus a default.
//
// Errors are thrown, never swallowed into an empty array. A blog page that
// renders "no posts yet" because the database was unreachable looks identical
// to a blog that genuinely has no posts, and that is exactly the failure the
// campaign store was already written to avoid.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/client";
import type {
  BlogAgentRun,
  BlogAudience,
  BlogCategory,
  BlogImage,
  BlogPost,
  BlogPostStatus,
  BlogQualityReport,
  BlogSeo,
  BlogTopic,
} from "./domain";
import { BLOG_CATEGORIES } from "./domain";
import type { BlogStore, PostQuery, TopicQuery } from "./store";

const NO_ROWS = "PGRST116";

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown, fallback = 0): number => (typeof v === "number" ? v : Number(v) || fallback);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const bool = (v: unknown): boolean => v === true;
const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Postgres returns "2026-08-15 09:20:00+00"; the domain model uses ISO-8601. */
function iso(v: unknown): string {
  const s = str(v);
  if (!s) return new Date().toISOString();
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function isoOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : iso(v);
}

const category = (v: unknown): BlogCategory => {
  const s = str(v);
  return (BLOG_CATEGORIES as readonly string[]).includes(s) ? (s as BlogCategory) : "Campus Life";
};

const EMPTY_SEO: BlogSeo = {
  seoTitle: "",
  metaDescription: "",
  slug: "",
  h1: "",
  h2Structure: [],
  primaryKeyword: "",
  secondaryKeywords: [],
  internalLinks: [],
  ogTitle: "",
  ogDescription: "",
  ogImage: "",
  schemaJsonLd: {},
  repaired: [],
};

function toTopic(r: Row): BlogTopic {
  return {
    id: str(r.id),
    title: str(r.title),
    angle: str(r.angle),
    rationale: str(r.rationale),
    searchIntent: str(r.search_intent),
    primaryKeyword: str(r.primary_keyword),
    secondaryKeywords: strArray(r.secondary_keywords),
    promoAngle: str(r.promo_angle),
    audience: str(r.audience, "students") as BlogAudience,
    category: category(r.category),
    score: num(r.score, 50),
    status: str(r.status, "proposed") as BlogTopic["status"],
    source: str(r.source, "agent") as BlogTopic["source"],
    proposedOn: str(r.proposed_on).slice(0, 10),
    decidedBy: strOrNull(r.decided_by),
    decidedAt: isoOrNull(r.decided_at),
    postId: strOrNull(r.post_id),
    createdAt: iso(r.created_at),
  };
}

function fromTopic(t: BlogTopic): Row {
  return {
    id: t.id,
    title: t.title,
    angle: t.angle,
    rationale: t.rationale,
    search_intent: t.searchIntent,
    primary_keyword: t.primaryKeyword,
    secondary_keywords: t.secondaryKeywords,
    promo_angle: t.promoAngle,
    audience: t.audience,
    category: t.category,
    score: t.score,
    status: t.status,
    source: t.source,
    proposed_on: t.proposedOn,
    decided_by: t.decidedBy ?? null,
    decided_at: t.decidedAt ?? null,
    post_id: t.postId ?? null,
    created_at: t.createdAt,
  };
}

function toPost(r: Row): BlogPost {
  const seo = obj(r.seo);
  const quality = obj(r.quality);
  return {
    id: str(r.id),
    slug: str(r.slug),
    title: str(r.title),
    excerpt: str(r.excerpt),
    bodyMd: str(r.body_md),
    category: category(r.category),
    tags: strArray(r.tags),
    audience: str(r.audience, "students") as BlogAudience,
    heroImageUrl: strOrNull(r.hero_image_url),
    heroImageAlt: strOrNull(r.hero_image_alt),
    readingMinutes: num(r.reading_minutes),
    wordCount: num(r.word_count),
    status: str(r.status, "GENERATING") as BlogPostStatus,
    seo: { ...EMPTY_SEO, ...(seo as Partial<BlogSeo>) },
    quality: Object.keys(quality).length ? (quality as unknown as BlogQualityReport) : null,
    grounding: obj(r.grounding),
    topicId: strOrNull(r.topic_id),
    createdBy: str(r.created_by, "blog-agent"),
    publishedAt: isoOrNull(r.published_at),
    unpublishedAt: isoOrNull(r.unpublished_at),
    publishError: strOrNull(r.publish_error),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function fromPost(p: BlogPost): Row {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    body_md: p.bodyMd,
    category: p.category,
    tags: p.tags,
    audience: p.audience,
    hero_image_url: p.heroImageUrl ?? null,
    hero_image_alt: p.heroImageAlt ?? null,
    reading_minutes: p.readingMinutes,
    word_count: p.wordCount,
    status: p.status,
    seo: p.seo,
    quality: p.quality ?? {},
    grounding: p.grounding,
    topic_id: p.topicId ?? null,
    created_by: p.createdBy,
    published_at: p.publishedAt ?? null,
    unpublished_at: p.unpublishedAt ?? null,
    publish_error: p.publishError ?? null,
    created_at: p.createdAt,
  };
}

function toImage(r: Row): BlogImage {
  return {
    id: str(r.id),
    postId: str(r.post_id),
    url: str(r.url),
    alt: str(r.alt),
    caption: strOrNull(r.caption),
    placement: str(r.placement, "section") as BlogImage["placement"],
    sectionIndex: numOrNull(r.section_index),
    width: numOrNull(r.width),
    height: numOrNull(r.height),
    photoBacked: bool(r.photo_backed),
    sourceNote: str(r.source_note),
    createdAt: iso(r.created_at),
  };
}

function fromImage(i: BlogImage): Row {
  return {
    id: i.id,
    post_id: i.postId,
    url: i.url,
    alt: i.alt,
    caption: i.caption ?? null,
    placement: i.placement,
    section_index: i.sectionIndex ?? null,
    width: i.width ?? null,
    height: i.height ?? null,
    photo_backed: i.photoBacked,
    source_note: i.sourceNote,
    created_at: i.createdAt,
  };
}

function toRun(r: Row): BlogAgentRun {
  const tokens = obj(r.tokens);
  return {
    id: str(r.id),
    postId: strOrNull(r.post_id),
    topicBatch: r.topic_batch ? str(r.topic_batch).slice(0, 10) : null,
    agentName: str(r.agent_name),
    status: str(r.status, "running") as BlogAgentRun["status"],
    summary: str(r.summary),
    model: str(r.model),
    startedAt: iso(r.started_at),
    finishedAt: isoOrNull(r.finished_at),
    durationMs: numOrNull(r.duration_ms),
    error: strOrNull(r.error),
    tokens: Object.keys(tokens).length
      ? { input: num(tokens.input), output: num(tokens.output) }
      : null,
  };
}

function fromRun(r: BlogAgentRun): Row {
  return {
    id: r.id,
    post_id: r.postId ?? null,
    topic_batch: r.topicBatch ?? null,
    agent_name: r.agentName,
    status: r.status,
    summary: r.summary,
    model: r.model,
    started_at: r.startedAt,
    finished_at: r.finishedAt ?? null,
    duration_ms: r.durationMs ?? null,
    error: r.error ?? null,
    tokens: r.tokens ?? null,
  };
}

export class SupabaseBlogStore implements BlogStore {
  private injected: SupabaseClient | null;
  private resolved: SupabaseClient | null = null;

  constructor(client?: SupabaseClient) {
    this.injected = client ?? null;
  }

  /** Resolved lazily so `next build` does not fail on a missing key. */
  private get client(): SupabaseClient {
    if (this.injected) return this.injected;
    if (!this.resolved) this.resolved = getAdminClient();
    return this.resolved;
  }

  private async run<T>(
    label: string,
    fn: () => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
    map: (r: Row) => T
  ): Promise<T[]> {
    const { data, error } = await fn();
    if (error) throw new Error(`Blog store ${label} failed: ${error.message}`);
    return Array.isArray(data) ? (data as Row[]).map(map) : [];
  }

  private async one<T>(
    label: string,
    fn: () => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
    map: (r: Row) => T
  ): Promise<T | null> {
    const { data, error } = await fn();
    if (error) {
      if (error.code === NO_ROWS) return null;
      throw new Error(`Blog store ${label} failed: ${error.message}`);
    }
    return data ? map(data as Row) : null;
  }

  private async write(label: string, fn: () => PromiseLike<{ error: { message: string } | null }>): Promise<void> {
    const { error } = await fn();
    if (error) throw new Error(`Blog store ${label} failed: ${error.message}`);
  }

  // ---- topics ----
  async listTopics(q: TopicQuery = {}): Promise<BlogTopic[]> {
    return this.run(
      "listTopics",
      () => {
        let query = this.client.from("blog_topics").select("*");
        if (q.proposedOn) query = query.eq("proposed_on", q.proposedOn);
        if (q.status) query = query.eq("status", q.status);
        query = query.order("proposed_on", { ascending: false }).order("score", { ascending: false });
        return q.limit ? query.limit(q.limit) : query;
      },
      toTopic
    );
  }

  async getTopic(id: string): Promise<BlogTopic | null> {
    return this.one("getTopic", () => this.client.from("blog_topics").select("*").eq("id", id).single(), toTopic);
  }

  async saveTopic(t: BlogTopic): Promise<void> {
    await this.write("saveTopic", () => this.client.from("blog_topics").upsert(fromTopic(t), { onConflict: "id" }));
  }

  async saveTopics(ts: BlogTopic[]): Promise<void> {
    if (!ts.length) return;
    await this.write("saveTopics", () =>
      this.client.from("blog_topics").upsert(ts.map(fromTopic), { onConflict: "id" })
    );
  }

  // ---- posts ----
  async listPosts(q: PostQuery = {}): Promise<BlogPost[]> {
    return this.run(
      "listPosts",
      () => {
        let query = this.client.from("blog_posts").select("*");
        if (q.status) {
          const wanted = Array.isArray(q.status) ? q.status : [q.status];
          query = wanted.length === 1 ? query.eq("status", wanted[0]) : query.in("status", wanted);
        }
        if (q.category) query = query.eq("category", q.category);
        query = query
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });
        const from = q.offset ?? 0;
        if (q.limit) query = query.range(from, from + q.limit - 1);
        return query;
      },
      toPost
    );
  }

  async getPost(id: string): Promise<BlogPost | null> {
    return this.one("getPost", () => this.client.from("blog_posts").select("*").eq("id", id).single(), toPost);
  }

  async getPostBySlug(slug: string): Promise<BlogPost | null> {
    return this.one("getPostBySlug", () => this.client.from("blog_posts").select("*").eq("slug", slug).single(), toPost);
  }

  async savePost(p: BlogPost): Promise<void> {
    await this.write("savePost", () => this.client.from("blog_posts").upsert(fromPost(p), { onConflict: "id" }));
  }

  async slugAvailable(slug: string, exceptId?: string): Promise<boolean> {
    const existing = await this.getPostBySlug(slug);
    return !existing || existing.id === exceptId;
  }

  // ---- images ----
  async listImages(postId: string): Promise<BlogImage[]> {
    return this.run(
      "listImages",
      () =>
        this.client
          .from("blog_post_images")
          .select("*")
          .eq("post_id", postId)
          .order("section_index", { ascending: true, nullsFirst: true }),
      toImage
    );
  }

  async saveImage(i: BlogImage): Promise<void> {
    await this.write("saveImage", () =>
      this.client.from("blog_post_images").upsert(fromImage(i), { onConflict: "id" })
    );
  }

  async deleteImages(postId: string): Promise<void> {
    await this.write("deleteImages", () => this.client.from("blog_post_images").delete().eq("post_id", postId));
  }

  // ---- runs ----
  async listRuns(anchor: { postId?: string; topicBatch?: string }, limit = 100): Promise<BlogAgentRun[]> {
    return this.run(
      "listRuns",
      () => {
        let query = this.client.from("blog_agent_runs").select("*");
        if (anchor.postId) query = query.eq("post_id", anchor.postId);
        if (anchor.topicBatch) query = query.eq("topic_batch", anchor.topicBatch);
        return query.order("started_at", { ascending: false }).limit(limit);
      },
      toRun
    );
  }

  async saveRun(r: BlogAgentRun): Promise<void> {
    await this.write("saveRun", () => this.client.from("blog_agent_runs").upsert(fromRun(r), { onConflict: "id" }));
  }
}
