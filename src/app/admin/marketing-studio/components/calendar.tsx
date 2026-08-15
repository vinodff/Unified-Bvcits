"use client";

import { useEffect, useState } from "react";
import type { Campaign } from "@/lib/marketing/domain";
import { api, fmtDate } from "../api";
import { Card, Empty, SectionTitle, StatusPill } from "../ui";

interface JobRow {
  id: string;
  campaignId: string;
  campaignTitle: string;
  platform: string;
  status: string;
  scheduledFor: string;
  platformPostId?: string | null;
}

/** Calendar (spec Section 48): every scheduled/published job across campaigns. */
export function CalendarView({ campaigns, onOpen }: { campaigns: Campaign[]; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const all: JobRow[] = [];
      for (const c of campaigns) {
        try {
          const d = await api.detail(c.id);
          for (const j of d.jobs) {
            all.push({ id: j.id, campaignId: c.id, campaignTitle: c.title, platform: j.platform, status: j.status, scheduledFor: j.scheduledFor, platformPostId: j.platformPostId });
          }
        } catch {
          /* ignore */
        }
      }
      setRows(all.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)));
      setLoading(false);
    })();
  }, [campaigns]);

  return (
    <div>
      <SectionTitle eyebrow="Schedule" title="Calendar" />
      {loading ? (
        <Empty text="Loading…" />
      ) : rows.length === 0 ? (
        <Empty text="No scheduled jobs yet. Approve a campaign to create publish jobs." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <button onClick={() => onOpen(r.campaignId)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold text-brand-white hover:text-brand-gold">{r.campaignTitle}</p>
                <p className="text-xs text-white/45">{fmtDate(r.scheduledFor)} · {r.platform}{r.platformPostId ? ` · ${r.platformPostId}` : ""}</p>
              </button>
              <StatusPill status={r.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}