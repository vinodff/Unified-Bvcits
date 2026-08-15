// AI Content Assistant (spec Section 8): the admin answers the assistant's
// questions in natural language; facts are extracted deterministically.

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/marketing/api-guard";
import { store } from "@/lib/marketing/storage";
import { newId, nowIso } from "@/lib/marketing/storage";
import { extractFactsFromMessage, mergeFacts, detectMissingFields, buildQuestions, composeInfoRequest } from "@/lib/marketing/agents/context-agent";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const campaign = await store.getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const text = body.message?.trim();
  if (!text) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const existing = await store.listFacts(id);
  await store.appendMessage({ id: newId("msg"), campaignId: id, role: "admin", text, at: nowIso() });

  const { facts } = extractFactsFromMessage(text, existing);
  const merged = mergeFacts(existing, facts);
  await store.replaceFacts(id, merged);

  const missing = detectMissingFields(merged, campaign.type);
  const questions = buildQuestions(missing);
  const reply = questions.length
    ? composeInfoRequest(missing, campaign.title)
    : `Got it — I have everything I need for "${campaign.title}". Tell me when to run the pipeline.`;

  await store.appendMessage({ id: newId("msg"), campaignId: id, role: "assistant", text: reply, at: nowIso() });

  return NextResponse.json({ reply, questions, facts: merged });
}