import { describe, expect, it } from "vitest";
import { computeKeywordCoverage } from "./keyword-coverage";
import { emptySections } from "./types";
import type { ResumeSections } from "./types";

function sections(overrides: Partial<ResumeSections> = {}): ResumeSections {
  return { ...emptySections(), ...overrides };
}

describe("computeKeywordCoverage", () => {
  it("treats no keywords as full coverage rather than zero", () => {
    const result = computeKeywordCoverage(sections(), { skills: [], keywords: [] });
    expect(result.coveragePercent).toBe(100);
    expect(result.totalKeywords).toBe(0);
  });

  it("scores partial coverage and lists what's missing", () => {
    const result = computeKeywordCoverage(sections({ skills: ["python"] }), {
      skills: [],
      keywords: ["python", "docker", "kubernetes", "aws"],
    });
    expect(result.coveredKeywords).toBe(1);
    expect(result.coveragePercent).toBe(25);
    expect(result.missingKeywords.sort()).toEqual(["aws", "docker", "kubernetes"]);
  });

  it("finds a keyword mentioned only in a project bullet, not the skills list", () => {
    const result = computeKeywordCoverage(
      sections({ projects: [{ name: "Portfolio", stack: "", bullets: ["Deployed the app on AWS using Docker"] }] }),
      { skills: [], keywords: ["aws", "docker"] }
    );
    expect(result.coveragePercent).toBe(100);
  });

  it("scores full coverage when every keyword appears", () => {
    const result = computeKeywordCoverage(sections({ skills: ["react", "typescript"] }), {
      skills: [],
      keywords: ["react", "typescript"],
    });
    expect(result.coveragePercent).toBe(100);
    expect(result.missingKeywords).toEqual([]);
  });
});
