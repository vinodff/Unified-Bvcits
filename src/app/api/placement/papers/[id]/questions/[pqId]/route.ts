import { NextResponse } from "next/server";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { recomputeTotalMarks } from "@/lib/placement/papers";

/**
 * PATCH /api/placement/papers/[id]/questions/[pqId]
 *   { question: {...} }  -> edit the underlying question (text/options/answer/…)
 *   { orderNo }          -> renumber this membership
 *   { marks }            -> change its marks
 *
 * DELETE — remove a question from the paper (the question stays in the bank).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; pqId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!can(user.role, "exams.review")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  let body: { question?: Record<string, unknown>; orderNo?: number; marks?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { id: paperId, pqId } = await params;
  const supabase = getServiceClient();

  const { data: membership } = await supabase
    .from("paper_questions")
    .select("id, question_id")
    .eq("id", pqId)
    .eq("paper_id", paperId)
    .single();
  if (!membership) return NextResponse.json({ error: "Question not on this paper." }, { status: 404 });

  const { data: paper } = await supabase.from("papers").select("status").eq("id", paperId).single();
  if (paper?.status === "published") {
    return NextResponse.json({ error: "Published papers are locked." }, { status: 409 });
  }

  const ops: PromiseLike<{ error: { message: string } | null }>[] = [];

  if (body.question) {
    const q = body.question;
    const patch: Record<string, unknown> = {};
    if (typeof q.questionText === "string" && q.questionText.trim().length >= 5) {
      patch.question_text = q.questionText.trim();
    }
    if (Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 6) {
      const options = q.options.map((o) => String(o).trim());
      if (options.every(Boolean)) {
        patch.options = options;
        // Renumber the answer if it would fall out of range.
        if (typeof q.answer === "number" && q.answer >= 0 && q.answer < options.length) {
          patch.answer = q.answer;
        }
      }
    }
    if (typeof q.topic === "string" && q.topic.trim()) patch.topic = q.topic.trim();
    if (q.difficulty === "easy" || q.difficulty === "medium" || q.difficulty === "hard") {
      patch.difficulty = q.difficulty;
    }
    if (typeof q.explanation === "string") {
      patch.explanation = q.explanation.trim() || null;
    }
    if (Object.keys(patch).length > 0) {
      ops.push(supabase.from("questions").update(patch).eq("id", membership.question_id));
    }
  }

  if (typeof body.marks === "number" && body.marks > 0) {
    ops.push(supabase.from("paper_questions").update({ marks: body.marks }).eq("id", pqId));
  }

  if (typeof body.orderNo === "number" && body.orderNo >= 1) {
    ops.push(supabase.from("paper_questions").update({ order_no: body.orderNo }).eq("id", pqId));
  }

  const results = await Promise.all(ops);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  // Refresh total marks after any marks change.
  await recomputeTotalMarks(supabase, paperId);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; pqId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!can(user.role, "exams.review")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { id: paperId, pqId } = await params;
  const supabase = getServiceClient();

  const { data: paper } = await supabase.from("papers").select("status").eq("id", paperId).single();
  if (paper?.status === "published") {
    return NextResponse.json({ error: "Published papers are locked." }, { status: 409 });
  }

  const { error } = await supabase
    .from("paper_questions")
    .delete()
    .eq("id", pqId)
    .eq("paper_id", paperId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: rows } = await supabase
    .from("paper_questions")
    .select("id, order_no")
    .eq("paper_id", paperId)
    .order("order_no", { ascending: true });
  // Renumber so the palette stays dense after a removal.
  for (const [index, row] of (rows ?? []).entries()) {
    if (row.order_no !== index + 1) {
      await supabase.from("paper_questions").update({ order_no: index + 1 }).eq("id", row.id);
    }
  }

  await recomputeTotalMarks(supabase, paperId);

  return NextResponse.json({ ok: true });
}