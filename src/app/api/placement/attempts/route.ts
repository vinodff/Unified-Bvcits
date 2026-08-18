import { NextResponse } from "next/server";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttemptQuestion } from "@/lib/placement/types";

/**
 * POST /api/placement/attempts — student starts an attempt on a published
 * paper. Returns the questions WITHOUT answers (the security boundary: the
 * answer column never leaves this route) plus the attempt deadline.
 *
 * GET — student's own attempt history (dashboard).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AttemptQuestionRow {
  id: string;
  order_no: number;
  marks: number;
  questions: { id: string; topic: string; question_text: string; options: string[]; difficulty: string };
}

/** The sanitised (answer-free) question list for one paper, in display order. */
async function loadAttemptQuestions(supabase: SupabaseClient, paperId: string): Promise<AttemptQuestion[]> {
  const { data: questions } = await supabase
    .from("paper_questions")
    .select(
      `
      id, order_no, marks,
      questions ( id, topic, question_text, options, difficulty )
    `
    )
    .eq("paper_id", paperId)
    .order("order_no", { ascending: true })
    .returns<AttemptQuestionRow[]>();

  return (questions ?? []).map((membership) => ({
    paperQuestionId: membership.id,
    orderNo: membership.order_no,
    marks: membership.marks,
    topic: membership.questions.topic,
    questionText: membership.questions.question_text,
    options: membership.questions.options,
    difficulty: membership.questions.difficulty as AttemptQuestion["difficulty"],
  }));
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (user.role !== "student" && user.role !== "admin" && user.role !== "faculty") {
    return NextResponse.json({ error: "Only students can attempt exams." }, { status: 403 });
  }

  let body: { paperId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.paperId) return NextResponse.json({ error: "paperId required." }, { status: 400 });

  const supabase = getServiceClient();

  const { data: paper } = await supabase
    .from("papers")
    .select("id, status, duration_minutes, title, total_marks, sections")
    .eq("id", body.paperId)
    .single();
  if (!paper) return NextResponse.json({ error: "Paper not found." }, { status: 404 });
  if (paper.status !== "published") {
    return NextResponse.json({ error: "This paper is not published yet." }, { status: 409 });
  }

  // A student may only have ONE live attempt per paper — resits start after
  // the previous attempt is submitted.
  const { data: live } = await supabase
    .from("exam_attempts")
    .select("id, started_at, status")
    .eq("paper_id", paper.id)
    .eq("student_id", user.id)
    .eq("status", "in_progress")
    .maybeSingle();

  // The client needs this to render an honest invigilation watermark — never
  // trust a client-supplied name, always send the session's own identity.
  const student = { name: user.fullName ?? user.email, rollNumber: user.rollNumber };

  if (live) {
    const deadline = new Date(new Date(live.started_at).getTime() + paper.duration_minutes * 60_000);
    const attemptQuestions = await loadAttemptQuestions(supabase, paper.id);

    return NextResponse.json({
      attempt: { id: live.id, status: live.status },
      paper: { id: paper.id, title: paper.title, durationMinutes: paper.duration_minutes, totalMarks: Number(paper.total_marks) },
      deadline: deadline.toISOString(),
      questions: attemptQuestions,
      student,
    });
  }

  // Fresh attempt.
  const { data: attempt, error: attemptError } = await supabase
    .from("exam_attempts")
    .insert({ paper_id: paper.id, student_id: user.id, status: "in_progress" })
    .select("id, started_at, status")
    .single();
  if (attemptError) {
    console.error("[placement] create attempt failed:", attemptError.message);
    return NextResponse.json({ error: "Could not start the attempt." }, { status: 500 });
  }

  const attemptQuestions = await loadAttemptQuestions(supabase, paper.id);

  const deadline = new Date(new Date(attempt.started_at).getTime() + paper.duration_minutes * 60_000);

  return NextResponse.json({
    attempt: { id: attempt.id, status: attempt.status },
    paper: { id: paper.id, title: paper.title, durationMinutes: paper.duration_minutes, totalMarks: Number(paper.total_marks) },
    deadline: deadline.toISOString(),
    questions: attemptQuestions,
    student,
  });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("exam_attempts")
    .select(
      `
      id, status, score, total_marks, percent, percentile, time_taken_sec,
      violation_count, started_at, submitted_at,
      papers ( id, title, exam_definitions ( name ) )
    `
    )
    .eq("student_id", user.id)
    .order("started_at", { ascending: false });

  if (error) {
    console.error("[placement] attempt history failed:", error.message);
    return NextResponse.json({ error: "Could not load your attempts." }, { status: 500 });
  }

  return NextResponse.json({ attempts: data ?? [] });
}