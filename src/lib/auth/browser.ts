"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Browser Supabase client, used only for sign-in, sign-up and sign-out.
 *
 * It carries the publishable key, so it can read nothing it is not entitled to
 * — every table is behind RLS. Page data is fetched in Server Components with
 * the request-bound client instead, which keeps the authorization decision on
 * the server where it cannot be skipped.
 */
export function getBrowserClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
  }
  return client;
}
