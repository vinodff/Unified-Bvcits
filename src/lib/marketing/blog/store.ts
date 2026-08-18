// Blog storage — BlogStore interface + the JSON file implementation.
//
// Mirrors ../storage.ts exactly: JsonFileBlogStore is the zero-infrastructure
// default for local work, SupabaseBlogStore (./supabase-store.ts) is the real
// backend. selectBlogStore() picks between them using the same
// MARKETING_STORE env var, so the blog can never end up on a different backend
// from the campaigns it sits beside.

import { promises as fs } from "node:fs";
import path from "node:path";
import { isSupabaseAdminConfigured } from "@/lib/supabase/client";
import type { BlogAgentRun, BlogImage, BlogPost, BlogPostStatus, BlogTopic } from "./domain";
import { SupabaseBlogStore } from "./supabase-store";

export interface TopicQuery {
  /** IST batch date; omit for every batch. */
  proposedOn?: string;
  status?: BlogTopic["status"];
  limit?: number;
}

export interface PostQuery {
  status?: BlogPostStatus | BlogPostStatus[];
  category?: string;
  limit?: number;
  offset?: number;
}

export interface BlogStore {
  // topics
  listTopics(q?: TopicQuery): Promise<BlogTopic[]>;
  getTopic(id: string): Promise<BlogTopic | null>;
  saveTopic(t: BlogTopic): Promise<void>;
  saveTopics(ts: BlogTopic[]): Promise<void>;

  // posts
  listPosts(q?: PostQuery): Promise<BlogPost[]>;
  getPost(id: string): Promise<BlogPost | null>;
  getPostBySlug(slug: string): Promise<BlogPost | null>;
  savePost(p: BlogPost): Promise<void>;
  /** True when the slug is free (or already belongs to `exceptId`). */
  slugAvailable(slug: string, exceptId?: string): Promise<boolean>;

  // images
  listImages(postId: string): Promise<BlogImage[]>;
  saveImage(i: BlogImage): Promise<void>;
  deleteImages(postId: string): Promise<void>;

  // runs
  listRuns(anchor: { postId?: string; topicBatch?: string }, limit?: number): Promise<BlogAgentRun[]>;
  saveRun(r: BlogAgentRun): Promise<void>;
}

const ENTITIES = ["blogTopics", "blogPosts", "blogImages", "blogRuns"] as const;

export class JsonFileBlogStore implements BlogStore {
  private readonly dir: string;

  constructor(baseDir?: string) {
    this.dir = baseDir ?? path.join(process.cwd(), ".data", "marketing");
  }

  private file(entity: (typeof ENTITIES)[number]): string {
    return path.join(this.dir, `${entity}.json`);
  }

  private async read<T>(entity: (typeof ENTITIES)[number]): Promise<T[]> {
    try {
      const raw = await fs.readFile(this.file(entity), "utf-8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  private async write<T>(entity: (typeof ENTITIES)[number], rows: T[]): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.file(entity)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf-8");
    await fs.rename(tmp, this.file(entity));
  }

  private async upsert<T extends { id: string }>(entity: (typeof ENTITIES)[number], row: T): Promise<void> {
    const rows = await this.read<T>(entity);
    const idx = rows.findIndex((r) => r.id === row.id);
    if (idx >= 0) rows[idx] = row;
    else rows.push(row);
    await this.write(entity, rows);
  }

  // ---- topics ----
  async listTopics(q: TopicQuery = {}): Promise<BlogTopic[]> {
    let rows = await this.read<BlogTopic>("blogTopics");
    if (q.proposedOn) rows = rows.filter((t) => t.proposedOn === q.proposedOn);
    if (q.status) rows = rows.filter((t) => t.status === q.status);
    rows.sort((a, b) => b.proposedOn.localeCompare(a.proposedOn) || b.score - a.score);
    return q.limit ? rows.slice(0, q.limit) : rows;
  }

  async getTopic(id: string): Promise<BlogTopic | null> {
    const rows = await this.read<BlogTopic>("blogTopics");
    return rows.find((t) => t.id === id) ?? null;
  }

  async saveTopic(t: BlogTopic): Promise<void> {
    await this.upsert("blogTopics", t);
  }

  async saveTopics(ts: BlogTopic[]): Promise<void> {
    const rows = await this.read<BlogTopic>("blogTopics");
    for (const t of ts) {
      const idx = rows.findIndex((r) => r.id === t.id);
      if (idx >= 0) rows[idx] = t;
      else rows.push(t);
    }
    await this.write("blogTopics", rows);
  }

  // ---- posts ----
  async listPosts(q: PostQuery = {}): Promise<BlogPost[]> {
    let rows = await this.read<BlogPost>("blogPosts");
    if (q.status) {
      const wanted = new Set(Array.isArray(q.status) ? q.status : [q.status]);
      rows = rows.filter((p) => wanted.has(p.status));
    }
    if (q.category) rows = rows.filter((p) => p.category === q.category);
    rows.sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt));
    const start = q.offset ?? 0;
    return q.limit ? rows.slice(start, start + q.limit) : rows.slice(start);
  }

  async getPost(id: string): Promise<BlogPost | null> {
    const rows = await this.read<BlogPost>("blogPosts");
    return rows.find((p) => p.id === id) ?? null;
  }

  async getPostBySlug(slug: string): Promise<BlogPost | null> {
    const rows = await this.read<BlogPost>("blogPosts");
    return rows.find((p) => p.slug === slug) ?? null;
  }

  async savePost(p: BlogPost): Promise<void> {
    await this.upsert("blogPosts", p);
  }

  async slugAvailable(slug: string, exceptId?: string): Promise<boolean> {
    const rows = await this.read<BlogPost>("blogPosts");
    return !rows.some((p) => p.slug === slug && p.id !== exceptId);
  }

  // ---- images ----
  async listImages(postId: string): Promise<BlogImage[]> {
    const rows = await this.read<BlogImage>("blogImages");
    return rows
      .filter((i) => i.postId === postId)
      .sort((a, b) => (a.sectionIndex ?? -1) - (b.sectionIndex ?? -1));
  }

  async saveImage(i: BlogImage): Promise<void> {
    await this.upsert("blogImages", i);
  }

  async deleteImages(postId: string): Promise<void> {
    const rows = await this.read<BlogImage>("blogImages");
    await this.write("blogImages", rows.filter((i) => i.postId !== postId));
  }

  // ---- runs ----
  async listRuns(anchor: { postId?: string; topicBatch?: string }, limit = 100): Promise<BlogAgentRun[]> {
    const rows = await this.read<BlogAgentRun>("blogRuns");
    return rows
      .filter((r) =>
        anchor.postId ? r.postId === anchor.postId : anchor.topicBatch ? r.topicBatch === anchor.topicBatch : true
      )
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  }

  async saveRun(r: BlogAgentRun): Promise<void> {
    await this.upsert("blogRuns", r);
  }
}

/** Same selection rules as ../storage.ts — see the comment there. */
function selectBlogStore(): BlogStore {
  const mode = process.env.MARKETING_STORE;
  if (mode === "file") return new JsonFileBlogStore();
  if (mode === "supabase") {
    if (!isSupabaseAdminConfigured()) {
      throw new Error(
        "MARKETING_STORE=supabase but NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY are missing. See docs/SUPABASE.md."
      );
    }
    return new SupabaseBlogStore();
  }
  return isSupabaseAdminConfigured() ? new SupabaseBlogStore() : new JsonFileBlogStore();
}

export const blogStore: BlogStore = selectBlogStore();
