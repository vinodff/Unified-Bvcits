// Read side of the blog for the PUBLIC site.
//
// Separate from the admin store deliberately: everything here is filtered to
// PUBLISHED, so a draft or a post held in NEEDS_REVIEW cannot leak onto the
// site through a page that forgot to check. The status filter lives in one
// place rather than at every call site.
//
// These run in server components using the service-role client (RLS on the blog
// tables has no policies at all — see 0009_blog.sql), so nothing here may ever
// be imported from a "use client" module.

import { blogStore } from "@/lib/marketing/blog/store";
import type { BlogCategory, BlogPost } from "@/lib/marketing/blog/domain";

export interface PostCard {
  slug: string;
  title: string;
  excerpt: string;
  category: BlogCategory;
  audience: BlogPost["audience"];
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  readingMinutes: number;
  publishedAt: string | null;
  tags: string[];
}

function toCard(p: BlogPost): PostCard {
  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    category: p.category,
    audience: p.audience,
    heroImageUrl: p.heroImageUrl ?? null,
    heroImageAlt: p.heroImageAlt ?? null,
    readingMinutes: p.readingMinutes,
    publishedAt: p.publishedAt ?? null,
    tags: p.tags,
  };
}

/**
 * Published posts, newest first.
 *
 * A store failure returns an empty list rather than throwing. That is the
 * opposite of the rule inside the store, and it is right here: the blog index
 * is one section of a college website, and a database blip must degrade to
 * "no articles yet" instead of a 500 on a page a prospective student is
 * reading. The admin side still throws, so the failure is not hidden from the
 * people who can fix it.
 */
export async function listPublished(limit = 60): Promise<PostCard[]> {
  try {
    const posts = await blogStore.listPosts({ status: "PUBLISHED", limit });
    return posts.map(toCard);
  } catch {
    return [];
  }
}

export async function getPublished(slug: string): Promise<BlogPost | null> {
  try {
    const post = await blogStore.getPostBySlug(slug);
    return post && post.status === "PUBLISHED" ? post : null;
  } catch {
    return null;
  }
}

/** Same category first, then anything recent. Never includes the current post. */
export async function relatedPosts(post: BlogPost, limit = 3): Promise<PostCard[]> {
  const all = await listPublished(40);
  const others = all.filter((p) => p.slug !== post.slug);
  const sameCategory = others.filter((p) => p.category === post.category);
  const rest = others.filter((p) => p.category !== post.category);
  return [...sameCategory, ...rest].slice(0, limit);
}

/** Categories that actually have published posts, with counts. */
export async function activeCategories(): Promise<{ category: BlogCategory; count: number }[]> {
  const posts = await listPublished(200);
  const counts = new Map<BlogCategory, number>();
  for (const p of posts) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export function formatPublished(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}
