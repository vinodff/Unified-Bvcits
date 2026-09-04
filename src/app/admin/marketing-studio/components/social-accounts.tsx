"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Button, Card, Empty, Pill, SectionTitle, StatusPill } from "../ui";

const PLATFORMS = ["instagram", "facebook", "linkedin", "whatsapp"] as const;

export function SocialAccounts() {
  const [accounts, setAccounts] = useState<{ id: string; platform: string; label: string; status: string; capabilities: { publishing: boolean; scheduling: boolean; media: boolean; analytics: boolean; note: string }; mock: boolean }[]>([]);
  const [mockMode, setMockMode] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.accounts();
    setAccounts(res.accounts);
    setMockMode(res.mockMode);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async (platform: string) => {
    setBusy(platform);
    try {
      await api.connectAccount(platform as never);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, action: "disconnect" | "refresh") => {
    setBusy(id);
    try {
      await api.accountAction(id, action);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Connections"
        title="Social Accounts"
        right={<Pill tone={mockMode ? "info" : "success"}>{mockMode ? "MOCK MODE — no real posts" : "PRODUCTION — real API calls"}</Pill>}
      />
      {mockMode && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Mock mode is active (default). Nothing is posted to real platforms — posts are recorded under <code>.data/marketing/mock-posts.json</code>. Set <code>MOCK_SOCIAL_MODE=false</code> plus the platform env keys to go live.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {PLATFORMS.map((p) => {
          const acc = accounts.find((a) => a.platform === p);
          return (
            <Card key={p}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-base font-bold capitalize text-navy">{p}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{acc?.label ?? "Not connected"}</p>
                </div>
                {acc ? <StatusPill status={acc.status} /> : <Pill tone="neutral">offline</Pill>}
              </div>
              {acc && (
                <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
                  <Pill tone={acc.capabilities.publishing ? "success" : "danger"}>{acc.capabilities.publishing ? "publish ✓" : "publish ✕"}</Pill>
                  <Pill tone={acc.capabilities.scheduling ? "success" : "neutral"}>{acc.capabilities.scheduling ? "api scheduling ✓" : "caller-side scheduling"}</Pill>
                  <Pill tone={acc.capabilities.media ? "success" : "neutral"}>media</Pill>
                  <Pill tone={acc.capabilities.analytics ? "success" : "neutral"}>analytics</Pill>
                </div>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">{acc?.capabilities.note}</p>
              <div className="mt-3 flex gap-2">
                {acc ? (
                  <>
                    <Button variant="ghost" disabled={busy === acc.id} onClick={() => void act(acc.id, "refresh")}>Refresh</Button>
                    <Button variant="danger" disabled={busy === acc.id} onClick={() => void act(acc.id, "disconnect")}>Disconnect</Button>
                  </>
                ) : (
                  <Button disabled={busy === p} onClick={() => void connect(p)}>
                    {busy === p ? "Connecting…" : "Connect"}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-ink-muted">
        Capabilities shown are the ones verified against official API docs — Instagram & Facebook support API-side scheduling; LinkedIn & WhatsApp do not, so the worker publishes at the due time.
      </p>
    </div>
  );
}

export { Empty };