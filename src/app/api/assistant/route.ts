import { NextRequest, NextResponse } from "next/server";
import { processQuery } from "@/lib/campus-agent/engine";
import { buildFactSheet, extractNumbers } from "@/lib/campus-agent/facts";
import { resolveDepartment } from "@/lib/campus-agent/catalog";
import { tokenize } from "@/lib/campus-agent/normalize";
import { EMPTY_CONTEXT, type ConversationContext } from "@/lib/campus-agent/types";
import { generateNaturalReply, isGeminiConfigured, type GeminiTurn } from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Long enough for any real question; short enough to bound prompt cost and abuse. */
const MAX_QUERY_LENGTH = 400;
/** Turns of context sent to the model. Older turns add latency without adding much. */
const MAX_HISTORY_TURNS = 6;

// Fixed-window limiter. Per-instance and in-memory, which is the right size for this
// deployment — it stops a single tab hammering the paid API. A multi-instance deployment
// would need a shared store (Redis/Upstash) for this to hold globally.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 25;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(clientKey: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(clientKey);

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(clientKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    // Opportunistic sweep so the map cannot grow without bound.
    if (rateBuckets.size > 5000) {
      for (const [key, value] of rateBuckets) {
        if (now > value.resetAt) rateBuckets.delete(key);
      }
    }
    return false;
  }

  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

function clientKeyFor(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

interface AssistantRequestBody {
  query?: unknown;
  language?: unknown;
  context?: unknown;
  history?: unknown;
}

function parseContext(value: unknown): ConversationContext {
  if (!value || typeof value !== "object") return EMPTY_CONTEXT;
  const raw = value as Record<string, unknown>;
  return {
    lastTopic: typeof raw.lastTopic === "string" ? (raw.lastTopic as never) : undefined,
    lastDeptKey: typeof raw.lastDeptKey === "string" ? raw.lastDeptKey : undefined,
    turnCount: typeof raw.turnCount === "number" && raw.turnCount >= 0 ? raw.turnCount : 0,
  };
}

function parseHistory(value: unknown): GeminiTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { role: string; text: string } =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { text?: unknown }).text === "string" &&
        typeof (item as { role?: unknown }).role === "string",
    )
    .map((item) => ({
      role: item.role === "model" ? ("model" as const) : ("user" as const),
      text: item.text.slice(0, MAX_QUERY_LENGTH),
    }))
    .slice(-MAX_HISTORY_TURNS);
}

/** Strips markdown so the model sees prose, not formatting. */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rejects a reply that states a number we never supplied.
 *
 * Catches the failure that matters most — an invented fee, phone number or seat count.
 * It cannot catch a number written as words ("ముప్పై ఐదు వేలు"), which is exactly how the
 * model is asked to write them for speech, so this is a backstop rather than a proof.
 * The authoritative figure always remains visible in the deterministic card on screen.
 */
function hasOnlyGroundedNumbers(candidate: string, facts: string, question: string): boolean {
  const allowed = extractNumbers(`${facts}\n${question}`);
  for (const number of extractNumbers(candidate)) {
    // Small integers are ordinary speech ("2 years", "1 more"), not factual claims.
    if (number.length <= 2) continue;
    if (!allowed.has(number)) return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  if (isRateLimited(clientKeyFor(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: AssistantRequestBody;
  try {
    body = (await req.json()) as AssistantRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "query is too long" }, { status: 400 });
  }

  const language = body.language === "en" ? "en" : "te";
  const context = parseContext(body.context);
  const history = parseHistory(body.history);

  // Retrieval always runs first: it produces the facts, the links and the cards, and it
  // is what the response falls back to whenever the model cannot be used.
  const { reply, context: nextContext } = processQuery(query, context);
  const dept = resolveDepartment(tokenize(query));
  const facts = buildFactSheet(reply.topic, dept);

  const groundedTelugu = reply.spokenTelugu;
  const groundedEnglish = reply.spokenEnglish;

  let naturalText = "";
  let source: "gemini" | "grounded" = "grounded";
  let rejection: string | undefined;
  let model: string | undefined;

  if (isGeminiConfigured()) {
    const result = await generateNaturalReply({
      question: query,
      facts,
      groundedAnswer: toPlainText(language === "te" ? reply.replyTelugu : reply.replyEnglish),
      language,
      history,
    });
    model = result.model;

    if (result.text && hasOnlyGroundedNumbers(result.text, facts, query)) {
      naturalText = result.text;
      source = "gemini";
    } else {
      // A reply that states a number we never supplied is discarded outright — the
      // templated answer is worth more than fluent phrasing with an invented figure.
      rejection = result.rejection ?? "ungrounded-number";
      if (rejection === "ungrounded-number") {
        console.warn(`[assistant] discarded ${model ?? "model"} reply: ungrounded number`);
      }
    }
  }

  const spokenTelugu = source === "gemini" && language === "te" ? naturalText : groundedTelugu;
  const spokenEnglish = source === "gemini" && language === "en" ? naturalText : groundedEnglish;

  return NextResponse.json({
    topic: reply.topic,
    // Natural prose replaces the templated lead line, while the deterministic detail
    // block below it keeps the exact figures and the real links.
    replyTelugu: source === "gemini" && language === "te" ? naturalText : reply.replyTelugu,
    replyEnglish: source === "gemini" && language === "en" ? naturalText : reply.replyEnglish,
    detailTelugu: source === "gemini" ? reply.replyTelugu : undefined,
    detailEnglish: source === "gemini" ? reply.replyEnglish : undefined,
    spokenTelugu,
    spokenEnglish,
    actionCards: reply.actionCards,
    quickReplies: reply.quickReplies,
    isFallback: reply.isFallback,
    context: nextContext,
    source,
    // Diagnostics only — never rendered to the visitor.
    rejection,
    model,
  });
}
