// Admin session (spec Section 61): env-gated. Without ADMIN_PIN the studio
// runs in DEV MODE (auth disabled, banner shown). With ADMIN_PIN, an HMAC
// session cookie is required for every mutating endpoint.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "bvcits_admin_session";
const SESSION_TTL_MS = 12 * 3600 * 1000;

export function isDevMode(): boolean {
  return !process.env.ADMIN_PIN;
}

function sessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET ?? `boot-${Date.now()}-${process.pid}`;
}

export function issueToken(pin: string): string {
  const payload = `${pin}:${Date.now()}`;
  const sig = createHmac("sha256", sessionSecret()).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyToken(token: string, pin: string): boolean {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return false;
    const expected = createHmac("sha256", sessionSecret()).update(Buffer.from(payloadB64, "base64url").toString()).digest("hex");
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const [payloadPin, issuedAt] = Buffer.from(payloadB64, "base64url").toString().split(":");
    if (payloadPin !== pin) return false;
    if (Date.now() - Number(issuedAt) > SESSION_TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

export async function login(pin: string): Promise<{ ok: boolean; dev: boolean }> {
  if (isDevMode()) return { ok: true, dev: true };
  if (!process.env.ADMIN_PIN || pin !== process.env.ADMIN_PIN) return { ok: false, dev: false };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, issueToken(pin), { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: SESSION_TTL_MS / 1000 });
  return { ok: true, dev: false };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function requireAdmin(): Promise<{ ok: boolean; dev: boolean }> {
  if (isDevMode()) return { ok: true, dev: true };
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || !process.env.ADMIN_PIN || !verifyToken(token, process.env.ADMIN_PIN)) {
    return { ok: false, dev: false };
  }
  return { ok: true, dev: false };
}