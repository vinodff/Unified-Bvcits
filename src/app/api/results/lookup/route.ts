// Public results lookup: hall ticket number + date of birth, no account needed.

import { NextRequest, NextResponse } from "next/server";

import { getAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/client";
import { lookupResults, type LookupFailure } from "@/lib/results/lookup";
import { checkRateLimit, clearFailures, clientIp, hashIp, recordFailure } from "@/lib/results/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The single message returned for every failed lookup.
 *
 * "No such hall ticket", "wrong date of birth" and "that batch is still in
 * draft" are deliberately indistinguishable. Hall tickets are sequential, so a
 * response that confirmed a number exists would turn this endpoint into a
 * roster of the college; one that separated a bad DOB from a bad hall ticket
 * would let someone brute-force dates against a hall ticket they had already
 * confirmed. The real reason is logged server-side instead.
 */
const GENERIC_FAILURE =
  "We could not find results for that hall ticket number. Check the number and try again — results appear here only once the examination branch publishes them.";

interface LookupBody {
  hallTicket?: unknown;
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: "The results portal is not configured yet." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as LookupBody;
  const hallTicket = typeof body.hallTicket === "string" ? body.hallTicket.trim() : "";

  if (!hallTicket) {
    return NextResponse.json({ error: "Enter your hall ticket number." }, { status: 400 });
  }

  const ip = clientIp(req.headers);
  /*
   * Rate-limit key: IP *and* hall ticket.
   *
   * Keying on IP alone would throttle a whole college computer lab sharing one
   * NAT address the moment a few students mistyped. Keying on hall ticket
   * alone would let one attacker spread across addresses. The pair throttles
   * "this source guessing at this student", which is the shape of the attack
   * worth stopping.
   */
  const key = `${ip}::${hallTicket.toUpperCase()}`;

  const verdict = checkRateLimit(key);
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } }
    );
  }

  const supabase = getAdminClient();

  let outcome;
  try {
    outcome = await lookupResults(supabase, hallTicket);
  } catch (error) {
    console.error("[results/lookup] failed", error);
    return NextResponse.json({ error: "Results are temporarily unavailable. Please try again shortly." }, { status: 500 });
  }

  if (outcome.ok) {
    // A student who got it right should not stay throttled by earlier typos.
    clearFailures(key);
    return NextResponse.json(outcome.data, {
      // A student's marks must never sit in a shared or browser cache.
      headers: { "Cache-Control": "no-store, private" },
    });
  }

  recordFailure(key);
  await logFailure(supabase, hallTicket, ip, outcome.reason);

  return NextResponse.json({ error: GENERIC_FAILURE }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

/**
 * Record the failure for later abuse review.
 *
 * Deliberately not awaited for correctness — a logging failure must never turn
 * a legitimate "not found" into a 500 — but it IS awaited for lifetime, because
 * a serverless function can be frozen the instant its response is returned and
 * a floating promise would simply be lost.
 */
async function logFailure(
  supabase: ReturnType<typeof getAdminClient>,
  hallTicket: string,
  ip: string,
  reason: LookupFailure
): Promise<void> {
  try {
    await supabase.from("result_lookup_attempts").insert({
      hall_ticket_no: hallTicket.toUpperCase().slice(0, 24),
      ip_hash: hashIp(ip),
      reason,
    });
  } catch (error) {
    console.error("[results/lookup] could not record attempt", error);
  }
}
