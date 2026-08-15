"use client";

import { useState } from "react";
import { api } from "../api";
import { CAMPAIGN_TYPES, CAMPAIGN_TYPE_LABELS } from "@/lib/marketing/domain";
import { Button, Card, ErrorNote, Field, inputCls, SectionTitle } from "../ui";

// Rendered straight from the domain list. The previous hand-written array
// offered three types the pipeline could not handle ("competition", "tieup",
// "admission") — see CAMPAIGN_TYPES in lib/marketing/domain.ts.

export function CreateCampaign({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("event");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { campaign } = await api.createCampaign(title, type);
      onCreated(campaign.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <SectionTitle eyebrow="New Campaign" title="Create Campaign" />
      <Card>
        <div className="space-y-4">
          <Field label="Campaign title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. National-Level Hackathon 2026"
              className={inputCls}
            />
          </Field>
          <Field label="Campaign type">
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t} value={t} className="bg-brand-black">
                  {CAMPAIGN_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <ErrorNote message={error} />
          <Button onClick={() => void submit()} disabled={busy || !title.trim()} className="w-full">
            {busy ? "Creating…" : "Create & Open in Studio"}
          </Button>
        </div>
      </Card>
      <p className="mt-4 text-center text-xs text-white/40">
        After creating, the AI Content Assistant will ask for the facts it needs (title, date, venue, winners…).
      </p>
    </div>
  );
}