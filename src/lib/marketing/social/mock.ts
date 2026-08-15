// Mock social adapter (spec Section 26): local fake publishing so the entire
// Studio works in dev without API keys. Recorded under .data/marketing/mock-posts.json
// so nothing is silently lost. Never runs when MOCK_SOCIAL_MODE=false.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { PublishRequest, PublishResult, SocialPublisher, MediaUploadResult } from "./publisher";
import type { SocialAccount } from "../domain";

const MOCK_FILE = path.join(process.cwd(), ".data", "marketing", "mock-posts.json");

async function record(platform: string, req: PublishRequest, extra: Record<string, unknown>): Promise<void> {
  const existing = await fs.readFile(MOCK_FILE, "utf8").then(JSON.parse).catch(() => []) as unknown[];
  existing.push({ at: new Date().toISOString(), platform, text: req.text.slice(0, 500), media: req.mediaPaths, scheduledFor: req.scheduledFor ?? null, ...extra });
  await fs.mkdir(path.dirname(MOCK_FILE), { recursive: true });
  await fs.writeFile(MOCK_FILE, JSON.stringify(existing, null, 2));
}

class MockPublisher implements SocialPublisher {
  readonly platform = "mock" as const;
  private counter = 0;

  async validatePermissions(): Promise<string[]> {
    return [];
  }

  async validateMedia(paths: string[]): Promise<void> {
    for (const p of paths) {
      const stat = await fs.stat(p).catch(() => null);
      if (!stat) throw new Error(`Media file missing: ${p}`);
    }
  }

  async uploadMedia(paths: string[]): Promise<MediaUploadResult[]> {
    return paths.map((p) => ({ uploadId: `mock-up-${++this.counter}`, status: "ready" as const }));
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    await this.validateMedia(req.mediaPaths);
    const id = `mock-post-${Date.now()}`;
    await record("mock", req, { id });
    return { platformPostId: id, publishedAt: new Date().toISOString() };
  }

  async schedule(req: PublishRequest): Promise<{ scheduleId: string; scheduledFor: string }> {
    const id = `mock-sched-${Date.now()}`;
    await record("mock", req, { id, scheduled: true });
    return { scheduleId: id, scheduledFor: req.scheduledFor ?? new Date().toISOString() };
  }

  async getStatus(platformPostId: string): Promise<{ state: string; url?: string }> {
    return { state: "published", url: `mock://${platformPostId}` };
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    return account;
  }
}

const publisher = new MockPublisher();
export default publisher;