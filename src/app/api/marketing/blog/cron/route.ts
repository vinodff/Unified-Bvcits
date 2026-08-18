// Daily Blog Agent job.
//
// Default behaviour is deliberately conservative: propose the day's ten ideas
// and stop. A human approving a topic is what starts an article, because an
// unattended writer publishing to a real college's public site every day with
// nobody deciding what it says is not a feature anyone asked for.
//
// Set BLOG_AUTO_WRITE=1 to also write the highest-scoring already-approved
// topic each day. Even then the quality gate still holds anything with a
// critical finding — auto-write skips the topic queue, never the gate.
//
// Wire it up in vercel.json:
//   { "crons": [{ "path": "/api/marketing/blog/cron", "schedule": "30 1 * * *" }] }
// (01:30 UTC = 07:00 IST.)

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { blogStore } from "@/lib/marketing/blog/store";
import { ensureTopicBatch, generatePost } from "@/lib/marketing/blog/pipeline";
import { requireAdmin } from "@/lib/marketing/auth";
import { istDate } from "@/lib/marketing/blog/domain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Two accepted callers: the platform scheduler holding CRON_SECRET, and a
 * signed-in admin pressing the button in the studio.
 *
 * When CRON_SECRET is unset the secret path is closed rather than open — an
 * unauthenticated endpoint that burns model quota on every request is a
 * denial-of-wallet hole, not a convenience.
 */
async function authorise(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (header === `Bearer ${secret}`) return true;
  }
  const admin = await requireAdmin();
  return admin.ok;
}

export async function GET(req: NextRequest) {
  if (!(await authorise(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const batch = istDate();
  const summary: Record<string, unknown> = { batch, at: new Date().toISOString() };

  try {
    const result = await ensureTopicBatch(blogStore, { actor: "cron", batch });
    summary.topics = { created: result.created, total: result.topics.length, reused: result.reused, notes: result.notes };
  } catch (e) {
    summary.topics = { error: (e as Error).message };
    // A failed topic batch does not stop the write step: yesterday's approved
    // topics are still valid work.
  }

  if (process.env.BLOG_AUTO_WRITE === "1") {
    const approved = (await blogStore.listTopics({ status: "approved" })).sort((a, b) => b.score - a.score);
    const next = approved[0];
    if (!next) {
      summary.article = { skipped: "no approved topic in the queue" };
    } else {
      try {
        const result = await generatePost(blogStore, next.id, { actor: "cron", autoPublish: true });
        revalidatePath("/blog");
        revalidatePath(`/blog/${result.post.slug}`);
        revalidatePath("/sitemap.xml");
        summary.article = {
          id: result.post.id,
          slug: result.post.slug,
          status: result.post.status,
          words: result.post.wordCount,
          quality: result.quality.overall,
          verdict: result.quality.verdict,
        };
      } catch (e) {
        summary.article = { error: (e as Error).message, topicId: next.id };
      }
    }
  } else {
    summary.article = { skipped: "BLOG_AUTO_WRITE is not enabled — ideas only" };
  }

  return NextResponse.json(summary);
}
