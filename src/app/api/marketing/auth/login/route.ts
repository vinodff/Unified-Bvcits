import { NextRequest, NextResponse } from "next/server";
import { login, logout, requireAdmin, isDevMode } from "@/lib/marketing/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { pin?: string };
    if (!body.pin) return NextResponse.json({ error: "PIN required" }, { status: 400 });
    const result = await login(body.pin);
    if (!result.ok) return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    return NextResponse.json({ ok: true, dev: result.dev });
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

export async function GET() {
  const auth = await requireAdmin();
  return NextResponse.json({ ok: auth.ok, dev: isDevMode() });
}