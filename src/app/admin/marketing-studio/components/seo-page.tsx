"use client";

import { useEffect, useState } from "react";
import type { Campaign } from "@/lib/marketing/domain";
import { api } from "../api";
import { Card, Empty, SectionTitle, Pill } from "../ui";

interface SeoRow {
  campaignId: string;
  campaignTitle: string;
  status: string;
  seo: { seoTitle: string; metaDescription: string } | null;
  quality: { overall: number; verdict: string } | null;
  slug?: string;
}

/** SEO (spec Section 50): people-first metadata + transparent quality scores. */
export function SeoPage({ campaigns, onOpen }: { campaigns: Campaign[]; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<SeoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const all: SeoRow[] = [];
      for (const c of campaigns) {
        try {
          const d = await api.detail(c.id);
          all.push({
            campaignId: c.id,
            campaignTitle: c.title,
            status: c.status,
            seo: d.seo ? { seoTitle: (d.seo as { seoTitle: string }).seoTitle, metaDescription: (d.seo as { metaDescription: string }).metaDescription } : null,
            quality: d.quality ? { overall: d.quality.overall, verdict: d.quality.verdict } : null,
            slug: (d.seo as { slug?: string } | null)?.slug,
          });
        } catch {
          /* ignore */
        }
      }
      setRows(all.sort((a, b) => a.campaignTitle.localeCompare(b.campaignTitle)));
      setLoading(false);
    })();
  }, [campaigns]);

  return (
    <div>
      <SectionTitle eyebrow="People-first SEO" title="Search Optimization" />
      {loading ? (
        <Empty text="Loading…" />
      ) : rows.filter((r) => r.seo).length === 0 ? (
        <Empty text="No SEO metadata yet — run the pipeline for a campaign." />
      ) : (
        <div className="space-y-3">
          {rows.filter((r) => r.seo).map((r) => (
            <Card key={r.campaignId}>
              <button onClick={() => onOpen(r.campaignId)} className="text-left">
                <p className="font-display text-base font-bold text-navy hover:text-goldDark">{r.campaignTitle}</p>
                <p className="mt-1 text-sm text-ink-soft">{r.seo!.seoTitle}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{r.seo!.metaDescription}</p>
                {r.slug && <p className="mt-1 text-[10px] text-ink-muted">/{r.slug}</p>}
              </button>
              {r.quality && (
                <div className="mt-2 flex items-center gap-2">
                  <Pill tone={r.quality.verdict === "pass" ? "success" : "danger"}>Quality {r.quality.overall}/100</Pill>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-ink-muted">
        The SEO score is a transparent in-house assessment (intent, originality, completeness, linking, alt text) — it is not a Google ranking.
      </p>
    </div>
  );
}