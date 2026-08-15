"use client";

import { useEffect, useState } from "react";
import type { Campaign } from "@/lib/marketing/domain";
import { api } from "../api";
import { Card, Empty, Pill, SectionTitle, StatusPill } from "../ui";

/** Review Queue (spec Section 49): campaigns waiting for the mandatory human approval. */
export function ReviewQueue({ campaigns, onOpen, onRefresh }: { campaigns: Campaign[]; onOpen: (id: string) => void; onRefresh: () => void }) {
  const [details, setDetails] = useState<Record<string, { quality: { overall: number; verdict: string } | null }>>({});
  const queue = campaigns.filter((c) => ["READY_FOR_REVIEW", "APPROVED", "CHANGES_REQUESTED"].includes(c.status));

  useEffect(() => {
    void (async () => {
      for (const c of queue) {
        try {
          const d = await api.detail(c.id);
          setDetails((x) => ({ ...x, [c.id]: { quality: d.quality } }));
        } catch {
          /* ignore */
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns]);

  return (
    <div>
      <SectionTitle eyebrow="Human gate" title="Review Queue" />
      {queue.length === 0 ? (
        <Empty text="Nothing awaiting approval. Campaigns reach this queue only after the quality gate passes." />
      ) : (
        <div className="space-y-3">
          {queue.map((c) => {
            const q = details[c.id]?.quality;
            return (
              <Card key={c.id} className="flex flex-wrap items-center justify-between gap-4 transition hover:border-brand-gold/40">
                <button onClick={() => onOpen(c.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-display text-base font-bold text-brand-white hover:text-brand-gold">{c.title}</p>
                  <p className="mt-1 text-xs text-white/45">{c.type} · {c.id}</p>
                </button>
                <div className="flex items-center gap-2">
                  {q && (
                    <Pill tone={q.verdict === "pass" ? "success" : "danger"}>
                      Quality {q.overall}/100 · {q.verdict === "pass" ? "PASS" : "NEEDS CORRECTION"}
                    </Pill>
                  )}
                  <StatusPill status={c.status} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-white/40">Approval happens inside the campaign — every publish re-verifies the approval server-side.</p>
    </div>
  );
}