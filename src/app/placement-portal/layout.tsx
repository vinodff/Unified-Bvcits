import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { PortalShell } from "@/components/placement/PortalShell";

export const dynamic = "force-dynamic";

/**
 * Placement Portal shell. Signed-in users get role-aware nav; anonymous
 * visitors see the public landing only. The nav itself (and whether to show
 * it at all) is decided in PortalShell, a client component, because it needs
 * to know the current route to hide everything during an active exam.
 */
export default async function PlacementPortalLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();

  const nav: { href: string; label: string }[] = [];
  if (user) nav.push({ href: "/placement-portal/exams", label: "Exam Dashboard" });
  if (user && user.role === "student") nav.push({ href: "/placement-portal/exams", label: "My Exams" });
  if (user && can(user.role, "exams.create")) nav.push({ href: "/placement-portal/admin", label: "Admin Console" });
  if (user && can(user.role, "exams.review")) {
    nav.push({ href: "/placement-portal/review", label: "Review Workspace" });
    nav.push({ href: "/placement-portal/analytics", label: "Analytics" });
  }

  return (
    <PortalShell isSignedIn={Boolean(user)} role={user?.role ?? null} nav={nav}>
      {children}
    </PortalShell>
  );
}