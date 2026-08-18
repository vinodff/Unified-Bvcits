// Blog topic queue: today's shortlist, plus generating a fresh one and adding
// an admin's own title.

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/marketing/api-guard";
import { blogStore } from "@/lib/marketing/blog/store";
import { createAdminTopic, ensureTopicBatch } from "@/lib/marketing/blog/pipeline";
import { istDate, isBlogCategory, BLOG_AUDIENCES, type BlogAudience } from "@/lib/marketing/blog/domain";

export const dynamic = "force-dynamic";
// sharp + the filesystem photo scan need the Node runtime, and the topic route
// shares a module graph with the pipeline that uses them.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const batch = req.nextUrl.searchParams.get("batch") ?? istDate();
  const topics = await blogStore.listTopics({ proposedOn: batch });
  const runs = await blogStore.listRuns({ topicBatch: batch }, 20);
  return NextResponse.json({ batch, topics, runs });
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as {
    action?: "generate" | "custom";
    force?: boolean;
    title?: string;
    category?: string;
    audience?: string;
    actor?: string;
  };
  const actor = body.actor?.trim() || "admin";

  // An admin-supplied title skips the shortlist entirely — it arrives already
  // approved, because typing it in *is* the approval.
  if (body.action === "custom") {
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    try {
      const topic = await createAdminTopic(blogStore, body.title, {
        by: actor,
        category: isBlogCategory(body.category) ? body.category : undefined,
        audience: BLOG_AUDIENCES.includes(body.audience as BlogAudience)
          ? (body.audience as BlogAudience)
          : undefined,
      });
      return NextResponse.json({ topic }, { status: 201 });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  try {
    const result = await ensureTopicBatch(blogStore, { actor, force: body.force === true });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
