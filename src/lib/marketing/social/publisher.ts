// Social Publisher contract (spec Section 25). All adapters implement ONLY
// capabilities that were verified against official API documentation in
// docs/architecture/agent-research.md. Anything unverified is surfaced as
// `capability: false` — never silently faked.

import type { SocialAccount } from "../domain";
import type { StorageProvider } from "../storage";

export interface PublishRequest {
  text: string;
  mediaPaths: string[];
  /** ISO string; only set when the platform API supports server-side scheduling. */
  scheduledFor?: string;
  external?: Record<string, unknown>;
}

export interface PublishResult {
  platformPostId: string;
  publishedAt: string;
}

export interface MediaUploadResult {
  uploadId: string;
  status: "ready" | "pending";
}

export interface SocialPublisher {
  readonly platform: SocialAccount["platform"] | "mock";
  validatePermissions(account: SocialAccount): Promise<string[]>;
  validateMedia(paths: string[]): Promise<void>;
  uploadMedia(paths: string[], account: SocialAccount): Promise<MediaUploadResult[]>;
  publish(req: PublishRequest, account: SocialAccount): Promise<PublishResult>;
  /** Server-side scheduling support per platform (verified in research doc). */
  schedule(req: PublishRequest, account: SocialAccount): Promise<{ scheduleId: string; scheduledFor: string }>;
  getStatus(platformPostId: string, account: SocialAccount): Promise<{ state: string; url?: string }>;
  refreshToken(account: SocialAccount): Promise<SocialAccount>;
}

export type RetryPolicy = "retryable" | "permanent" | "rate_limited";

/** Classify a publish error: only transport/server/rate-limit issues retry. */
export function classifyError(status: number | undefined, message: string): RetryPolicy {
  if (status === undefined) return "retryable";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "retryable";
  if (status === 401 || status === 403) return "permanent";
  if (status === 400 && /invalid|token|permission/i.test(message)) return "permanent";
  return "permanent";
}

/** Mock mode is the default; only MOCK_SOCIAL_MODE=false enables real APIs. */
export const IS_MOCK_MODE = process.env.MOCK_SOCIAL_MODE !== "false";

export async function resolvePublisher(platform: SocialAccount["platform"], account: SocialAccount): Promise<SocialPublisher> {
  if (IS_MOCK_MODE || account.mock) {
    return (await import("./mock")).default;
  }
  switch (platform) {
    case "instagram":
      return (await import("./instagram")).default;
    case "facebook":
      return (await import("./facebook")).default;
    case "linkedin":
      return (await import("./linkedin")).default;
    case "whatsapp":
      return (await import("./whatsapp")).default;
    case "website":
      return (await import("./website")).default;
    default:
      throw new Error(`No production publisher for platform ${platform}`);
  }
}