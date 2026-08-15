import { NextResponse } from "next/server";
import { requireAdmin } from "./auth";

/** Returns null when the request is allowed, otherwise a 401 response. */
export async function guard(): Promise<NextResponse | null> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized — log in at /admin/marketing-studio" }, { status: 401 });
  }
  return null;
}