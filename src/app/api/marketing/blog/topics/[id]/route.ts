// Approve or reject one proposed blog idea.

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/marketing/api-guard";
import { blogStore } from "@/lib/marketing/blog/store";
import { decideTopic } from "@/lib/marketing/blog/pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { decision?: string; actor?: string };
  if (body.decision !== "approved" && body.decision !== "rejected") {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 400 });
  }

  try {
    const topic = await decideTopic(blogStore, id, body.decision, body.actor?.trim() || "admin");
    return NextResponse.json({ topic });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
