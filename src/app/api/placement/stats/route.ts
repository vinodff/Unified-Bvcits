import { NextResponse } from "next/server";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";

/**
 * GET /api/placement/stats?paperId=… — aggregate analytics for one paper:
 * attempt counts, score distribution, section/topic performance, time
 * analysis and violation patterns. Staff only.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AttemptRow {
  id: string;
  student_id: string;
  percent: number | null;
  score: number | null;
  time_taken_sec: number | null;
  violation_count: number;
  started_at: string;
  status: string;
  profiles: { full_name: string | null; email: string; roll_number: string | null };
}

interface StatsPaperRow {
  id: string;
  title: string;
  total_marks: number;
  sections: unknown;
  exam_definitions: { name: string };
}

interface StatsAnswerRow {
  is_correct: boolean | null;
  time_taken_sec: number | null;
  attempt_id: string;
  paper_questions: { questions: { topic: string } };
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!can(user.role, "exams.review")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const paperId = new URL(request.url).searchParams.get("paperId");
  if (!paperId) return NextResponse.json({ error: "paperId required." }, { status: 400 });

  const supabase = getServiceClient();

  const { data: paper } = await supabase
    .from("papers")
    .select("id, title, total_marks, sections, exam_definitions ( name )")
    .eq("id", paperId)
    .returns<StatsPaperRow[]>()
    .single();
  if (!paper) return NextResponse.json({ error: "Paper not found." }, { status: 404 });

  const { data: attempts } = await supabase
    .from("exam_attempts")
    .select(
      `
      id, student_id, percent, score, time_taken_sec, violation_count, started_at, status,
      profiles ( full_name, email, roll_number )
    `
    )
    .eq("paper_id", paperId)
    .in("status", ["submitted", "auto_submitted"])
    .order("percent", { ascending: false })
    .returns<AttemptRow[]>();

  const rows = attempts ?? [];

  // `!inner` makes the paper_id filter exclude non-matching rows (without it,
  // a plain embedded-resource filter narrows what's embedded but still
  // returns every attempt_answers row, which would leak other papers' answers
  // into this paper's topic stats).
  const { data: answers } = await supabase
    .from("attempt_answers")
    .select(
      `
      is_correct, time_taken_sec,
      attempt_id,
      paper_questions!inner ( questions ( topic ) )
    `
    )
    .eq("paper_questions.paper_id", paperId)
    .returns<StatsAnswerRow[]>();

  // Topic performance across all attempts.
  const topicStats = new Map<string, { total: number; correct: number; time: number[] }>();
  for (const row of answers ?? []) {
    const topic = row.paper_questions?.questions?.topic ?? "Unknown";
    const stats = topicStats.get(topic) ?? { total: 0, correct: 0, time: [] };
    stats.total += 1;
    if (row.is_correct) stats.correct += 1;
    if (row.time_taken_sec !== null) stats.time.push(row.time_taken_sec);
    topicStats.set(topic, stats);
  }

  const topics = [...topicStats.entries()].map(([topic, stats]) => ({
    topic,
    attempts: stats.total,
    correct: stats.correct,
    accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
    avgTimeSec:
      stats.time.length > 0 ? Math.round(stats.time.reduce((a, b) => a + b, 0) / stats.time.length) : null,
  }));

  // Score bands for the distribution chart.
  const bands = [
    { label: "0-25%", min: 0, max: 25, count: 0 },
    { label: "26-50%", min: 26, max: 50, count: 0 },
    { label: "51-75%", min: 51, max: 75, count: 0 },
    { label: "76-100%", min: 76, max: 100, count: 0 },
  ];
  for (const row of rows) {
    const percent = Number(row.percent ?? 0);
    const band = bands.find((b) => percent >= b.min && percent <= b.max);
    if (band) band.count += 1;
  }

  const avgPercent = rows.length > 0
    ? Math.round(rows.reduce((sum, row) => sum + Number(row.percent ?? 0), 0) / rows.length * 100) / 100
    : 0;

  // Violation histogram needs the `violations` column, which the attempts
  // query above doesn't select — re-read just that column.
  const violationTypes = new Map<string, number>();
  const { data: ledgers } = await supabase
    .from("exam_attempts")
    .select("violations")
    .eq("paper_id", paperId)
    .in("status", ["submitted", "auto_submitted"]);
  for (const ledger of ledgers ?? []) {
    for (const violation of (ledger.violations ?? []) as Array<{ type?: string }>) {
      const type = violation.type ?? "other";
      violationTypes.set(type, (violationTypes.get(type) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    paper: {
      id: paper.id,
      title: paper.title,
      examName: paper.exam_definitions.name,
      totalMarks: Number(paper.total_marks),
      sections: paper.sections,
    },
    summary: {
      totalAttempts: rows.length,
      avgPercent,
      highestPercent: rows.length > 0 ? Number(rows[0].percent) : null,
      lowestPercent: rows.length > 0 ? Number(rows[rows.length - 1].percent) : null,
      avgTimeSec:
        rows.length > 0
          ? Math.round(rows.reduce((sum, row) => sum + (row.time_taken_sec ?? 0), 0) / rows.length)
          : null,
    },
    distribution: bands,
    topics,
    violationTypes: [...violationTypes.entries()].map(([type, count]) => ({ type, count })),
    attempts: rows.map((row) => ({
      id: row.id,
      studentName: row.profiles?.full_name ?? row.profiles?.email ?? "Unknown",
      rollNumber: row.profiles?.roll_number,
      percent: Number(row.percent),
      score: Number(row.score),
      timeTakenSec: row.time_taken_sec,
      violationCount: row.violation_count,
      status: row.status,
      startedAt: row.started_at,
    })),
  });
}