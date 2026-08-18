import { describe, expect, it } from "vitest";
import { daysUntil, rankOpportunities, scoreOpportunity } from "./score";
import type { OpportunityRecord } from "./types";

const NOW = new Date("2026-08-15T00:00:00Z");

function record(overrides: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Software Engineering Intern",
    organization: "Example Corp",
    kind: "internship",
    applyUrl: "https://boards.greenhouse.io/example/jobs/1",
    deadline: "2026-09-15",
    skills: ["python", "backend"],
    status: "verified",
    sourceTier: "official",
    trustScore: 0,
    signals: [],
    discoveredAt: "2026-08-14T00:00:00Z",
    ...overrides,
  };
}

describe("daysUntil", () => {
  it("returns null when there is no deadline", () => {
    expect(daysUntil(null, NOW)).toBeNull();
  });

  it("counts whole days to the deadline", () => {
    expect(daysUntil("2026-08-18", NOW)).toBe(3);
  });

  it("counts a deadline of today as zero days, not one", () => {
    expect(daysUntil("2026-08-15", NOW)).toBe(0);
  });

  it("returns a negative count for a passed deadline", () => {
    expect(daysUntil("2026-08-10", NOW)).toBeLessThan(0);
  });
});

describe("scoreOpportunity", () => {
  it("scores a matching, urgent, official posting near the top", () => {
    const score = scoreOpportunity(record({ deadline: "2026-08-17" }), { department: "CSE" }, NOW);

    expect(score.total).toBeGreaterThan(70);
    expect(score.breakdown.source).toBe(25);
    expect(score.breakdown.urgency).toBe(20);
  });

  it("gives an aggregator listing less source credit than an official one", () => {
    const official = scoreOpportunity(record(), { department: "CSE" }, NOW);
    const aggregated = scoreOpportunity(record({ sourceTier: "aggregator" }), { department: "CSE" }, NOW);

    expect(aggregated.total).toBeLessThan(official.total);
  });

  it("awards no profile points when the department does not match", () => {
    const score = scoreOpportunity(record(), { department: "Civil" }, NOW);

    expect(score.breakdown.profile).toBe(0);
  });

  it("awards profile points for a department keyword in the title", () => {
    const score = scoreOpportunity(
      record({ title: "Structural Engineering Intern", skills: ["autocad"] }),
      { department: "Civil" },
      NOW
    );

    expect(score.breakdown.profile).toBeGreaterThan(0);
    expect(score.reasons).toContain("Matches Civil");
  });

  it("caps profile points so a keyword-stuffed posting cannot dominate", () => {
    const score = scoreOpportunity(
      record({ skills: ["python", "java", "web", "cloud", "devops", "backend", "frontend"] }),
      { department: "CSE" },
      NOW
    );

    expect(score.breakdown.profile).toBe(30);
  });

  it("never exceeds 100", () => {
    const score = scoreOpportunity(
      record({ deadline: "2026-08-16", skills: ["python", "java", "web"] }),
      { department: "CSE" },
      NOW
    );

    expect(score.total).toBeLessThanOrEqual(100);
  });

  it("handles a student with no department without throwing", () => {
    const score = scoreOpportunity(record(), { department: null }, NOW);

    expect(score.breakdown.profile).toBe(0);
    expect(score.total).toBeGreaterThan(0);
  });

  it("says when something closes today", () => {
    const score = scoreOpportunity(record({ deadline: "2026-08-15" }), { department: "CSE" }, NOW);

    expect(score.reasons).toContain("Closes today");
  });
});

describe("rankOpportunities", () => {
  it("puts the sooner deadline first when everything else is equal", () => {
    const soon = record({ id: "soon", deadline: "2026-08-18" });
    const later = record({ id: "later", deadline: "2026-11-30" });

    const ranked = rankOpportunities([later, soon], { department: "CSE" }, NOW);

    expect(ranked[0].opportunity.id).toBe("soon");
  });

  it("ranks a department match above a non-match with the same deadline", () => {
    const match = record({ id: "match", title: "Backend Developer Intern" });
    const other = record({ id: "other", title: "Structural Site Trainee", skills: [] });

    const ranked = rankOpportunities([other, match], { department: "CSE" }, NOW);

    expect(ranked[0].opportunity.id).toBe("match");
  });

  it("returns an empty array for no input", () => {
    expect(rankOpportunities([], { department: "CSE" }, NOW)).toEqual([]);
  });
});
