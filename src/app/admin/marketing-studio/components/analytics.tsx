"use client";

import { useEffect, useState } from "react";
import type { Campaign } from "@/lib/marketing/domain";
import { api, fmtDate } from "../api";
import { Card, Empty, SectionTitle, Pill } from "../ui";

interface PostRow {
  campaignId: string;
  campaignTitle: string;
  platform: string;
  status: string;
  scheduledFor: string;
  publishedAt?: string | null;
  platformPostId?: string | null;
  error?: string | null;
}

/** Analytics (spec Section 52): published posts with real platform URLs. */
export function AnalyticsView({ campaigns, onOpen }: { campaigns: Campaign[]; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const all: PostRow[] = [];
      for (const c of campaigns) {
        try {
          const d = await api.detail(c.id);
          for (const j of d.jobs) {
            if (j.status === "published" || j.status === "failed") {
              all.push({ campaignId: c.id, campaignTitle: c.title, platform: j.platform, status: j.status, scheduledFor: j.scheduledFor, publishedAt: undefined, platformPostId: j.platformPostId, error: j.error });
            }
          }
        } catch {
          /* ignore */
        }
      }
      setRows(all.sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor)));
      setLoading(false);
    })();
  }, [campaigns]);

  return (
    <div>
      <SectionTitle eyebrow="Results" title="Analytics" />
      {loading ? (
        <Empty text="Loading…" />
      ) : rows.length === 0 ? (
        <Empty text="Nothing published yet." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={`${r.campaignId}-${r.platform}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <button onClick={() => onOpen(r.campaignId)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold text-brand-white hover:text-brand-gold">{r.campaignTitle}</p>
                <p className="text-xs text-white/45">
                  {r.platform} · due {fmtDate(r.scheduledFor)}
                  {r.publishedAt ? ` · at ${fmtDate(r.publishedAt)}` : ""}
                </p>
              </button>
              <div className="flex items-center gap-2">
                {r.platformPostId && (
                  <span className="max-w-[180px] truncate text-[10px] text-white/35" title={r.platformPostId}>
                    {r.platformPostId}
                  </span>
                )}
                <Pill tone={r.status === "published" ? "success" : "danger"}>{r.status === "published" ? "published" : "failed"}</Pill>
              </div>
              {r.error && <p className="w-full text-xs text-red-300">{r.error}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}