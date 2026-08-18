import { describe, expect, it } from "vitest";
import { rankSkillGaps, scoreResume } from "./scoring";
import { emptySections } from "./types";
import type { RequirementSet, ResumeSections } from "./types";

function sections(overrides: Partial<ResumeSections> = {}): ResumeSections {
  return { ...emptySections(), ...overrides };
}

const REQUIREMENTS: RequirementSet = { skills: ["python", "django", "postgresql"], keywords: ["python", "django", "postgresql"] };
const JD = "We need a backend intern strong in Python and Django, building REST APIs against PostgreSQL.";

const STRONG = sections({
  contact: { fullName: "Jane", email: "j@example.com", phone: "9999999999", location: "" },
  summary: "Backend-focused CSE student who builds REST APIs with Python and Django.",
  education: [{ institution: "BVCITS", degree: "B.Tech CSE", years: "2022 – 2026", detail: "" }],
  experience: [
    { organization: "Acme", role: "Backend Intern", years: "2025", bullets: ["Built a Django REST API serving 5,000 requests/day on PostgreSQL"] },
  ],
  skills: ["python", "django", "postgresql"],
});

describe("scoreResume", () => {
  it("scores an empty resume near zero", () => {
    expect(scoreResume(sections(), REQUIREMENTS, JD).overall).toBeLessThan(20);
  });

  it("scores a strong, well-targeted resume highly", () => {
    expect(scoreResume(STRONG, REQUIREMENTS, JD).overall).toBeGreaterThan(75);
  });

  it("is deterministic — the same input always scores the same", () => {
    expect(scoreResume(STRONG, REQUIREMENTS, JD)).toEqual(scoreResume(STRONG, REQUIREMENTS, JD));
  });

  it("penalises a resume whose bullets carry no numbers", () => {
    const vague = sections({ ...STRONG, experience: [{ organization: "Acme", role: "Intern", years: "2025", bullets: ["Worked on backend things"] }] });
    expect(scoreResume(vague, REQUIREMENTS, JD).subScores.impactLanguage).toBeLessThan(
      scoreResume(STRONG, REQUIREMENTS, JD).subScores.impactLanguage
    );
  });

  it("keeps every sub-score inside 0-100", () => {
    for (const resume of [sections(), STRONG]) {
      const { subScores, overall } = scoreResume(resume, REQUIREMENTS, JD);
      expect(overall).toBeGreaterThanOrEqual(0);
      expect(overall).toBeLessThanOrEqual(100);
      for (const value of Object.values(subScores)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("rankSkillGaps", () => {
  it("ranks a skill the posting repeats as critical", () => {
    const jd = "Docker experience required. You will use Docker daily. Strong Docker skills essential.";
    expect(rankSkillGaps(["docker"], jd)[0].severity).toBe("critical");
  });

  it("ranks a twice-mentioned skill as high", () => {
    expect(rankSkillGaps(["docker"], "Docker needed. Docker preferred.")[0].severity).toBe("high");
  });

  it("ranks a single mention as moderate", () => {
    expect(rankSkillGaps(["docker"], "Some Docker exposure is a plus.")[0].severity).toBe("moderate");
  });

  it("always explains the ranking rather than returning a bare label", () => {
    for (const gap of rankSkillGaps(["docker", "aws"], "Docker Docker Docker. AWS once.")) {
      expect(gap.reason.length).toBeGreaterThan(10);
    }
  });
});
