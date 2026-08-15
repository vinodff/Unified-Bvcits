"use client";

import { useMemo, useState } from "react";
import type { Campaign } from "@/lib/marketing/domain";
import { api } from "../api";
import { Button, Card, Empty, Pill, SectionTitle, StatusPill } from "../ui";

const STATUS_ORDER = ["PUBLISHED", "SCHEDULED", "APPROVED", "READY_FOR_REVIEW", "GENERATING", "CHANGES_REQUESTED", "NEEDS_INFORMATION", "DRAFT", "GENERATION_FAILED", "PUBLISH_FAILED"];

export function Dashboard({
  campaigns,
  onOpen,
  onRefresh,
  onFilter,
}: {
  campaigns: Campaign[];
  onOpen: (id: string) => void;
  onRefresh: () => void;
  onFilter: (f: string) => void;
}) {
  const [filter, setFilterLocal] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of STATUS_ORDER) c[s] = campaigns.filter((x) => x.status === s).length;
    return c;
  }, [campaigns]);

  const visible = filter ? campaigns.filter((c) => c.status === filter) : campaigns;
  const sorted = [...visible].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div>
      <SectionTitle
        eyebrow="Overview"
        title="Campaigns"
        right={<Button variant="ghost" onClick={() => void onRefresh()}>Refresh</Button>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => {
              const next = filter === s ? "" : s;
              setFilterLocal(next);
              onFilter(next);
            }}
            className={`rounded-xl border px-3 py-2.5 text-left transition ${filter === s ? "border-brand-gold/60 bg-brand-gold/10" : "border-white/10 bg-white/[0.03] hover:border-brand-gold/30"}`}
          >
            <p className="font-display text-xl font-extrabold text-brand-white">{counts[s] ?? 0}</p>
            <p className="text-[10px] uppercase tracking-widest text-white/50">{s.replace(/_/g, " ")}</p>
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <Empty text={filter ? `No campaigns in ${filter.replace(/_/g, " ")}.` : "No campaigns yet — create your first one."} />
      ) : (
        <div className="space-y-3">
          {sorted.map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center justify-between gap-4 transition hover:border-brand-gold/40">
              <button onClick={() => onOpen(c.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate font-display text-base font-bold text-brand-white hover:text-brand-gold">{c.title}</p>
                <p className="mt-1 text-xs text-white/45">
                  {c.type} · {c.id} · updated {new Date(c.updatedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {c.publishedAt ? ` · published ${new Date(c.publishedAt).toLocaleString("en-IN", { day: "2-digit", month: "short" })}` : ""}
                </p>
              </button>
              <div className="flex items-center gap-2">
                <StatusPill status={c.status} />
                {c.status === "GENERATION_FAILED" || c.status === "PUBLISH_FAILED" ? <Pill tone="danger">⚠</Pill> : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}