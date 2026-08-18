import { NextResponse } from "next/server";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { recomputeTotalMarks } from "@/lib/placement/papers";

/**
 * POST /api/placement/papers/[id]/questions
 *   { questionId }  -> add an existing bank question to the paper
 *   { draft }       -> create a new question and add it
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!can(user.role, "exams.review")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  let body: { questionId?: string; draft?: unknown; marks?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { id: paperId } = await params;
  const supabase = getServiceClient();

  const { data: paper } = await supabase
    .from("papers")
    .select("id, status")
    .eq("id", paperId)
    .single();
  if (!paper) return NextResponse.json({ error: "Paper not found." }, { status: 404 });
  if (paper.status === "published") {
    return NextResponse.json({ error: "Published papers are locked." }, { status: 409 });
  }

  let questionId: string;
  if (body.questionId) {
    questionId = body.questionId;
  } else if (body.draft) {
    const draft = body.draft as {
      questionText?: string;
      options?: string[];
      answer?: number;
      topic?: string;
      difficulty?: string;
      explanation?: string;
      examId?: string;
    };
    const questionText = (draft.questionText ?? "").trim();
    const options = (draft.options ?? []).map((o) => o.trim());
    const answer = draft.answer;
    const topic = (draft.topic ?? "General").trim();
    const difficulty = draft.difficulty === "easy" || draft.difficulty === "hard" ? draft.difficulty : "medium";

    if (questionText.length < 5 || options.length < 2 || options.length > 6 || typeof answer !== "number" || answer < 0 || answer >= options.length || !draft.examId) {
      return NextResponse.json({ error: "Invalid question draft." }, { status: 400 });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("questions")
      .insert({
        exam_id: draft.examId,
        topic,
        question_text: questionText,
        options,
        answer,
        explanation: (draft.explanation ?? "").trim() || null,
        difficulty,
        source: `Added by ${user.fullName ?? user.email} during review`,
        source_type: "faculty",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    questionId = inserted.id;
  } else {
    return NextResponse.json({ error: "Provide questionId or draft." }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("paper_questions")
    .select("id")
    .eq("paper_id", paperId)
    .eq("question_id", questionId)
    .maybeSingle();
  if (membership) {
    return NextResponse.json({ error: "That question is already on the paper." }, { status: 409 });
  }

  const { data: maxOrder } = await supabase
    .from("paper_questions")
    .select("order_no")
    .eq("paper_id", paperId)
    .order("order_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: inserted, error } = await supabase
    .from("paper_questions")
    .insert({
      paper_id: paperId,
      question_id: questionId,
      order_no: (maxOrder?.order_no ?? 0) + 1,
      marks: typeof body.marks === "number" && body.marks > 0 ? body.marks : 1,
    })
    .select("id, order_no, marks")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep total marks honest after edits.
  await recomputeTotalMarks(supabase, paperId);

  return NextResponse.json({ membership: inserted }, { status: 201 });
}