// WhatsApp Business Platform Cloud API adapter (spec Section 25).
// Verified (Aug 2026): Cloud API only (on-premise deprecated); template
// messages (pre-approved, business-initiated) + free-form messages inside
// the 24h customer-service window. Status publishing is NOT supported by
// the Cloud API — the UI surfaces this honestly. See
// docs/architecture/agent-research.md.

import type { PublishRequest, PublishResult, SocialPublisher, MediaUploadResult } from "./publisher";
import type { SocialAccount } from "../domain";

const GRAPH = process.env.MARKETING_GRAPH_API_VERSION ?? "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH}`;

function assertConfigured(): void {
  const token = process.env.MARKETING_WHATSAPP_TOKEN;
  const phoneId = process.env.MARKETING_WHATSAPP_PHONE_ID;
  if (!token || !phoneId || !process.env.MARKETING_WHATSAPP_RECIPIENT) {
    throw new Error("WhatsApp publisher not configured: set MARKETING_WHATSAPP_TOKEN, MARKETING_WHATSAPP_PHONE_ID and MARKETING_WHATSAPP_RECIPIENT.");
  }
  if (token.startsWith("mock_")) {
    throw new Error("Mock token used with MOCK_SOCIAL_MODE=false — refusing to call the real API.");
  }
}

class WhatsAppPublisher implements SocialPublisher {
  readonly platform = "whatsapp" as const;

  async validatePermissions(): Promise<string[]> {
    // Token-based access; Meta Business verification is an out-of-band
    // process that cannot be probed via the messaging API. Publish-time
    // errors surface verification failures with Meta's own message.
    return [];
  }

  async validateMedia(): Promise<void> {
    // Verified: media attachments can only ride inside approved templates;
    // there is no free-form media send path in the Cloud API.
    throw new Error("WhatsApp media requires an approved template — media attachments cannot be sent as free-form messages via the Cloud API.");
  }

  async uploadMedia(): Promise<MediaUploadResult[]> {
    // Media flows through pre-approved templates, not a per-post upload step.
    return [];
  }

  /** Free-form text message — only valid inside the 24h customer-service window. */
  async publish(req: PublishRequest): Promise<PublishResult> {
    assertConfigured();
    if (req.mediaPaths.length) await this.validateMedia();
    const token = process.env.MARKETING_WHATSAPP_TOKEN!;
    const phoneId = process.env.MARKETING_WHATSAPP_PHONE_ID!;
    const to = process.env.MARKETING_WHATSAPP_RECIPIENT!;

    const res = await fetch(`${GRAPH_BASE}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: req.text },
      }),
    });
    const json = (await res.json()) as { messages?: { id?: string }[]; error?: { message?: string } };
    if (!res.ok || json.error) throw new Error(json.error?.message ?? `WhatsApp API error (HTTP ${res.status})`);
    const wamid = json.messages?.[0]?.id;
    if (!wamid) throw new Error("WhatsApp accepted the message but returned no id.");
    return { platformPostId: wamid, publishedAt: new Date().toISOString() };
  }

  async schedule(): Promise<{ scheduleId: string; scheduledFor: string }> {
    // Verified: WhatsApp Status publishing and server-side scheduling are
    // NOT available through the Cloud API. Broadcasts require approved
    // templates + opt-in lists; the caller-side scheduler may fire
    // publish() inside the 24h window instead.
    throw new Error("WhatsApp Status/scheduling is not supported by the Cloud API — broadcasts require approved templates and opt-in lists.");
  }

  async getStatus(): Promise<{ state: string; url?: string }> {
    // Delivery receipts arrive via webhooks, not a pollable endpoint.
    return { state: "unknown" };
  }

  async refreshToken(account: SocialAccount): Promise<SocialAccount> {
    return account;
  }
}

const publisher = new WhatsAppPublisher();
export default publisher;