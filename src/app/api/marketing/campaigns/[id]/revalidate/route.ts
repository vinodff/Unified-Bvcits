// Recompute the quality score and SEO metadata for the content that already
// exists, without re-running the whole pipeline or touching campaign status.
//
// Both panels store their results, so a campaign keeps showing whatever was
// computed on the last generation — including scores produced by since-fixed
// scoring rules, and internal links chosen before /admin and /dashboard were
// excluded from the public route scan. Regenerating everything to refresh a
// stored number is wasteful and would rewrite copy a human has already read.

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/marketing/api-guard";
import { store } from "@/lib/marketing/storage";
import { runQualityCheck, verdictSummary } from "@/lib/marketing/agents/quality-agent";
import { generateSeo } from "@/lib/marketing/agents/seo-agent";
import { recordRun } from "@/lib/marketing/agents/supervisor";
import { buildCampaignDetail } from "@/lib/marketing/api-payload";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  const campaign = await store.getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const content = await store.listContentVersions(id);
  if (content.length === 0) {
    return NextResponse.json(
      { error: "There is no generated content to assess yet — run the pipeline first." },
      { status: 428 }
    );
  }

  const version = content.reduce((max, cv) => Math.max(max, cv.version), 0);
  const facts = await store.listFacts(id);

  /*
   * Retire duplicate creatives left by earlier runs.
   *
   * Before the creative agent archived its previous output, every pipeline run
   * inserted another row per platform while overwriting the same file — so a
   * campaign run three times showed fifteen cards, most pointing at a file that
   * had since been replaced. New runs no longer do this; this clears what the
   * old behaviour already left behind, keeping the newest per platform/variant.
   */
  const assets = await store.listAssets(id);
  const newestByKey = new Map<string, string>();
  for (const a of assets.filter((x) => x.aiGenerated && !x.archived)) {
    const key = `${a.metadata?.platform ?? "?"}|${a.metadata?.variant ?? "?"}|${a.metadata?.style ?? "?"}`;
    const held = newestByKey.get(key);
    const heldAt = held ? assets.find((x) => x.id === held)?.createdAt ?? "" : "";
    if (!held || a.createdAt > heldAt) newestByKey.set(key, a.id);
  }
  const keep = new Set(newestByKey.values());
  let archived = 0;
  for (const a of assets.filter((x) => x.aiGenerated && !x.archived && !keep.has(x.id))) {
    await store.saveAsset({ ...a, archived: true });
    archived++;
  }

  const score = await runQualityCheck(id, version, facts, content, store, campaign.type);
  await store.saveQuality(score);
  await recordRun(store, id, "Quality Control Agent", "success", `Re-checked: ${verdictSummary(score)}`);

  // SEO is refreshed too: its stored internal links are the other half of what
  // goes stale, and it is a single model call.
  let seoNote = "";
  try {
    const seo = await generateSeo(id, version, facts, store);
    await store.saveSeo(seo.metadata);
    seoNote = ` SEO ${seo.score}/100.`;
    await recordRun(
      store,
      id,
      "SEO Agent",
      "success",
      seo.repaired.length
        ? `Re-checked: SEO ${seo.score}/100 — model output incomplete, fell back on: ${seo.repaired.join(", ")}.`
        : `Re-checked: SEO ${seo.score}/100.`
    );
  } catch (e) {
    // A failed SEO refresh must not discard the quality score just computed.
    await recordRun(store, id, "SEO Agent", "failed", "SEO re-check failed", { error: (e as Error).message });
  }

  const detail = await buildCampaignDetail(id);
  return NextResponse.json({
    ok: true,
    message:
      `Quality ${score.overall}/100 — ${score.verdict === "pass" ? "pass" : "needs correction"}.${seoNote}` +
      (archived ? ` Cleared ${archived} duplicate creative${archived === 1 ? "" : "s"}.` : ""),
    detail,
  });
}
