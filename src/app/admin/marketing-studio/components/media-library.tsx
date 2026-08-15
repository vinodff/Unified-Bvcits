"use client";

import { useEffect, useState } from "react";
import type { Campaign } from "@/lib/marketing/domain";
import { api } from "../api";
import { mediaUrl } from "./campaign-detail";
import { Card, Empty, SectionTitle, Pill } from "../ui";

/** Media Library (spec Section 51): every asset across campaigns. */
export function MediaLibrary({ campaigns }: { campaigns: Campaign[] }) {
  const [items, setItems] = useState<{ id: string; campaignId: string; campaignTitle: string; originalFile: string; aiGenerated: boolean; platform?: string; observations?: string[] }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const all: typeof items = [];
      for (const c of campaigns) {
        try {
          const d = await api.detail(c.id);
          for (const a of d.assets) {
            all.push({ id: a.id, campaignId: c.id, campaignTitle: c.title, originalFile: a.originalFile, aiGenerated: a.aiGenerated, platform: a.metadata?.platform as string | undefined, observations: a.observations });
          }
        } catch {
          /* ignore */
        }
      }
      setItems(all.sort((a, b) => a.campaignTitle.localeCompare(b.campaignTitle)));
      setLoading(false);
    })();
  }, [campaigns]);

  return (
    <div>
      <SectionTitle eyebrow="Assets" title="Media Library" />
      {loading ? (
        <Empty text="Loading…" />
      ) : items.length === 0 ? (
        <Empty text="No media yet — upload photographs inside a campaign." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((a) => (
            <Card key={a.id} className="overflow-hidden p-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(a.originalFile)} alt={a.campaignTitle} className="h-44 w-full object-cover" />
              <div className="p-3">
                <p className="truncate text-sm font-semibold text-brand-white">{a.campaignTitle}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Pill tone={a.aiGenerated ? "success" : "neutral"}>{a.aiGenerated ? "AI composed" : "photograph"}</Pill>
                  {a.platform && <span className="text-[10px] text-white/40">{a.platform}</span>}
                </div>
                {(a.observations ?? []).length > 0 && <p className="mt-1.5 truncate text-[10px] text-white/35">{a.observations![0]}</p>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}