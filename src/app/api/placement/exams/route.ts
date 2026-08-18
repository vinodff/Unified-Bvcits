import { NextResponse } from "next/server";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";

/**
 * POST /api/placement/exams — admin creates an exam request (the pipeline
 * input). GET — staff lists exams with their research snapshot for the
 * admin console and review workspace.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!can(user.role, "exams.create")) {
    return NextResponse.json({ error: "Only admins can create exams." }, { status: 403 });
  }

  let body: { name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const description = (body.description ?? "").trim();
  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: "Exam name must be 2-120 characters." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("exam_definitions")
    .insert({ name, description: description || null, status: "draft", created_by: user.id })
    .select()
    .single();

  if (error) {
    console.error("[placement] create exam failed:", error.message);
    return NextResponse.json({ error: "Could not create the exam." }, { status: 500 });
  }

  return NextResponse.json({ exam: data }, { status: 201 });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!can(user.role, "exams.review")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const supabase = getServiceClient();
  const { data: exams, error } = await supabase
    .from("exam_definitions")
    .select("*, exam_research(sources, pattern, processed_dataset, reviewer_insights, blueprint)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[placement] list exams failed:", error.message);
    return NextResponse.json({ error: "Could not load exams." }, { status: 500 });
  }

  return NextResponse.json({ exams });
}