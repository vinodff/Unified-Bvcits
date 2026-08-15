// Facebook Pages API adapter (spec Section 25).
// Verified (Aug 2026): publish via /{page-id}/photos or /feed; server-side
// scheduling 10 min – 30 days with published=false + scheduled_publish_time;
// requires pages_manage_posts + app review.

import type { PublishRequest, PublishResult, SocialPublisher, MediaUploadResult } from "./publisher";
import type { SocialAccount } from "../domain";

const GRAPH = process.env.MARKETING_GRAPH_API_VERSION ?? "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH}`;
const REQUIRED_PERMISSIONS = ["pages_manage_posts", "pages_read_engagement"];

function assertConfigured(): void {
  const token = process.env.MARKETING_FACEBOOK_ACCESS_TOKEN;
  if (!token || !process.env.MARKETING_FACEBOOK_PAGE_ID) {
    throw new Error("Facebook publisher not configured: set MARKETING_FACEBOOK_ACCESS_TOKEN and MARKETING_FACEBOOK_PAGE_ID.");
  }
  if (token.startsWith("mock_")) {
    throw new Error("Mock token used with MOCK_SOCIAL_MODE=false — refusing to call the real API.");
  }
}

async function graphPost(url: string, body: BodyInit): Promise<{ id?: string; error?: { message: string; code?: number } }> {
  const res = await fetch(url, { method: "POST", body });
  const json = (await res.json()) as { id?: string; error?: { message: string; code?: number } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Facebook API error (HTTP ${res.status})`);
  return json;
}

class FacebookPublisher implements SocialPublisher {
  readonly platform = "facebook" as const;

  async validatePermissions(): Promise<string[]> {
    assertConfigured();
    const token = process.env.MARKETING_FACEBOOK_ACCESS_TOKEN!;
    const res = await fetch(`${GRAPH_BASE}/me/permissions?access_token=${token}`);
    if (!res.ok) return REQUIRED_PERMISSIONS;
    const json = (await res.json()) as { data?: { permission: string; status: string }[] };
    const granted = new Set((json.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission));
    return REQUIRED_PERMISSIONS.filter((p) => !granted.has(p));
  }

  async validateMedia(paths: string[]): Promise<void> {
    assertConfigured();
    for (const p of paths) {
      if (!/\.(jpe?g|png|gif|webp)$/i.test(p)) throw new Error(`Facebook accepts JPG/PNG/GIF/WebP — got ${p}`);
    }
  }

  async uploadMedia(): Promise<MediaUploadResult[]> {
    // Facebook publishes media in a single call; no separate upload step needed.
    return [];
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    assertConfigured();
    const token = process.env.MARKETING_FACEBOOK_ACCESS_TOKEN!;
    const pageId = process.env.MARKETING_FACEBOOK_PAGE_ID!;
    const form = new FormData();
    form.append("access_token", token);
    form.append("message", req.text);
    for (const p of req.mediaPaths) {
      const file = await import("node:fs/promises").then((f) => f.readFile(p));
      form.append("source", new Blob([file]));
    }
    const endpoint = req.mediaPaths.length ? `${GRAPH_BASE}/${pageId}/photos` : `${GRAPH_BASE}/${pageId}/feed`;
    const { id } = await graphPost(endpoint, form);
    return { platformPostId: id ?? "unknown", publishedAt: new Date().toISOString() };
  }

  async schedule(req: PublishRequest): Promise<{ scheduleId: string; scheduledFor: string }> {
    assertConfigured();
    if (!req.scheduledFor) throw new Error("Facebook scheduling requires scheduledFor.");
    const when = Math.floor(Date.parse(req.scheduledFor) / 1000);
    const now = Math.floor(Date.now() / 1000);
    if (when - now < 600) throw new Error("Facebook requires scheduling at least 10 minutes in the future.");
    if (when - now > 30 * 24 * 3600) throw new Error("Facebook allows scheduling at most 30 days ahead.");

    const token = process.env.MARKETING_FACEBOOK_ACCESS_TOKEN!;
    const pageId = process.env.MARKETING_FACEBOOK_PAGE_ID!;
    const form = new FormData();
    form.append("access_token", token);
    form.append("message", req.text);
    form.append("published", "false");
    form.append("scheduled_publish_time", String(when));
    for (const p of req.mediaPaths) {
      const file = await import("node:fs/promises").then((f) => f.readFile(p));
      form.append("source", new Blob([file]));
    }
    const endpoint = req.mediaPaths.length ? `${GRAPH_BASE}/${pageId}/photos` : `${GRAPH_BASE}/${pageId}/feed`;
    const { id } = await graphPost(endpoint, form);
    return { scheduleId: id ?? "unknown", scheduledFor: req.scheduledFor };
  }

  async getStatus(platformPostId: string): Promise<{ state: string; url?: string }> {
    assertConfigured();
    const token = process.env.MARKETING_FACEBOOK_ACCESS_TOKEN!;
    const res = await fetch(`${GRAPH_BASE}/${platformPostId}?fields=permalink_url&access_token=${token}`);
    if (!res.ok) return { state: "unknown" };
    const json = (await res.json()) as { permalink_url?: string };
    return { state: "published", url: json.permalink_url };
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    return account;
  }
}

const publisher = new FacebookPublisher();
export default publisher;
