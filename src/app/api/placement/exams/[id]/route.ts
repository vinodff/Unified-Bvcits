import { NextResponse } from "next/server";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { runPipeline } from "@/lib/placement/pipeline";

/**
 * POST /api/placement/exams/[id] — admin triggers the five-agent pipeline for
 * an exam. The request returns immediately; the pipeline keeps running
 * server-side and the admin console polls GET on this same route for progress.
 *
 * GET /api/placement/exams/[id] — staff polls pipeline progress (exam status
 * + per-step ledger).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!can(user.role, "exams.create")) {
    return NextResponse.json({ error: "Only admins can run the pipeline." }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getServiceClient();
  const { data: exam } = await supabase
    .from("exam_definitions")
    .select("id, name, status")
    .eq("id", id)
    .single();

  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });

  // Only a fresh exam or one whose last run failed can (re)start the pipeline.
  // Every other status means it's already running or already produced a paper.
  const startable = ["draft", "failed"];
  if (!startable.includes(exam.status)) {
    return NextResponse.json(
      { error: `Pipeline already running or completed (status: ${exam.status}).` },
      { status: 409 }
    );
  }

  // Fire the pipeline without awaiting: it can run longer than the client
  // wants to wait, and the console polls status.
  void runPipeline(supabase, { examId: exam.id, examName: exam.name, adminUserId: user.id });

  return NextResponse.json({ ok: true, status: "researching" });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!can(user.role, "exams.review")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getServiceClient();
  const { data: exam } = await supabase
    .from("exam_definitions")
    .select("id, name, status, error_message")
    .eq("id", id)
    .single();
  if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });

  const { data: steps } = await supabase
    .from("exam_pipeline_steps")
    .select("step, status, message, started_at, finished_at")
    .eq("exam_id", id)
    .order("step", { ascending: true });

  return NextResponse.json({ exam, steps });
}