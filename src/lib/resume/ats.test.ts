import { describe, expect, it } from "vitest";
import { checkAts } from "./ats";
import { emptySections } from "./types";
import type { ResumeSections } from "./types";

function sections(overrides: Partial<ResumeSections> = {}): ResumeSections {
  return { ...emptySections(), ...overrides };
}

describe("checkAts", () => {
  it("scores an empty resume poorly and lists every gap", () => {
    const result = checkAts(sections());
    expect(result.score).toBeLessThan(50);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("email"),
        expect.stringContaining("summary"),
        expect.stringContaining("education"),
        expect.stringContaining("experience or project"),
        expect.stringContaining("skills list"),
      ])
    );
  });

  it("scores a complete resume at 100 with no issues", () => {
    const complete = sections({
      contact: { fullName: "A", email: "a@example.com", phone: "9999999999", location: "Amalapuram" },
      summary: "Final-year CSE student focused on backend development and distributed systems.",
      education: [{ institution: "BVCITS", degree: "B.Tech CSE", years: "2022 – 2026", detail: "" }],
      experience: [
        { organization: "Acme", role: "Intern", years: "2025", bullets: ["Built and deployed a REST API serving 10k requests/day using Django and PostgreSQL."] },
      ],
      skills: ["python", "django", "postgresql"],
    });
    const result = checkAts(complete);
    expect(result.score).toBe(100);
    expect(result.issues).toEqual([]);
  });

  it("flags an entry with no bullet points even if other sections are complete", () => {
    const complete = sections({
      contact: { fullName: "A", email: "a@example.com", phone: "9999999999", location: "" },
      summary: "Final-year CSE student focused on backend development and distributed systems.",
      education: [{ institution: "BVCITS", degree: "B.Tech CSE", years: "2022 – 2026", detail: "" }],
      experience: [{ organization: "Acme", role: "Intern", years: "2025", bullets: [] }],
      skills: ["python"],
    });
    const result = checkAts(complete);
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining("no bullet points")]));
  });

  it("never returns a negative score", () => {
    const result = checkAts(sections());
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
