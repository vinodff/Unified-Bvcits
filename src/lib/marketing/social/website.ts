// Website publisher: the article is rendered on the site itself, so
// "publishing" records a local publish marker + the SEO metadata is applied
// to the generated page. There is no external API to call — the worker job
// succeeds once recorded, and the human confirms the page render.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { PublishRequest, PublishResult, SocialPublisher, MediaUploadResult } from "./publisher";
import type { SocialAccount } from "../domain";

const MARK_FILE = path.join(process.cwd(), ".data", "marketing", "website-published.json");

class WebsitePublisher implements SocialPublisher {
  readonly platform = "website" as const;

  async validatePermissions(): Promise<string[]> {
    return [];
  }

  async validateMedia(paths: string[]): Promise<void> {
    for (const p of paths) {
      const stat = await fs.stat(p).catch(() => null);
      if (!stat) throw new Error(`Media file missing: ${p}`);
    }
  }

  async uploadMedia(): Promise<MediaUploadResult[]> {
    return [];
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    await this.validateMedia(req.mediaPaths);
    const id = `website-post-${Date.now()}`;
    const record = { id, at: new Date().toISOString(), text: req.text.slice(0, 500), media: req.mediaPaths };
    const existing = await fs.readFile(MARK_FILE, "utf8").then(JSON.parse).catch(() => []) as unknown[];
    existing.push(record);
    await fs.mkdir(path.dirname(MARK_FILE), { recursive: true });
    await fs.writeFile(MARK_FILE, JSON.stringify(existing, null, 2));
    return { platformPostId: id, publishedAt: new Date().toISOString() };
  }

  /** The website has no external scheduler — caller-side due-time publishing. */
  async schedule(): Promise<{ scheduleId: string; scheduledFor: string }> {
    throw new Error("The website publishes at the due time via the worker — no external scheduler.");
  }

  async getStatus(platformPostId: string): Promise<{ state: string; url?: string }> {
    return { state: "published", url: `local://${platformPostId}` };
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    return account;
  }
}

const publisher = new WebsitePublisher();
export default publisher;