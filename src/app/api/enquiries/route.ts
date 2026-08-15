import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Salted so the stored hash cannot be reversed by hashing every IPv4 address —
 * an unsalted SHA-256 of an IP is effectively plaintext given a 2^32 keyspace.
 * Falls back to a per-boot value, which still prevents cross-deploy correlation.
 */
const IP_SALT = process.env.ENQUIRY_IP_SALT ?? `boot-${process.pid}`;

function hashIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  if (!ip) return null;
  return createHash("sha256").update(`${IP_SALT}:${ip}`).digest("hex");
}

interface EnquiryPayload {
  fullName?: unknown;
  mobile?: unknown;
  email?: unknown;
  program?: unknown;
  message?: unknown;
  sourcePath?: unknown;
}

/** Trims and length-caps a field; returns null for anything that isn't usable text. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    // Without a database there is nowhere to put this, and telling the visitor
    // "thank you" would be a lie.
    return NextResponse.json(
      { ok: false, error: "Enquiries are not accepting submissions right now." },
      { status: 503 }
    );
  }

  let payload: EnquiryPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const fullName = text(payload.fullName, 120);
  const mobile = text(payload.mobile, 20);

  if (!fullName || fullName.length < 2) {
    return NextResponse.json({ ok: false, error: "Please enter your full name." }, { status: 400 });
  }
  if (!mobile || !/^[0-9+][0-9 +()-]{6,19}$/.test(mobile)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid mobile number." }, { status: 400 });
  }

  // The RPC re-validates and applies the per-IP rate limit. This route's checks
  // exist to return a friendly message before a round trip, not to be the only
  // line of defence.
  const { data, error } = await getAdminClient().rpc("submit_admission_enquiry", {
    p_full_name: fullName,
    p_mobile: mobile,
    p_email: text(payload.email, 200),
    p_program: text(payload.program, 120),
    p_message: text(payload.message, 2000),
    p_source_path: text(payload.sourcePath, 200),
    p_ip_hash: hashIp(request),
    p_user_agent: text(request.headers.get("user-agent"), 400),
  });

  if (error) {
    // 53400 is the rate-limit signal raised inside the function.
    const rateLimited = error.code === "53400" || error.message.includes("Too many enquiries");
    if (rateLimited) {
      return NextResponse.json(
        { ok: false, error: "Too many enquiries from this connection. Please try again later." },
        { status: 429 }
      );
    }

    console.error("[enquiries] submit failed:", error.message);
    return NextResponse.json(
      { ok: false, error: "We could not save your enquiry. Please call +91 99854 22678." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: data }, { status: 201 });
}
