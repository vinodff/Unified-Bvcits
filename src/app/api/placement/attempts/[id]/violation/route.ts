import { NextResponse } from "next/server";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";

/**
 * POST /api/placement/attempts/[id]/violation — the exam client reports a
 * proctoring event (tab switch, fullscreen exit, copy attempt, webcam
 * absence…). Server-side only: the client cannot lower the count or rewrite
 * the ledger, it can only append. Ownership is enforced here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body: { type?: string; detail?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const type = (body.type ?? "").trim();
  const detail = (body.detail ?? "").trim().slice(0, 300);
  if (!type) return NextResponse.json({ error: "type required." }, { status: 400 });

  const { id } = await params;
  const supabase = getServiceClient();

  const { data: attempt } = await supabase
    .from("exam_attempts")
    .select("id, student_id, status, violations, violation_count")
    .eq("id", id)
    .single();
  if (!attempt) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  if (attempt.student_id !== user.id) {
    return NextResponse.json({ error: "This attempt is not yours." }, { status: 403 });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "Attempt already submitted." }, { status: 409 });
  }

  const entry = { type, detail: detail || type, occurredAt: new Date().toISOString() };
  const violations = [...(attempt.violations ?? []), entry];

  // Cap the ledger: hundreds of tab-switch events add noise, not signal.
  const capped = violations.slice(-100);

  const { error } = await supabase
    .from("exam_attempts")
    .update({ violations: capped, violation_count: capped.length })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, violationCount: capped.length });
}