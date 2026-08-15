// Serve marketing media (photos + AI creatives) to the authenticated Studio.

import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/marketing/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROOT = path.join(process.cwd(), ".data", "marketing");
const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return new NextResponse("Unauthorized", { status: 401 });
  const p = req.nextUrl.searchParams.get("path") ?? "";
  const abs = path.resolve(ROOT, p);
  if (!abs.startsWith(path.resolve(ROOT))) return new NextResponse("Forbidden", { status: 403 });
  const ext = path.extname(abs).toLowerCase();
  if (!MIME[ext]) return new NextResponse("Unsupported type", { status: 415 });
  try {
    const buf = await fs.readFile(abs);
    return new NextResponse(buf, { headers: { "Content-Type": MIME[ext], "Cache-Control": "private, max-age=60" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}