import { NextResponse } from "next/server";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";

/**
 * GET /api/placement/attempts/[id] — the results page payload.
 * The attempt owner sees full detail; staff see it too (for the analytics
 * drill-down). Anyone else gets 403.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AttemptDetailRow {
  id: string;
  status: string;
  score: number;
  total_marks: number;
  percent: number | null;
  percentile: number | null;
  time_taken_sec: number | null;
  violation_count: number;
  violations: unknown;
  started_at: string;
  submitted_at: string | null;
  student_id: string;
  papers: {
    id: string;
    title: string;
    duration_minutes: number;
    sections: unknown;
    exam_definitions: { name: string };
  };
}

interface AnswerDetailRow {
  selected_index: number | null;
  is_correct: boolean | null;
  marks_obtained: number;
  time_taken_sec: number | null;
  marked_for_review: boolean;
  answered: boolean;
  paper_questions: {
    order_no: number;
    marks: number;
    questions: {
      topic: string;
      question_text: string;
      options: string[];
      answer: number;
      explanation: string | null;
    };
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { id } = await params;
  const supabase = getServiceClient();

  const { data: attempt } = await supabase
    .from("exam_attempts")
    .select(
      `
      id, status, score, total_marks, percent, percentile, time_taken_sec,
      violation_count, violations, started_at, submitted_at, student_id,
      papers ( id, title, duration_minutes, sections, exam_definitions ( name ) )
    `
    )
    .eq("id", id)
    .returns<AttemptDetailRow[]>()
    .single();
  if (!attempt) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });

  const isStaff = user.role === "admin" || user.role === "faculty";
  if (attempt.student_id !== user.id && !isStaff) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { data: answers } = await supabase
    .from("attempt_answers")
    .select(
      `
      selected_index, is_correct, marks_obtained, time_taken_sec, marked_for_review, answered,
      paper_questions ( id, order_no, marks, questions ( topic, question_text, options, answer, explanation ) )
    `
    )
    .eq("attempt_id", id)
    .returns<AnswerDetailRow[]>();
  // Ordering by an embedded relation isn't a valid PostgREST sort — sort in JS instead.
  const sortedAnswers = [...(answers ?? [])].sort(
    (a, b) => a.paper_questions.order_no - b.paper_questions.order_no
  );

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      status: attempt.status,
      score: Number(attempt.score),
      totalMarks: Number(attempt.total_marks),
      percent: Number(attempt.percent),
      percentile: attempt.percentile === null ? null : Number(attempt.percentile),
      timeTakenSec: attempt.time_taken_sec,
      violationCount: attempt.violation_count,
      violations: attempt.violations ?? [],
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
      paper: {
        id: attempt.papers.id,
        title: attempt.papers.title,
        examName: attempt.papers.exam_definitions.name,
        durationMinutes: attempt.papers.duration_minutes,
        sections: attempt.papers.sections,
      },
    },
    answers: sortedAnswers.map((row) => ({
      selectedIndex: row.selected_index,
      isCorrect: row.is_correct,
      marksObtained: Number(row.marks_obtained),
      timeTakenSec: row.time_taken_sec,
      markedForReview: row.marked_for_review,
      answered: row.answered,
      orderNo: row.paper_questions.order_no,
      marks: Number(row.paper_questions.marks),
      topic: row.paper_questions.questions.topic,
      questionText: row.paper_questions.questions.question_text,
      options: row.paper_questions.questions.options,
      correctAnswer: row.paper_questions.questions.answer,
      explanation: row.paper_questions.questions.explanation,
    })),
  });
}