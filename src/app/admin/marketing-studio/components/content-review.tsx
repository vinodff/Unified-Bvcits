"use client";

// Content review — the screen where a human decides whether this ships.
//
// It shows each platform version inside that platform's real chrome, because
// the decision being made is "would I be happy seeing this on our page?" and
// that is not answerable from a monospace block of markdown. The raw text is
// still one click away for anyone who wants to check the exact characters.

import { useMemo, useState } from "react";
import { PlatformPreview, PreviewStage } from "./platform-preview";
import { mediaUrl } from "./campaign-detail";
import type { CampaignDetail } from "../api";
import { Button, Empty, Pill } from "../ui";

const ORDER = ["website", "instagram", "facebook", "linkedin", "whatsapp"];

const PLATFORM_LABEL: Record<string, string> = {
  website: "Website / Blog",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
};

/** Soft character ceilings, so a reviewer sees length trouble before publishing. */
const LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
  whatsapp: 4096,
};

export function ContentReview({
  detail,
  onApprove,
  onRequestChanges,
  busy,
}: {
  detail: CampaignDetail;
  onApprove: () => void;
  onRequestChanges: () => void;
  busy: boolean;
}) {
  const { content, assets, campaign } = detail;
  const [active, setActive] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);

  const versions = useMemo(
    () => [...content].sort((a, b) => ORDER.indexOf(a.platform) - ORDER.indexOf(b.platform)),
    [content]
  );

  const current = versions.find((v) => v.platform === active) ?? versions[0];

  /**
   * Prefer the creative composed for this exact platform, fall back to any
   * creative, then to a real uploaded photograph.
   */
  const imageFor = (platform: string): string | null => {
    const creatives = assets.filter((a) => a.aiGenerated);
    const exact = creatives.find((a) => (a.metadata?.platform as string) === platform);
    const photo = assets.find((a) => !a.aiGenerated);
    const chosen = exact ?? creatives[0] ?? photo;
    return chosen ? mediaUrl(chosen.originalFile) : null;
  };

  if (versions.length === 0) {
    return <Empty text="No content generated yet — run the pipeline." />;
  }
  if (!current) return null;

  const limit = LIMITS[current.platform];
  const overLimit = limit != null && current.body.length > limit;
  const reviewable = campaign.status === "READY_FOR_REVIEW" || campaign.status === "APPROVED";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {versions.map((v) => (
          <button
            key={v.id}
            onClick={() => setActive(v.platform)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              current.platform === v.platform
                ? "border-gold bg-goldLight/30 font-bold text-goldDark"
                : "border-surface-border bg-white text-ink-soft hover:border-gold hover:text-navy"
            }`}
          >
            {PLATFORM_LABEL[v.platform] ?? v.platform}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ink-muted">
            {current.body.length.toLocaleString("en-IN")}
            {limit ? ` / ${limit.toLocaleString("en-IN")}` : ""} chars
          </span>
          {overLimit && <Pill tone="danger">Over limit</Pill>}
          <button
            onClick={() => setRaw((r) => !r)}
            className="rounded-lg border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-navy transition hover:border-gold hover:text-goldDark"
          >
            {raw ? "Show preview" : "Show raw text"}
          </button>
        </div>
      </div>

      <p className="text-xs text-ink-muted">
        This is how the post appears to someone scrolling {PLATFORM_LABEL[current.platform] ?? current.platform}.
        Engagement figures are placeholders for scale only.
      </p>

      {raw ? (
        <pre className="max-h-[560px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-surface-border bg-surface-subtle p-4 text-sm leading-relaxed text-navy">
          {current.body}
        </pre>
      ) : (
        <PreviewStage platform={current.platform}>
          <PlatformPreview
            platform={current.platform}
            body={current.body}
            title={current.title}
            imageUrl={imageFor(current.platform)}
          />
        </PreviewStage>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-surface-border pt-4">
        {reviewable ? (
          <>
            <Button onClick={onApprove} disabled={busy}>Approve &amp; schedule</Button>
            <Button variant="ghost" onClick={onRequestChanges} disabled={busy}>Request changes</Button>
            <p className="text-xs text-ink-muted">
              Approving records who signed off; publishing re-verifies it server-side.
            </p>
          </>
        ) : (
          <p className="text-xs text-ink-muted">
            This campaign is {campaign.status.replace(/_/g, " ").toLowerCase()} — approval opens once the
            quality gate passes.
          </p>
        )}
      </div>
    </div>
  );
}
