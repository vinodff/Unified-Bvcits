import { describe, expect, test } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { processQuery, welcomeReply } from "./engine";
import { EMPTY_CONTEXT } from "./types";
import { departmentList, deptSidebar, type SidebarNode } from "@/data/departments";

/**
 * Guards the promise that every link the assistant hands out actually resolves.
 *
 * The previous engine linked to /examinations/autonomous/results, which has no page in
 * this app. Next.js swallowed it with the [...slug] catch-all, so the user was shown a
 * "this content is being migrated" stub instead of their results — a dead end that looked
 * like a working answer. These tests make that failure mode impossible to reintroduce.
 */

const APP_DIR = join(process.cwd(), "src", "app");

/** Walks src/app and collects every concrete (non-dynamic) route. */
function collectStaticRoutes(dir: string, prefix = ""): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) {
      if (entry === "page.tsx") routes.push(prefix || "/");
      continue;
    }
    // Route groups "(x)" do not add a path segment; dynamic segments are handled below.
    if (entry.startsWith("(") || entry.startsWith("[") || entry === "api") continue;
    routes.push(...collectStaticRoutes(full, `${prefix}/${entry}`));
  }
  return routes;
}

function collectSectionSlugs(nodes: SidebarNode[]): string[] {
  const slugs: string[] = [];
  for (const node of nodes) {
    if (node.slug) slugs.push(node.slug);
    if (node.children) slugs.push(...collectSectionSlugs(node.children));
  }
  return slugs;
}

const STATIC_ROUTES = new Set(collectStaticRoutes(APP_DIR));
const DEPT_SLUGS = new Set(departmentList.map((d) => d.slug));
const SECTION_SLUGS = new Set(collectSectionSlugs(deptSidebar));

function isValidInternalLink(href: string): boolean {
  const path = href.split("#")[0].split("?")[0].replace(/\/$/, "") || "/";
  if (STATIC_ROUTES.has(path)) return true;

  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "departments") return false;
  if (parts.length === 2) return DEPT_SLUGS.has(parts[1]);
  if (parts.length === 3) return DEPT_SLUGS.has(parts[1]) && SECTION_SLUGS.has(parts[2]);
  return false;
}

/** Pulls every href out of a reply: markdown links, card payloads, secondary links. */
function extractHrefs(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    for (const match of value.matchAll(/\]\(([^)]+)\)/g)) found.push(match[1]);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) extractHrefs(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if ((key === "href" || key === "directCallHref") && typeof inner === "string") {
        found.push(inner);
        continue;
      }
      extractHrefs(inner, found);
    }
  }
  return found;
}

/** Broad sweep of the questions a visitor actually asks. */
const QUERIES = [
  "fee structure", "mba fee", "mca fee", "cse fee", "hostel fee",
  "cse hod", "ece hod", "eee hod", "mech hod", "civil hod", "mba hod", "mca hod", "aiml hod",
  "book appointment", "placements", "which companies recruit",
  "how to get admission", "counselling code", "bus routes", "hostel",
  "exam results", "exam timetable", "syllabus", "cse syllabus",
  "cse faculty", "ece faculty", "how many seats in cse", "what courses are offered",
  "where is the college", "naac accreditation", "library", "contact number",
  "ఫీజు ఎంత", "ప్లేస్‌మెంట్స్", "అడ్మిషన్ ఎలా", "బస్సు రూట్లు", "హాస్టల్",
  "qwerty gibberish",
];

describe("every link the assistant returns resolves", () => {
  test.each(QUERIES)("'%s' produces only valid links", (query) => {
    const { reply } = processQuery(query, EMPTY_CONTEXT);
    const hrefs = extractHrefs(reply);

    for (const href of hrefs) {
      if (href.startsWith("tel:") || href.startsWith("mailto:")) continue;
      if (href.startsWith("https://")) {
        // External links must be BVCITS-owned, never an arbitrary host.
        expect(href).toMatch(/^https:\/\/([a-z]+\.)?bvcits\.edu\.in\//);
        continue;
      }
      expect(isValidInternalLink(href), `${query} → dead internal link ${href}`).toBe(true);
    }
  });

  test("the welcome message links are valid too", () => {
    for (const href of extractHrefs(welcomeReply())) {
      if (href.startsWith("tel:") || href.startsWith("https://")) continue;
      expect(isValidInternalLink(href)).toBe(true);
    }
  });

  test("route fixtures were actually discovered (guards a silent empty sweep)", () => {
    expect(STATIC_ROUTES.size).toBeGreaterThan(5);
    expect(DEPT_SLUGS.size).toBeGreaterThanOrEqual(10);
    expect(SECTION_SLUGS.size).toBeGreaterThan(10);
    expect(STATIC_ROUTES.has("/admissions")).toBe(true);
    expect(STATIC_ROUTES.has("/placements-cell")).toBe(true);
  });

  test("at least one link is offered for the common questions", () => {
    for (const query of ["fee structure", "placements", "exam results", "cse hod"]) {
      const { reply } = processQuery(query, EMPTY_CONTEXT);
      expect(extractHrefs(reply).length, `${query} offered no link`).toBeGreaterThan(0);
    }
  });
});
