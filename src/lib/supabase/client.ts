// Supabase clients.
//
// Two clients, deliberately separated, because they carry very different
// authority:
//
//   publicClient — publishable key. Safe in the browser. RLS is on with no
//     policies, so this client can read nothing and write nothing directly.
//     Its entire surface is the two SECURITY DEFINER RPCs granted to `anon`
//     in supabase/migrations/0003_functions.sql.
//
//   adminClient — secret key. Bypasses RLS completely. Server-only. Importing
//     this into a client component would ship full database access to every
//     visitor, so the module throws if the secret key is missing rather than
//     silently degrading to a weaker client.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** True when the public client can be constructed. Callers degrade gracefully. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && publishableKey);
}

/** True when server-side writes are possible. */
export function isSupabaseAdminConfigured(): boolean {
  return Boolean(url && process.env.SUPABASE_SECRET_KEY);
}

let publicSingleton: SupabaseClient | null = null;

/**
 * Anon-scoped client. Returns null when unconfigured so a missing key degrades
 * the feature rather than crashing the page — the enquiry form and assistant
 * both still work without Supabase, they just stop persisting.
 */
export function getPublicClient(): SupabaseClient | null {
  if (!url || !publishableKey) return null;
  if (!publicSingleton) {
    publicSingleton = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return publicSingleton;
}

let adminSingleton: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — never import from a "use client" module.
 * Throws rather than returning null: a server route that needs admin access
 * cannot do anything useful without it, and a silent null would surface as a
 * confusing downstream type error instead of a clear configuration message.
 */
export function getAdminClient(): SupabaseClient {
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY. " +
        "Add them to .env.local — see docs/SUPABASE.md."
    );
  }

  if (!adminSingleton) {
    adminSingleton = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "public" },
    });
  }
  return adminSingleton;
}
