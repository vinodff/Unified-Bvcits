import { NextResponse } from "next/server";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";

/**
 * GET /api/placement/papers/[id] — staff fetches the full review bundle:
 * paper, its questions (with answers), the research artifacts and the
 * question bank for that exam.
 *
 * POST /api/placement/papers/[id] — review actions:
 *   { action: "approve" }   -> status approved, reviewed_by set
 *   { action: "publish" }   -> status published (+ exam definition published)
 *   { action: "sendBack" }  -> status review + note (revision requested)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PaperReviewRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  total_marks: number;
  duration_minutes: number;
  sections: unknown;
  published_at: string | null;
  created_at: string;
  reviewed_by: string | null;
  exam_definitions: { id: string; name: string };
}

interface PaperMembershipRow {
  id: string;
  order_no: number;
  marks: number;
  questions: {
    id: string;
    topic: string;
    subtopic: string | null;
    question_text: string;
    options: string[];
    answer: number;
    explanation: string | null;
    difficulty: string;
    source: string | null;
    source_type: string;
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!can(user.role, "exams.review")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getServiceClient();

  const { data: paper, error: paperError } = await supabase
    .from("papers")
    .select(
      `
      id, title, description, status, total_marks, duration_minutes, sections,
      published_at, created_at, reviewed_by,
      exam_definitions ( id, name )
    `
    )
    .eq("id", id)
    .returns<PaperReviewRow[]>()
    .single();
  if (paperError || !paper) {
    return NextResponse.json({ error: "Paper not found." }, { status: 404 });
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("paper_questions")
    .select(
      `
      id, order_no, marks,
      questions ( id, topic, subtopic, question_text, options, answer, explanation, difficulty, source, source_type )
    `
    )
    .eq("paper_id", id)
    .order("order_no", { ascending: true })
    .returns<PaperMembershipRow[]>();
  if (membershipError) {
    console.error("[placement] paper questions failed:", membershipError.message);
    return NextResponse.json({ error: "Could not load paper questions." }, { status: 500 });
  }

  const examId = paper.exam_definitions.id;
  const { data: research } = await supabase
    .from("exam_research")
    .select("sources, pattern, processed_dataset, reviewer_insights, blueprint")
    .eq("exam_id", examId)
    .single();

  const { data: bank, error: bankError } = await supabase
    .from("questions")
    .select("id, topic, subtopic, question_text, options, answer, explanation, difficulty, source, source_type")
    .eq("exam_id", examId)
    .order("topic", { ascending: true });

  return NextResponse.json({
    paper: {
      ...paper,
      exam: paper.exam_definitions,
      exam_definitions: undefined,
    },
    memberships: (memberships ?? []).map((m) => ({
      id: m.id,
      orderNo: m.order_no,
      marks: m.marks,
      question: m.questions,
    })),
    research: research ?? null,
    bank: bankError ? [] : (bank ?? []),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!can(user.role, "exams.review")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  let body: { action?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { id } = await params;
  const supabase = getServiceClient();
  const { data: paper } = await supabase
    .from("papers")
    .select("id, status, exam_id")
    .eq("id", id)
    .single();
  if (!paper) return NextResponse.json({ error: "Paper not found." }, { status: 404 });

  const action = body.action;

  if (action === "approve") {
    const { error } = await supabase
      .from("papers")
      .update({ status: "approved", reviewed_by: user.id })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await supabase.from("exam_definitions").update({ status: "approved" }).eq("id", paper.exam_id);
    return NextResponse.json({ ok: true, status: "approved" });
  }

  if (action === "publish") {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("papers")
      .update({ status: "published", published_at: now, reviewed_by: user.id })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await supabase.from("exam_definitions").update({ status: "published" }).eq("id", paper.exam_id);
    return NextResponse.json({ ok: true, status: "published" });
  }

  if (action === "sendBack") {
    const { error } = await supabase
      .from("papers")
      .update({ status: "review" })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await supabase.from("exam_definitions").update({ status: "review" }).eq("id", paper.exam_id);
    return NextResponse.json({ ok: true, status: "review" });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}