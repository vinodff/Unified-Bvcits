import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { can } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/**
 * Role gate for /admin.
 *
 * The middleware only proves a visitor is signed in — without this, ANY
 * authenticated account (a student, a parent) could open the Marketing Studio,
 * because its own `guard()` runs in DEV MODE whenever ADMIN_PIN is unset.
 *
 * When Supabase is not configured at all there are no accounts to check, so the
 * studio keeps its previous ADMIN_PIN behaviour and this layout stays out of
 * the way. Once auth exists, an admin role is required — see
 * `npm run grant-role` in docs/SUPABASE.md for creating the first one.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) return <>{children}</>;

  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/marketing-studio");

  /*
   * This gate answers "may you be under /admin at all?", not "may you open
   * THIS page?" — /admin now hosts two unrelated tools with different
   * capabilities (the Marketing Studio, and results publishing, which
   * management holds but does not pair with studio access). The per-route
   * capability is enforced in middleware via ROUTE_CAPABILITIES, before any
   * rendering, so it can return an honest status; this layer is defence in
   * depth for the service-role reads inside each page.
   *
   * notFound() rather than a 403: someone with no business here has no
   * business learning an admin area exists at this path either.
   */
  const mayEnterAdmin = can(user.role, "marketing.studio") || can(user.role, "results.publish");
  if (!mayEnterAdmin) notFound();

  return <>{children}</>;
}
