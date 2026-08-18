import type { Capability } from "./roles";

/**
 * Route prefixes that need a capability beyond simply being signed in.
 *
 * Derived from the same CAPABILITY_MATRIX the pages use, so middleware and page
 * guards cannot disagree about who may open what. Longest prefix wins, so
 * /dashboard/users is matched before any broader /dashboard rule would be.
 */
export const ROUTE_CAPABILITIES: ReadonlyArray<{ prefix: string; capability: Capability }> = [
  { prefix: "/dashboard/users", capability: "users.manage" },
  { prefix: "/dashboard/enquiries", capability: "enquiries.read" },
  { prefix: "/dashboard/insights", capability: "assistant.insights" },
  // Listed before the broader /admin rule for readability only — the sort below
  // is what actually makes the longer prefix win, so results publishing does
  // not require the Marketing Studio capability.
  { prefix: "/admin/results", capability: "results.publish" },
  { prefix: "/admin", capability: "marketing.studio" },
  { prefix: "/placement-portal/admin", capability: "exams.create" },
  { prefix: "/placement-portal/review", capability: "exams.review" },
  { prefix: "/placement-portal/analytics", capability: "exams.review" },
];

/** The capability a path requires, or null when signing in is enough. */
export function requiredCapability(pathname: string): Capability | null {
  const match = ROUTE_CAPABILITIES.filter(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return match?.capability ?? null;
}
