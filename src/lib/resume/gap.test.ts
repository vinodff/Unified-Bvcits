import { describe, expect, it } from "vitest";
import { analyzeGap, resumeSkillSet } from "./gap";
import { emptySections } from "./types";
import type { ResumeSections } from "./types";

function sections(overrides: Partial<ResumeSections> = {}): ResumeSections {
  return { ...emptySections(), ...overrides };
}

describe("resumeSkillSet", () => {
  it("includes explicitly listed skills", () => {
    expect(resumeSkillSet(sections({ skills: ["Python", "React"] }))).toEqual(
      expect.arrayContaining(["python", "react"])
    );
  });

  it("recognizes skills mentioned only inside experience bullets", () => {
    const result = resumeSkillSet(
      sections({
        experience: [{ organization: "Acme", role: "Intern", years: "2025", bullets: ["Built a REST API with Django and PostgreSQL"] }],
      })
    );
    expect(result).toEqual(expect.arrayContaining(["django", "postgresql", "rest api"]));
  });

  it("does not duplicate a skill mentioned in both the list and a bullet", () => {
    const result = resumeSkillSet(
      sections({
        skills: ["python"],
        experience: [{ organization: "Acme", role: "Intern", years: "2025", bullets: ["Wrote data pipelines in Python"] }],
      })
    );
    expect(result.filter((s) => s === "python")).toHaveLength(1);
  });
});

describe("analyzeGap", () => {
  it("splits requirement skills into matched and missing", () => {
    const result = analyzeGap(sections({ skills: ["python", "docker"] }), {
      skills: ["python", "docker", "kubernetes"],
      keywords: [],
    });
    expect(result.matchedSkills.sort()).toEqual(["docker", "python"]);
    expect(result.missingSkills).toEqual(["kubernetes"]);
  });

  it("reports every requirement as missing when the resume has no overlapping skills", () => {
    const result = analyzeGap(sections(), { skills: ["aws", "terraform"], keywords: [] });
    expect(result.matchedSkills).toEqual([]);
    expect(result.missingSkills.sort()).toEqual(["aws", "terraform"]);
  });

  it("reports nothing missing when the resume already covers every requirement", () => {
    const result = analyzeGap(sections({ skills: ["react", "typescript"] }), {
      skills: ["react", "typescript"],
      keywords: [],
    });
    expect(result.missingSkills).toEqual([]);
  });
});
