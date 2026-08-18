import { NextResponse } from "next/server";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";

/**
 * GET /api/placement/papers — staff lists all generated papers (with exam
 * names and question counts) for the review workspace.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!can(user.role, "exams.review")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("papers")
    .select(
      `
      id, title, description, status, total_marks, duration_minutes, sections,
      published_at, created_at,
      exam_definitions ( id, name ),
      paper_questions ( id )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[placement] list papers failed:", error.message);
    return NextResponse.json({ error: "Could not load papers." }, { status: 500 });
  }

  const papers = (data ?? []).map((paper) => ({
    ...paper,
    questionCount: paper.paper_questions?.length ?? 0,
    paper_questions: undefined,
  }));

  return NextResponse.json({ papers });
}