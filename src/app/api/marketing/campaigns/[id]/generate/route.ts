// Run the agent pipeline for a campaign (spec Section 30).

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/marketing/api-guard";
import { store } from "@/lib/marketing/storage";
import { runCampaignPipeline } from "@/lib/marketing/pipeline";
import { buildCampaignDetail } from "@/lib/marketing/api-payload";
import { intakeState } from "@/lib/marketing/agents/intake";
import { FACT_LABELS } from "@/lib/marketing/agents/context-agent";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const campaign = await store.getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  /*
   * Completeness gate.
   *
   * The pipeline used to run the moment it was called, so a campaign with
   * nothing but a title produced eight agent runs over one fact — expensive,
   * and the "grounded" output was boilerplate because there was nothing to
   * ground it in.
   *
   * This lives on the server, not just in the wizard, because the button is not
   * the boundary: anything that can POST this route would otherwise bypass the
   * interview entirely.
   */
  const facts = await store.listFacts(id);
  const assets = await store.listAssets(id);
  const state = intakeState(facts, campaign.type, assets.length);

  if (!state.canGenerate) {
    // Two different preconditions can fail here — missing facts and the photo
    // gate. Reporting only the first produced "still missing: ." whenever the
    // block was actually the absent photograph.
    const reasons = state.missingRequired.map((f) => FACT_LABELS[f] ?? f);
    if (state.photosRequired && state.photoCount === 0) {
      reasons.push("at least one photograph of the event");
    }
    return NextResponse.json(
      {
        error: `Cannot generate yet — still missing: ${reasons.join(", ")}.`,
        missingRequired: state.missingRequired,
        photosRequired: state.photosRequired,
        photoCount: state.photoCount,
        intake: { answered: state.answered, total: state.total },
      },
      { status: 428 } // Precondition Required — the intake is the precondition.
    );
  }

  try {
    const updated = await runCampaignPipeline(store, id, { actor: "admin" });
    const detail = await buildCampaignDetail(id);
    return NextResponse.json({ campaign: updated, detail });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
