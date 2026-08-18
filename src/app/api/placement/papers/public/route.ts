import { NextResponse } from "next/server";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";

/**
 * GET /api/placement/papers/public — any signed-in user lists published
 * papers they can attempt, with question counts and marks.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("papers")
    .select(
      `
      id, title, description, duration_minutes, total_marks, sections, published_at,
      exam_definitions ( id, name ),
      paper_questions ( id )
    `
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error) {
    console.error("[placement] public papers failed:", error.message);
    return NextResponse.json({ error: "Could not load papers." }, { status: 500 });
  }

  const papers = (data ?? []).map((paper) => ({
    ...paper,
    questionCount: paper.paper_questions?.length ?? 0,
    paper_questions: undefined,
  }));

  return NextResponse.json({ papers });
}