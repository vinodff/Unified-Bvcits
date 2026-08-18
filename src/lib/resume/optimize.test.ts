import { describe, expect, it } from "vitest";
import { mergeModelRewrite, optimizeDeterministically } from "./rewrite";
import { emptySections } from "./types";
import type { ResumeSections } from "./types";

function sections(overrides: Partial<ResumeSections> = {}): ResumeSections {
  return { ...emptySections(), ...overrides };
}

const ORIGINAL = sections({
  contact: { fullName: "Jane Doe", email: "jane@example.com", phone: "9999999999", location: "Amalapuram" },
  summary: "CSE student.",
  education: [{ institution: "BVCITS", degree: "B.Tech CSE", years: "2022 – 2026", detail: "" }],
  experience: [{ organization: "Acme", role: "Intern", years: "2025", bullets: ["Worked on the backend"] }],
  skills: ["python", "django"],
});

describe("mergeModelRewrite — fabrication guards", () => {
  it("ignores a fabricated employer and keeps the original organization", () => {
    const merged = mergeModelRewrite(ORIGINAL, {
      experience: [{ organization: "Google", role: "Senior Engineer", years: "2020 – 2024", bullets: ["Did things"] }],
    });
    expect(merged.experience[0].organization).toBe("Acme");
    expect(merged.experience[0].role).toBe("Intern");
    expect(merged.experience[0].years).toBe("2025");
  });

  it("ignores a fabricated degree and institution", () => {
    const merged = mergeModelRewrite(ORIGINAL, {
      education: [{ institution: "IIT Bombay", degree: "M.Tech", years: "2019", detail: "Gold medallist" }],
    });
    expect(merged.education[0].institution).toBe("BVCITS");
    expect(merged.education[0].degree).toBe("B.Tech CSE");
  });

  it("drops skills the student never listed", () => {
    const merged = mergeModelRewrite(ORIGINAL, { skills: ["python", "kubernetes", "aws", "django"] });
    expect(merged.skills).toEqual(expect.arrayContaining(["python", "django"]));
    expect(merged.skills).not.toContain("kubernetes");
    expect(merged.skills).not.toContain("aws");
  });

  it("cannot add experience entries beyond the original count", () => {
    const merged = mergeModelRewrite(ORIGINAL, {
      experience: [
        { bullets: ["Rewritten bullet"] },
        { organization: "Invented Corp", bullets: ["Never happened"] },
      ],
    });
    expect(merged.experience).toHaveLength(1);
  });

  it("does accept a rewritten bullet for an existing entry", () => {
    const merged = mergeModelRewrite(ORIGINAL, {
      experience: [{ bullets: ["Built a Django REST API serving 5,000 requests/day"] }],
    });
    expect(merged.experience[0].bullets[0]).toContain("Django REST API");
  });

  it("falls back to the original bullets when the model returns none", () => {
    const merged = mergeModelRewrite(ORIGINAL, { experience: [{ bullets: [] }] });
    expect(merged.experience[0].bullets).toEqual(["Worked on the backend"]);
  });

  it("never lets the model rewrite contact details", () => {
    const merged = mergeModelRewrite(ORIGINAL, {
      contact: { fullName: "Someone Else", email: "attacker@evil.com", phone: "0000000000", location: "" },
    });
    expect(merged.contact.email).toBe("jane@example.com");
    expect(merged.contact.fullName).toBe("Jane Doe");
  });
});

describe("optimizeDeterministically", () => {
  it("moves job-relevant skills to the front without adding any", () => {
    const result = optimizeDeterministically(sections({ skills: ["excel", "python", "react"] }), {
      skills: ["react"],
      keywords: ["react"],
    });
    expect(result.skills[0]).toBe("react");
    expect(result.skills).toHaveLength(3);
  });

  it("writes a summary only from facts already on the resume", () => {
    const result = optimizeDeterministically(ORIGINAL, { skills: ["python"], keywords: ["python"] });
    expect(result.summary).toContain("B.Tech CSE");
    expect(result.summary).toContain("python");
  });

  it("leaves an existing substantial summary alone", () => {
    const withSummary = sections({ summary: "A detailed existing summary that is comfortably past the minimum length." });
    const result = optimizeDeterministically(withSummary, { skills: [], keywords: [] });
    expect(result.summary).toBe(withSummary.summary);
  });
});
