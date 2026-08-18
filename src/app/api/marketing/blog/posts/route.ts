// Blog posts: list, and generate a full article from an approved topic.

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/marketing/api-guard";
import { blogStore } from "@/lib/marketing/blog/store";
import { generatePost } from "@/lib/marketing/blog/pipeline";
import type { BlogPostStatus } from "@/lib/marketing/blog/domain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/**
 * Generation is four model calls plus image compositing. The Node default of
 * 10s on some hosts would abort a run that is about to succeed and leave the
 * post in FAILED, so the route asks for the longest window it can get.
 */
export const maxDuration = 300;

const STATUSES: BlogPostStatus[] = ["GENERATING", "NEEDS_REVIEW", "PUBLISHED", "UNPUBLISHED", "FAILED"];

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const statusParam = req.nextUrl.searchParams.get("status");
  const status = statusParam && STATUSES.includes(statusParam as BlogPostStatus)
    ? (statusParam as BlogPostStatus)
    : undefined;

  const posts = await blogStore.listPosts({ status, limit: 100 });
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as {
    topicId?: string;
    actor?: string;
    autoPublish?: boolean;
  };
  if (!body.topicId?.trim()) {
    return NextResponse.json({ error: "topicId is required" }, { status: 400 });
  }

  try {
    const result = await generatePost(blogStore, body.topicId.trim(), {
      actor: body.actor?.trim() || "admin",
      autoPublish: body.autoPublish !== false,
    });
    return NextResponse.json(
      {
        post: result.post,
        images: result.images,
        quality: result.quality,
        notes: result.notes,
      },
      { status: 201 }
    );
  } catch (e) {
    // 502, not 500: the failure is nearly always the upstream model, and the
    // post row already carries the error for the studio to display.
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
