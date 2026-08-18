// Guided intake — one question at a time, with an explicit skip.
//
// GET  → where the interview is: current question, progress, whether the
//        pipeline may run yet, and the full summary for the verify screen.
// POST → record one answer (or a skip) and return the next question.
//
// Answers are written straight to the fact store as source "admin", which is
// authoritative and outranks anything an agent later infers. That is the whole
// point of asking: the interview is the grounding layer.

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/marketing/api-guard";
import { store, newId, nowIso } from "@/lib/marketing/storage";
import type { CampaignFact } from "@/lib/marketing/domain";
import {
  INTAKE_BRIEF_KEY,
  SKIPPED_FIELDS_KEY,
  intakeState,
  intakeSummary,
  skippedFields,
} from "@/lib/marketing/agents/intake";
import { extractFactsFromMessage, mergeFacts, FACT_LABELS } from "@/lib/marketing/agents/context-agent";

export const dynamic = "force-dynamic";

/** Fields captured as comma-separated lists rather than a single value. */
const LIST_FIELDS = new Set(["guests", "organizers", "departments", "prizes"]);

/** Longest answer worth storing — guards against a pasted image or document. */
const MAX_ANSWER_LENGTH = 4000;

/**
 * Reject an answer that cannot be what the field asked for.
 *
 * A live campaign ended up with a `data:image/jpeg;base64,…` blob stored as its
 * website link, because the field accepted any string. It reached the fact base,
 * the fact-checker flagged it, and it would have been published as the article's
 * "Visit our website" href.
 */
function validateAnswer(field: string, value: string): string | null {
  if (value.length > MAX_ANSWER_LENGTH) {
    return `That answer is too long (${value.length} characters). Paste a summary rather than a whole document or image.`;
  }
  if (/^data:/i.test(value)) {
    return "That looks like an embedded file rather than text. Use the photo upload step for images.";
  }
  if (field === "websiteUrl") {
    if (!/^https?:\/\/\S+$/i.test(value)) {
      return "Enter a full web address starting with http:// or https://.";
    }
  }
  if (field === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "Enter the date as YYYY-MM-DD.";
  }
  return null;
}

async function payload(id: string) {
  const campaign = await store.getCampaign(id);
  if (!campaign) return null;

  const facts = await store.listFacts(id);
  const assets = await store.listAssets(id);
  const state = intakeState(facts, campaign.type, assets.length);

  return {
    campaign: { id: campaign.id, title: campaign.title, type: campaign.type, status: campaign.status },
    phase: state.phase,
    step: state.step,
    answered: state.answered,
    total: state.total,
    missingRequired: state.missingRequired,
    photosRequired: state.photosRequired,
    photoCount: state.photoCount,
    canGenerate: state.canGenerate,
    // Present from the start so the UI can show a running summary beside the
    // question rather than only at the end.
    summary: intakeSummary(facts, campaign.type, assets.length),
    assetCount: assets.length,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  const data = await payload(id);
  if (!data) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  const campaign = await store.getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    field?: string;
    value?: string;
    skip?: boolean;
    brief?: string;
  };

  /*
   * Opening brief.
   *
   * The admin describes the event in their own words and extraction fills in
   * everything it recognises, so the wizard only has to ask about the rest.
   * This is why the interview no longer feels like a 12-field form: a single
   * paragraph typically answers half of it.
   *
   * The raw text is stored verbatim alongside the derived facts — the facts are
   * what the agents read, the brief is what a reviewer can check them against.
   */
  if (typeof body.brief === "string") {
    const brief = body.brief.trim();
    if (!brief) return NextResponse.json({ error: "brief cannot be empty" }, { status: 400 });
    if (brief.length > 20000) {
      return NextResponse.json({ error: "That description is too long — summarise it in a few paragraphs." }, { status: 400 });
    }
    if (/^data:/i.test(brief)) {
      return NextResponse.json({ error: "That looks like a pasted file. Describe the event in words; photos go in the upload step." }, { status: 400 });
    }

    const existing = await store.listFacts(id);
    const { facts: extracted, answeredFields } = extractFactsFromMessage(brief, existing);
    // The brief goes through mergeFacts rather than being appended after it, so
    // re-submitting a brief overwrites the old one instead of writing a second
    // row for the same field.
    const merged = mergeFacts(existing, [
      ...extracted,
      { field: INTAKE_BRIEF_KEY, value: brief, source: "admin", confidence: 1, verified: true },
    ]);
    await store.replaceFacts(id, merged);

    // Keep the campaign record's title in step with an extracted one, the same
    // way the per-field branch below does.
    const extractedTitle = extracted.find((f) => f.field === "title")?.value;
    if (typeof extractedTitle === "string" && extractedTitle.trim() && extractedTitle !== campaign.title) {
      await store.saveCampaign({ ...campaign, title: extractedTitle.trim(), updatedAt: nowIso() });
    }

    await store.appendMessage({ id: newId("msg"), campaignId: id, role: "admin", text: brief, at: nowIso() });

    const understood = answeredFields.map((f) => FACT_LABELS[f] ?? f);
    await store.appendMessage({
      id: newId("msg"),
      campaignId: id,
      role: "assistant",
      text: understood.length
        ? `Got it — I picked up the ${understood.join(", ")}. Let me fill in the rest.`
        : "Thanks. I couldn't pull structured details out of that, so I'll ask directly.",
      at: nowIso(),
    });

    const data = await payload(id);
    return NextResponse.json({ ...data, extracted: answeredFields, understood });
  }

  const field = body.field?.trim();
  if (!field) return NextResponse.json({ error: "field is required" }, { status: 400 });

  const facts = await store.listFacts(id);

  if (body.skip) {
    const already = skippedFields(facts);
    if (!already.includes(field)) {
      await store.setFact(id, {
        field: SKIPPED_FIELDS_KEY,
        value: [...already, field],
        source: "admin",
        confidence: 1,
        verified: true,
      });
    }
    await store.appendMessage({
      id: newId("msg"),
      campaignId: id,
      role: "admin",
      text: `(skipped ${field})`,
      at: nowIso(),
    });

    const data = await payload(id);
    return NextResponse.json(data);
  }

  const raw = (body.value ?? "").trim();
  if (!raw) return NextResponse.json({ error: "value is required unless skipping" }, { status: 400 });

  const invalid = validateAnswer(field, raw);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const value: CampaignFact["value"] = LIST_FIELDS.has(field)
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : raw;

  await store.setFact(id, {
    field,
    value,
    // Admin input is authoritative — never overwritten by an agent observation.
    source: "admin",
    confidence: 1,
    verified: true,
  });

  // Answering a field un-skips it, so an admin can go back and fill something in.
  const skipped = skippedFields(facts);
  if (skipped.includes(field)) {
    await store.setFact(id, {
      field: SKIPPED_FIELDS_KEY,
      value: skipped.filter((f) => f !== field),
      source: "admin",
      confidence: 1,
      verified: true,
    });
  }

  // The title is also the campaign's own name — keep them in step rather than
  // letting the record disagree with the fact the agents read.
  if (field === "title" && raw !== campaign.title) {
    await store.saveCampaign({ ...campaign, title: raw, updatedAt: nowIso() });
  }

  await store.appendMessage({
    id: newId("msg"),
    campaignId: id,
    role: "admin",
    text: `${field}: ${Array.isArray(value) ? value.join(", ") : value}`,
    at: nowIso(),
  });

  const data = await payload(id);
  return NextResponse.json(data);
}
