"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDate } from "../api";
import { Button, Card, Empty, Pill, SectionTitle } from "../ui";

/** Agent Activity (spec Section 53): every agent run across campaigns. */
export function Activity() {
  const [rows, setRows] = useState<{ id: string; agentName: string; status: string; summary: string; startedAt: string; campaignId: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.audit(500);
      // The audit log only has run_* actions; agent runs themselves come from campaigns.
      setRows([]);
      const runs: typeof rows = [];
      const campaigns = (await api.campaigns()).campaigns;
      for (const c of campaigns) {
        try {
          const d = await api.detail(c.id);
          for (const r of d.runs) {
            runs.push({ id: r.id, agentName: r.agentName, status: r.status, summary: r.summary, startedAt: r.startedAt, campaignId: c.id });
          }
        } catch {
          /* ignore */
        }
      }
      setRows(runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 60));
      void res;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <SectionTitle eyebrow="Supervisor" title="Agent Activity" right={<Button variant="ghost" onClick={() => void load()}>Refresh</Button>} />
      {loading ? (
        <Empty text="Loading…" />
      ) : rows.length === 0 ? (
        <Empty text="No agent runs recorded yet." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand-white">
                  {r.agentName} <span className="ml-1 text-[10px] text-white/35">{r.campaignId}</span>
                </p>
                <p className="truncate text-xs text-white/50">{r.summary}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/35">{fmtDate(r.startedAt)}</span>
                <Pill tone={r.status === "success" ? "success" : r.status === "failed" ? "danger" : "neutral"}>{r.status}</Pill>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}