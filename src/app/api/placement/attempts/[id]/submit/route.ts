import { NextResponse } from "next/server";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { scoreAttempt, computePercentile, type ScoredAnswer } from "@/lib/placement/scoring";

/**
 * POST /api/placement/attempts/[id]/submit — the ONLY place a submission is
 * scored. The client sends what the student selected; the server re-reads the
 * answer key, scores, computes the percentile against every other attempt on
 * this paper, and persists everything. A tampered client cannot inflate its
 * score because the score is never accepted from it.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PaperQuestionKeyRow {
  id: string;
  marks: number;
  questions: { answer: number; topic: string };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body: {
    answers?: Array<{
      paperQuestionId: string;
      selectedIndex: number | null;
      markedForReview?: boolean;
      timeTakenSec?: number | null;
    }>;
    violations?: Array<{ type: string; detail: string; occurredAt: string }>;
    autoSubmitted?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { id } = await params;
  const supabase = getServiceClient();

  const { data: attempt } = await supabase
    .from("exam_attempts")
    .select("id, student_id, paper_id, status, started_at, violations")
    .eq("id", id)
    .single();
  if (!attempt) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  if (attempt.student_id !== user.id) {
    return NextResponse.json({ error: "This attempt is not yours." }, { status: 403 });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "This attempt is already submitted." }, { status: 409 });
  }

  const { data: paper } = await supabase
    .from("papers")
    .select("id, total_marks, sections, exam_id")
    .eq("id", attempt.paper_id)
    .single();
  if (!paper) return NextResponse.json({ error: "Paper not found." }, { status: 404 });

  // Answer key + marks — read server-side, never echoed to the client.
  const { data: memberships } = await supabase
    .from("paper_questions")
    .select("id, marks, questions ( answer, topic )")
    .eq("paper_id", paper.id)
    .returns<PaperQuestionKeyRow[]>();

  const key = new Map<string, { answer: number; marks: number; topic: string }>();
  for (const membership of memberships ?? []) {
    key.set(membership.id, {
      answer: membership.questions.answer,
      marks: Number(membership.marks),
      topic: membership.questions.topic,
    });
  }

  const submittedAt = new Date().toISOString();
  const result = scoreAttempt(
    [...key.entries()].map(([paperQuestionId, info]) => ({
      paperQuestionId,
      answer: info.answer,
      marks: info.marks,
    })),
    (body.answers ?? []).map((a) => ({
      paperQuestionId: a.paperQuestionId,
      selectedIndex: typeof a.selectedIndex === "number" ? a.selectedIndex : null,
      markedForReview: Boolean(a.markedForReview),
      timeTakenSec: typeof a.timeTakenSec === "number" ? a.timeTakenSec : null,
    })),
    0, // negative marking computed from the pattern when present
    attempt.started_at,
    submittedAt
  );

  // Percentile across every SUBMITTED attempt on this paper (including this one).
  const { data: allAttempts } = await supabase
    .from("exam_attempts")
    .select("percent")
    .eq("paper_id", paper.id)
    .in("status", ["submitted", "auto_submitted"]);
  const percentile = computePercentile(
    result.percent,
    (allAttempts ?? []).map((a) => Number(a.percent))
  );

  // Merge client violations with anything already recorded server-side.
  const clientViolations = (body.violations ?? [])
    .filter((v) => v.type && typeof v.detail === "string")
    .map((v) => ({ type: v.type, detail: v.detail, occurredAt: v.occurredAt ?? submittedAt }));
  const existing = (attempt.violations ?? []) as Array<{ type: string; detail: string; occurredAt: string }>;
  const violations = [...existing, ...clientViolations];

  const status = body.autoSubmitted ? "auto_submitted" : "submitted";

  const { error: updateError } = await supabase
    .from("exam_attempts")
    .update({
      status,
      submitted_at: submittedAt,
      score: result.score,
      total_marks: result.totalMarks,
      percent: result.percent,
      percentile,
      time_taken_sec: result.timeTakenSec,
      violation_count: violations.length,
      violations,
    })
    .eq("id", id);
  if (updateError) {
    console.error("[placement] submit update failed:", updateError.message);
    return NextResponse.json({ error: "Could not record the submission." }, { status: 500 });
  }

  // Persist each answer (insert — the unique constraint makes retries safe).
  const answerRows: ScoredAnswer[] = result.answers.map((a) => ({
    paperQuestionId: a.paperQuestionId,
    selectedIndex: a.selectedIndex,
    isCorrect: a.isCorrect,
    marksObtained: a.marksObtained,
    timeTakenSec: a.timeTakenSec,
    markedForReview: a.markedForReview,
    answered: a.answered,
  }));
  for (const row of answerRows) {
    await supabase.from("attempt_answers").insert({
      attempt_id: id,
      paper_question_id: row.paperQuestionId,
      selected_index: row.selectedIndex,
      is_correct: row.isCorrect,
      marks_obtained: row.marksObtained,
      time_taken_sec: row.timeTakenSec,
      marked_for_review: row.markedForReview,
      answered: row.answered,
    });
  }

  return NextResponse.json({
    ok: true,
    result: {
      attemptId: id,
      score: result.score,
      totalMarks: result.totalMarks,
      percent: result.percent,
      percentile,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
      attemptedCount: result.attemptedCount,
      unansweredCount: result.unansweredCount,
      timeTakenSec: result.timeTakenSec,
    },
  });
}