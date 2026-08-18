import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/client";
import { isUserRole, type UserRole } from "./roles";

/**
 * Server-side Supabase client bound to the request's cookies.
 *
 * Marked `server-only` so importing it from a client component is a build
 * error rather than a runtime surprise — this module reads auth cookies.
 */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. The middleware refreshes
            // the session on every request, so a failure here is harmless —
            // it just means this particular render did not rotate the token.
          }
        },
      },
    }
  );
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  department: string | null;
  rollNumber: string | null;
  employeeId: string | null;
  organization: string | null;
  isActive: boolean;
}

/**
 * The signed-in user, or null.
 *
 * Uses `getUser()` rather than `getSession()`: getSession reads the cookie
 * without verifying it, so a forged cookie would be trusted. getUser
 * revalidates against the auth server, which is what any authorization
 * decision must be based on.
 *
 * The role comes from the `profiles` table, never from the JWT — a token is
 * issued at sign-in and would keep asserting a stale role after an admin
 * revoked it.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, department, roll_number, employee_id, organization, is_active")
    .eq("id", user.id)
    .maybeSingle();

  // A verified session with no profile row means the signup trigger did not
  // fire. Treat it as unauthenticated rather than inventing a default role.
  if (!profile) return null;

  // A deactivated account keeps a valid token until it expires; the profile
  // flag is what actually revokes access.
  if (profile.is_active !== true) return null;

  if (!isUserRole(profile.role)) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile.full_name ?? null,
    role: profile.role,
    department: profile.department ?? null,
    rollNumber: profile.roll_number ?? null,
    employeeId: profile.employee_id ?? null,
    organization: profile.organization ?? null,
    isActive: true,
  };
}

/**
 * Service-role client for operations the user's own session may not perform —
 * reading the enquiry inbox, changing another account's role.
 *
 * Callers MUST check the requester's capability first; this client bypasses
 * RLS entirely and performs no authorization of its own.
 */
export function getServiceClient(): SupabaseClient {
  return getAdminClient();
}
