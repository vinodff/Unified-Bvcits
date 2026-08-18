import { describe, expect, it } from "vitest";
import { buildEvidenceReport } from "./evidence";
import { emptySections } from "./types";
import type { ResumeSections } from "./types";

function sections(overrides: Partial<ResumeSections> = {}): ResumeSections {
  return { ...emptySections(), ...overrides };
}

const ORIGINAL_TEXT = `Jane Doe
EXPERIENCE
Acme Corp - Backend Intern
- Built a Django REST API backed by PostgreSQL serving 5000 requests/day
SKILLS
Python, Django, PostgreSQL, Git, Linux, Docker`;

describe("buildEvidenceReport", () => {
  it("marks a skill demonstrated in a bullet as verified", () => {
    const report = buildEvidenceReport(sections({ skills: ["django"] }), ORIGINAL_TEXT, ["django"]);
    const item = report.items.find((i) => i.claim === "django");
    expect(item?.level).toBe("verified");
  });

  it("marks a skill that appears only in a bare list as partial", () => {
    const report = buildEvidenceReport(sections({ skills: ["git"] }), ORIGINAL_TEXT, ["git"]);
    const item = report.items.find((i) => i.claim === "git");
    expect(item?.level).toBe("partial");
  });

  it("marks a skill absent from the original as weak", () => {
    const report = buildEvidenceReport(sections({ skills: ["kubernetes"] }), ORIGINAL_TEXT, ["kubernetes"]);
    const item = report.items.find((i) => i.claim === "kubernetes");
    expect(item?.level).toBe("weak");
    expect(item?.detail).toContain("No mention");
  });

  it("surfaces an invented claim even when the job never asked for it", () => {
    // The safety property: a model that adds an unrelated skill must not be
    // able to hide it by virtue of the JD not mentioning it.
    const report = buildEvidenceReport(sections({ skills: ["kubernetes"] }), ORIGINAL_TEXT, ["python"]);
    expect(report.items.some((i) => i.claim === "kubernetes" && i.level === "weak")).toBe(true);
  });

  it("scores an entirely unbacked resume far below a fully backed one", () => {
    const backed = buildEvidenceReport(sections({ skills: ["django", "postgresql"] }), ORIGINAL_TEXT, ["django", "postgresql"]);
    const invented = buildEvidenceReport(sections({ skills: ["kubernetes", "terraform"] }), ORIGINAL_TEXT, ["kubernetes", "terraform"]);
    expect(backed.trustScore).toBeGreaterThan(invented.trustScore);
    expect(invented.trustScore).toBeLessThan(30);
  });

  it("lists the weakest claims first so they get attention", () => {
    const report = buildEvidenceReport(
      sections({ skills: ["django", "kubernetes"] }),
      ORIGINAL_TEXT,
      ["django", "kubernetes"]
    );
    expect(report.items[0].level).toBe("weak");
  });

  it("treats a resume claiming nothing as fully trusted rather than dividing by zero", () => {
    const report = buildEvidenceReport(sections(), ORIGINAL_TEXT, []);
    expect(report.trustScore).toBe(100);
  });
});
