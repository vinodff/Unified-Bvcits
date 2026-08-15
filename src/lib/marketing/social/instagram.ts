// Instagram Graph API adapter (spec Section 25).
// Verified against official docs (Aug 2026): publish via media container,
// server-side scheduling 10 min – 75 days at container creation, app review
// required for instagram_content_publish. See docs/architecture/agent-research.md.

import type { PublishRequest, PublishResult, SocialPublisher, MediaUploadResult } from "./publisher";
import type { SocialAccount } from "../domain";

const GRAPH = process.env.MARKETING_GRAPH_API_VERSION ?? "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH}`;

const REQUIRED_PERMISSIONS = ["instagram_content_publish", "instagram_basic", "pages_read_engagement"];

function assertConfigured(): void {
  const token = process.env.MARKETING_INSTAGRAM_ACCESS_TOKEN;
  const igUserId = process.env.MARKETING_INSTAGRAM_IG_USER_ID;
  if (!token || !igUserId) {
    throw new Error("Instagram publisher not configured: set MARKETING_INSTAGRAM_ACCESS_TOKEN and MARKETING_INSTAGRAM_IG_USER_ID.");
  }
  if (token.startsWith("mock_")) {
    throw new Error("Mock token used with MOCK_SOCIAL_MODE=false — refusing to call the real API.");
  }
}

async function graphPost(url: string, body: BodyInit, token: string): Promise<{ id?: string; error?: { message: string; code?: number } }> {
  const res = await fetch(url, { method: "POST", body });
  const json = (await res.json()) as { id?: string; error?: { message: string; code?: number } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Instagram API error (HTTP ${res.status})`);
  return json;
}

class InstagramPublisher implements SocialPublisher {
  readonly platform = "instagram" as const;

  async validatePermissions(): Promise<string[]> {
    assertConfigured();
    const token = process.env.MARKETING_INSTAGRAM_ACCESS_TOKEN!;
    const res = await fetch(`${GRAPH_BASE}/me/permissions?access_token=${token}`);
    if (!res.ok) return REQUIRED_PERMISSIONS;
    const json = (await res.json()) as { data?: { permission: string; status: string }[] };
    const granted = new Set((json.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission));
    return REQUIRED_PERMISSIONS.filter((p) => !granted.has(p));
  }

  async validateMedia(paths: string[]): Promise<void> {
    assertConfigured();
    if (paths.length > 10) throw new Error("Instagram allows at most 10 media items per post.");
    for (const p of paths) {
      if (!/\.(jpe?g|png)$/i.test(p)) throw new Error(`Instagram accepts JPEG/PNG only — got ${p}`);
    }
  }

  /** Create a media container for a local file (multipart upload). */
  async uploadMedia(paths: string[]): Promise<MediaUploadResult[]> {
    assertConfigured();
    const out: MediaUploadResult[] = [];
    for (const p of paths) {
      const file = await import("node:fs/promises").then((f) => f.readFile(p));
      const form = new FormData();
      form.append("access_token", process.env.MARKETING_INSTAGRAM_ACCESS_TOKEN!);
      form.append("image_url", new Blob([file]));
      const res = await fetch(`${GRAPH_BASE}/${process.env.MARKETING_INSTAGRAM_IG_USER_ID}/media`, { method: "POST", body: form });
      const json = (await res.json()) as { id?: string; error?: { message: string } };
      if (!res.ok || !json.id) throw new Error(json.error?.message ?? `Instagram container upload failed (HTTP ${res.status})`);
      out.push({ uploadId: json.id, status: "ready" });
    }
    return out;
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    assertConfigured();
    if (req.mediaPaths.length === 0) throw new Error("Instagram posts require at least one image.");
    const media = await this.uploadMedia(req.mediaPaths);
    const { id } = await graphPost(
      `${GRAPH_BASE}/${process.env.MARKETING_INSTAGRAM_IG_USER_ID}/media_publish`,
      new URLSearchParams({ access_token: process.env.MARKETING_INSTAGRAM_ACCESS_TOKEN!, creation_id: media[0].uploadId, caption: req.text }),
      process.env.MARKETING_INSTAGRAM_ACCESS_TOKEN!
    );
    return { platformPostId: id ?? "unknown", publishedAt: new Date().toISOString() };
  }

  /** Schedule = create the container with published=false + scheduled_publish_time. */
  async schedule(req: PublishRequest): Promise<{ scheduleId: string; scheduledFor: string }> {
    assertConfigured();
    if (!req.scheduledFor) throw new Error("Instagram scheduling requires scheduledFor.");
    const when = Math.floor(Date.parse(req.scheduledFor) / 1000);
    const now = Math.floor(Date.now() / 1000);
    if (when - now < 600) throw new Error("Instagram requires scheduling at least 10 minutes in the future.");
    if (when - now > 75 * 24 * 3600) throw new Error("Instagram allows scheduling at most 75 days ahead.");
    if (req.mediaPaths.length === 0) throw new Error("Instagram scheduled posts require media.");

    const file = await import("node:fs/promises").then((f) => f.readFile(req.mediaPaths[0]));
    const form = new FormData();
    form.append("access_token", process.env.MARKETING_INSTAGRAM_ACCESS_TOKEN!);
    form.append("image_url", new Blob([file]));
    form.append("caption", req.text);
    form.append("published", "false");
    form.append("scheduled_publish_time", String(when));
    const { id } = await graphPost(
      `${GRAPH_BASE}/${process.env.MARKETING_INSTAGRAM_IG_USER_ID}/media`,
      form,
      process.env.MARKETING_INSTAGRAM_ACCESS_TOKEN!
    );
    return { scheduleId: id ?? "unknown", scheduledFor: req.scheduledFor };
  }

  async getStatus(platformPostId: string): Promise<{ state: string; url?: string }> {
    assertConfigured();
    const token = process.env.MARKETING_INSTAGRAM_ACCESS_TOKEN!;
    const res = await fetch(`${GRAPH_BASE}/${platformPostId}?fields=permalink&access_token=${token}`);
    if (!res.ok) return { state: "unknown" };
    const json = (await res.json()) as { permalink?: string };
    return { state: "published", url: json.permalink };
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    return account;
  }
}

const publisher = new InstagramPublisher();
export default publisher;
