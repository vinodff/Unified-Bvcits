// Typed fetch helpers for the Marketing Studio (client side only).

import type { Campaign, Platform, CampaignFact } from "@/lib/marketing/domain";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

export interface CampaignDetail {
  campaign: Campaign;
  facts: CampaignFact[];
  assets: { id: string; originalFile: string; aiGenerated: boolean; observations?: string[]; metadata?: Record<string, unknown>; createdAt: string; type: string }[];
  content: { id: string; version: number; platform: Platform; body: string; title?: string | null; status: string }[];
  approvals: { id: string; contentVersion: number; status: string; approvedAt: string; platforms: Platform[]; scheduledAt?: string | null }[];
  seo: { seoTitle: string; metaDescription: string; primaryIntent?: string; internalLinks?: { href: string }[]; slug?: string } | null;
  quality: { overall: number; verdict: string; issues: { severity: string; message: string }[] } | null;
  runs: { id: string; agentName: string; status: string; summary: string; startedAt: string; durationMs?: number | null }[];
  supervisor: { steps: Record<string, string>; contentVersion: number } | null;
  jobs: { id: string; platform: Platform; status: string; scheduledFor: string; contentVersion: number; platformPostId?: string | null; error?: string | null }[];
  audit: { id: string; actor: string; action: string; at: string; detail: Record<string, unknown> }[];
}

export const api = {
  me: () => req<{ ok: boolean; dev: boolean }>("/api/marketing/auth/login"),
  login: (pin: string) => req<{ ok: boolean; dev: boolean }>("/api/marketing/auth/login", { method: "POST", body: JSON.stringify({ pin }) }),
  logout: () => req<{ ok: boolean }>("/api/marketing/auth/logout", { method: "POST" }),
  campaigns: () => req<{ campaigns: Campaign[]; dev: boolean }>("/api/marketing/campaigns"),
  createCampaign: (title: string, type: string) =>
    req<{ campaign: Campaign }>("/api/marketing/campaigns", { method: "POST", body: JSON.stringify({ title, type }) }),
  detail: (id: string) => req<CampaignDetail>(`/api/marketing/campaigns/${id}`),
  patch: (id: string, body: Record<string, unknown>) =>
    req<{ campaign: Campaign }>(`/api/marketing/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  del: (id: string) => req<{ ok: boolean }>(`/api/marketing/campaigns/${id}`, { method: "DELETE" }),
  generate: (id: string) =>
    req<{ campaign: Campaign; detail: CampaignDetail }>(`/api/marketing/campaigns/${id}/generate`, { method: "POST" }),
  ask: (id: string, message: string) =>
    req<{ reply: string; questions: string[]; facts: CampaignFact[] }>(`/api/marketing/campaigns/${id}/ask`, { method: "POST", body: JSON.stringify({ message }) }),
  approve: (id: string, platforms: Platform[], scheduledAt: string) =>
    req<{ approval: unknown; jobs: unknown[]; campaign: Campaign }>(`/api/marketing/campaigns/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ platforms, scheduledAt }),
    }),
  uploadAssets: async (id: string, files: File[]): Promise<void> => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    const res = await fetch(`/api/marketing/campaigns/${id}/assets`, { method: "POST", body: form });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
    }
  },
  accounts: () => req<{ accounts: { id: string; platform: Platform; label: string; status: string; capabilities: { publishing: boolean; scheduling: boolean; media: boolean; analytics: boolean; note: string }; mock: boolean }[]; mockMode: boolean }>("/api/marketing/accounts"),
  connectAccount: (platform: Platform, label?: string) =>
    req<{ account: unknown }>("/api/marketing/accounts", { method: "POST", body: JSON.stringify({ platform, label }) }),
  accountAction: (id: string, action: "disconnect" | "refresh") =>
    req<{ account: unknown }>("/api/marketing/accounts", { method: "PATCH", body: JSON.stringify({ id, action }) }),
  audit: (limit = 200) => req<{ audit: { id: string; actor: string; action: string; at: string; entityId: string; detail: Record<string, unknown> }[] }>(`/api/marketing/worker?limit=${limit}`),
  tick: () => req<{ ok: boolean; processed: number; published: number; failed: number }>("/api/marketing/worker", { method: "POST" }),
};

export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}