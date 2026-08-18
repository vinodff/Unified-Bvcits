import { describe, it, expect } from "vitest";
import { scanExistingRoutes } from "./seo-agent";

// Regression: the scan returned every top-level app directory, so generated
// articles were told to link to /admin, /dashboard and /login. Those are
// authenticated surfaces — publishing them as public "internal links"
// advertises the admin area to search engines and sends visitors to a wall.
describe("public route scan", () => {
  it("never offers an authenticated or non-public route", async () => {
    const routes = await scanExistingRoutes();
    for (const forbidden of ["/admin", "/dashboard", "/login", "/signup", "/api", "/placement-portal"]) {
      expect(routes).not.toContain(forbidden);
    }
  });

  it("still offers the real public pages", async () => {
    const routes = await scanExistingRoutes();
    expect(routes).toContain("/admissions");
    expect(routes).toContain("/departments");
    expect(routes.length).toBeGreaterThan(3);
  });

  it("excludes dynamic segments and route groups, which are not linkable URLs", async () => {
    const routes = await scanExistingRoutes();
    expect(routes.some((r) => r.includes("[") || r.includes("("))).toBe(false);
  });
});
