// Social accounts (spec Section 24): list, connect (env-gated credentials),
// disconnect. Capabilities shown are the VERIFIED ones from the research doc.

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/marketing/api-guard";
import { store } from "@/lib/marketing/storage";
import { newId, nowIso } from "@/lib/marketing/storage";
import { PLATFORM_CAPABILITIES } from "@/lib/marketing/brand";
import { IS_MOCK_MODE } from "@/lib/marketing/social/publisher";
import { getToken, setToken, clearToken } from "@/lib/marketing/social/tokens";
import type { Platform, SocialAccount } from "@/lib/marketing/domain";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const accounts = await store.listSocialAccounts();
  const enriched = accounts.map((a) => ({
    ...a,
    capabilities: PLATFORM_CAPABILITIES[a.platform],
    configured: Boolean(IS_MOCK_MODE || a.mock),
  }));
  return NextResponse.json({ accounts: enriched, mockMode: IS_MOCK_MODE });
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { platform?: Platform; label?: string };
  const platform = body.platform;
  if (!platform || !(platform in PLATFORM_CAPABILITIES) && platform !== "website") {
    return NextResponse.json({ error: "invalid platform" }, { status: 400 });
  }
  if (platform === "website") {
    // The site is its own publisher — connectable without external credentials.
    const existing = await store.listSocialAccounts();
    if (existing.some((a) => a.platform === "website" && a.status !== "disconnected")) {
      return NextResponse.json({ error: "website account already connected" }, { status: 409 });
    }
    const account: SocialAccount = {
      id: newId("acc"),
      platform: "website",
      label: body.label ?? "BVCITS Website",
      connectedBy: "admin",
      status: "connected",
      capabilities: { publishing: true, scheduling: false, media: true, analytics: false, note: "The website is its own publisher — the worker records the publish; the article renders on the site." },
      permissions: ["self"],
      connectedAt: nowIso(),
      requiresAppReview: false,
      mock: IS_MOCK_MODE,
    };
    await store.saveSocialAccount(account);
    await store.appendAudit({ id: newId("audit"), at: nowIso(), actor: "admin", action: "account_connected", entity: "account", entityId: account.id, detail: { platform } });
    return NextResponse.json({ account }, { status: 201 });
  }
  if (IS_MOCK_MODE) {
    const existing = await store.listSocialAccounts();
    const account: SocialAccount = {
      id: newId("acc"),
      platform,
      label: body.label ?? `${platform} (mock)`,
      connectedBy: "admin",
      status: "mock",
      capabilities: { ...PLATFORM_CAPABILITIES[platform], scheduling: PLATFORM_CAPABILITIES[platform].scheduling === "api" },
      permissions: ["mock"],
      connectedAt: nowIso(),
      requiresAppReview: platform === "instagram" || platform === "facebook",
      mock: true,
    };
    await store.saveSocialAccount(account);
    await store.appendAudit({ id: newId("audit"), at: nowIso(), actor: "admin", action: "account_connected", entity: "account", entityId: account.id, detail: { platform, mock: true } });
    return NextResponse.json({ account }, { status: 201 });
  }

  // Production: credentials must come from env, never from the client.
  const envKey: Partial<Record<Platform, { token: string; id: string }>> = {
    instagram: { token: "MARKETING_INSTAGRAM_ACCESS_TOKEN", id: "MARKETING_INSTAGRAM_IG_USER_ID" },
    facebook: { token: "MARKETING_FACEBOOK_ACCESS_TOKEN", id: "MARKETING_FACEBOOK_PAGE_ID" },
    linkedin: { token: "MARKETING_LINKEDIN_ACCESS_TOKEN", id: "MARKETING_LINKEDIN_PERSON_URN" },
    whatsapp: { token: "MARKETING_WHATSAPP_TOKEN", id: "MARKETING_WHATSAPP_PHONE_NUMBER_ID" },
  };
  const mapping = envKey[platform];
  const token = process.env[mapping?.token ?? ""];
  const accountId = process.env[mapping?.id ?? ""];
  if (!mapping || !token || !accountId) {
    return NextResponse.json({ error: `${platform} not configured — set ${mapping?.token} and ${mapping?.id} on the server.` }, { status: 400 });
  }
  await setToken(platform, { accessToken: token, accountId });
  const account: SocialAccount = {
    id: newId("acc"),
    platform,
    label: body.label ?? platform,
    connectedBy: "admin",
    status: "connected",
    capabilities: { ...PLATFORM_CAPABILITIES[platform], scheduling: PLATFORM_CAPABILITIES[platform].scheduling === "api" },
    permissions: ["server-env"],
    connectedAt: nowIso(),
    requiresAppReview: platform === "instagram" || platform === "facebook",
    mock: false,
  };
  await store.saveSocialAccount(account);
  await store.appendAudit({ id: newId("audit"), at: nowIso(), actor: "admin", action: "account_connected", entity: "account", entityId: account.id, detail: { platform } });
  return NextResponse.json({ account }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { id?: string; action?: "disconnect" | "refresh" };
  const account = (await store.listSocialAccounts()).find((a) => a.id === body.id);
  if (!account) return NextResponse.json({ error: "account not found" }, { status: 404 });
  if (body.action === "disconnect") {
    account.status = "disconnected";
    await store.saveSocialAccount(account);
    await clearToken(account.platform);
    await store.appendAudit({ id: newId("audit"), at: nowIso(), actor: "admin", action: "account_disconnected", entity: "account", entityId: account.id, detail: {} });
  }
  if (body.action === "refresh") {
    const stored = await getToken(account.platform);
    if (stored?.accessToken) account.status = "connected";
    await store.saveSocialAccount(account);
  }
  return NextResponse.json({ account });
}

void setToken;