// Server-side token storage (spec Section 24): tokens live ONLY in
// .data/marketing/tokens.json (gitignored) and are never exposed to the client.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Platform } from "../domain";

const TOKEN_FILE = path.join(process.cwd(), ".data", "marketing", "tokens.json");

export interface PlatformTokens {
  accessToken?: string;
  /** Instagram/Facebook: user/page id. LinkedIn: person or org urn/id. */
  accountId?: string;
  extra?: Record<string, string>;
}

type TokenMap = Partial<Record<Platform, PlatformTokens>>;

export async function readTokens(): Promise<TokenMap> {
  return fs.readFile(TOKEN_FILE, "utf8").then(JSON.parse).catch(() => ({})) as Promise<TokenMap>;
}

export async function writeTokens(map: TokenMap): Promise<void> {
  await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
  await fs.writeFile(TOKEN_FILE, JSON.stringify(map, null, 2));
}

export async function getToken(platform: Platform): Promise<PlatformTokens | null> {
  const map = await readTokens();
  return map[platform] ?? null;
}

export async function setToken(platform: Platform, tokens: PlatformTokens): Promise<void> {
  const map = await readTokens();
  map[platform] = tokens;
  await writeTokens(map);
}

export async function clearToken(platform: Platform): Promise<void> {
  const map = await readTokens();
  delete map[platform];
  await writeTokens(map);
}