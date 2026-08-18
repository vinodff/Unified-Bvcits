// One blog post: full detail, edits, and publish / unpublish.

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { guard } from "@/lib/marketing/api-guard";
import { blogStore } from "@/lib/marketing/blog/store";
import { editPost, publishPost, unpublishPost } from "@/lib/marketing/blog/pipeline";
import { isBlogCategory } from "@/lib/marketing/blog/domain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await ctx.params;
  const post = await blogStore.getPost(id);
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [images, runs] = await Promise.all([blogStore.listImages(id), blogStore.listRuns({ postId: id }, 40)]);
  return NextResponse.json({ post, images, runs });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: "publish" | "unpublish" | "edit";
    actor?: string;
    title?: string;
    excerpt?: string;
    bodyMd?: string;
    category?: string;
    tags?: string[];
  };
  const actor = body.actor?.trim() || "admin";

  const existing = await blogStore.getPost(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    let post;
    if (body.action === "publish") {
      post = await publishPost(blogStore, id, actor);
    } else if (body.action === "unpublish") {
      post = await unpublishPost(blogStore, id, actor);
    } else {
      const patch: Parameters<typeof editPost>[2] = {};
      if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
      if (typeof body.excerpt === "string") patch.excerpt = body.excerpt.trim();
      if (typeof body.bodyMd === "string" && body.bodyMd.trim()) patch.bodyMd = body.bodyMd;
      if (isBlogCategory(body.category)) patch.category = body.category;
      if (Array.isArray(body.tags)) patch.tags = body.tags.map(String).filter(Boolean).slice(0, 8);
      if (!Object.keys(patch).length) {
        return NextResponse.json({ error: "nothing to update" }, { status: 400 });
      }
      post = await editPost(blogStore, id, patch, actor);
    }

    // The public blog is statically cached; without this an admin publishes and
    // then cannot find the article on the site they just published it to.
    revalidatePath("/blog");
    revalidatePath(`/blog/${post.slug}`);
    revalidatePath("/sitemap.xml");

    return NextResponse.json({ post });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
