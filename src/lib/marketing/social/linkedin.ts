// LinkedIn Posts API adapter (spec Section 25).
// Verified (Aug 2026): publish via /rest/posts (text + up to 9 images),
// 3,000 char limit, OAuth2 token ~60 days. NO official scheduling API —
// the scheduler fires the API at the chosen time. Personal profile needs
// no app review (w_member_social); company page needs partner approval.
// See docs/architecture/agent-research.md.

import type { PublishRequest, PublishResult, SocialPublisher, MediaUploadResult } from "./publisher";
import type { SocialAccount } from "../domain";

const API_BASE = "https://api.linkedin.com";
// Monthly-cadence version header is mandatory. Defaults to 2026-08 (the
// version the capability research was verified against).
const API_VERSION = process.env.MARKETING_LINKEDIN_API_VERSION ?? "202608";

function assertConfigured(): void {
  const token = process.env.MARKETING_LINKEDIN_ACCESS_TOKEN;
  const owner = process.env.MARKETING_LINKEDIN_OWNER_URN;
  if (!token || !owner) {
    throw new Error("LinkedIn publisher not configured: set MARKETING_LINKEDIN_ACCESS_TOKEN and MARKETING_LINKEDIN_OWNER_URN (urn:li:person:… or urn:li:organization:…).");
  }
  if (token.startsWith("mock_")) {
    throw new Error("Mock token used with MOCK_SOCIAL_MODE=false — refusing to call the real API.");
  }
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Linkedin-Version": API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };
}

class LinkedInPublisher implements SocialPublisher {
  readonly platform = "linkedin" as const;

  async validatePermissions(): Promise<string[]> {
    // Verified: w_member_social (personal) needs no app review; the org-page
    // scope requires partner approval that cannot be probed via a simple call.
    // Missing scopes surface at publish time with the API's own error message.
    return [];
  }

  async validateMedia(paths: string[]): Promise<void> {
    assertConfigured();
    if (paths.length > 9) throw new Error("LinkedIn allows at most 9 images per post.");
    for (const p of paths) {
      if (!/\.(jpe?g|png)$/i.test(p)) throw new Error(`LinkedIn accepts JPEG/PNG only — got ${p}`);
    }
  }

  /** Register an image asset and upload its bytes; returns the asset URN. */
  async uploadMedia(paths: string[]): Promise<MediaUploadResult[]> {
    assertConfigured();
    const token = process.env.MARKETING_LINKEDIN_ACCESS_TOKEN!;
    const owner = process.env.MARKETING_LINKEDIN_OWNER_URN!;
    const out: MediaUploadResult[] = [];
    for (const p of paths) {
      const register = await fetch(`${API_BASE}/rest/assets?action=registerUpload`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({
          registerUploadRequest: {
            owner,
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
          },
        }),
      });
      const regJson = (await register.json()) as {
        value?: { uploadUrn?: string; uploadUrl?: string };
        message?: string;
      };
      if (!register.ok || !regJson.value?.uploadUrl || !regJson.value?.uploadUrn) {
        throw new Error(regJson.message ?? `LinkedIn asset registration failed (HTTP ${register.status})`);
      }
      const file = await import("node:fs/promises").then((f) => f.readFile(p));
      const put = await fetch(regJson.value.uploadUrl, { method: "PUT", body: file as unknown as BodyInit });
      if (!put.ok) throw new Error(`LinkedIn asset upload failed (HTTP ${put.status})`);
      out.push({ uploadId: regJson.value.uploadUrn, status: "ready" });
    }
    return out;
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    assertConfigured();
    if (req.text.length > 3000) throw new Error("LinkedIn limits posts to 3,000 characters.");
    const token = process.env.MARKETING_LINKEDIN_ACCESS_TOKEN!;
    const owner = process.env.MARKETING_LINKEDIN_OWNER_URN!;

    const media = req.mediaPaths.length ? await this.uploadMedia(req.mediaPaths) : [];
    const body: Record<string, unknown> = {
      author: owner,
      commentary: req.text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionSources: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    if (media.length === 1) {
      body.content = { media: { title: "Photo", id: media[0].uploadId } };
    } else if (media.length > 1) {
      body.content = { multiImage: { images: media.map((m) => ({ media: { title: "Photo", id: m.uploadId } })) } };
    }

    const res = await fetch(`${API_BASE}/rest/posts`, { method: "POST", headers: headers(token), body: JSON.stringify(body) });
    const json = (await res.json()) as { id?: string; message?: string };
    if (!res.ok || !json.id) throw new Error(json.message ?? `LinkedIn publish failed (HTTP ${res.status})`);
    return { platformPostId: json.id, publishedAt: new Date().toISOString() };
  }

  async schedule(): Promise<{ scheduleId: string; scheduledFor: string }> {
    // Verified: lifecycleState accepts PUBLISHED only at creation; there is
    // no scheduling parameter. The caller-side scheduler fires publish() at
    // the chosen time instead — never fake a server-side schedule.
    throw new Error("LinkedIn has no official scheduling API — publish at the chosen time from the caller side.");
  }

  async getStatus(): Promise<{ state: string; url?: string }> {
    // No reliable read endpoint without extra scopes (analytics needs them);
    // webhooks/extra scopes are out of scope for the marketing clone.
    return { state: "unknown" };
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    return account;
  }
}

const publisher = new LinkedInPublisher();
export default publisher;