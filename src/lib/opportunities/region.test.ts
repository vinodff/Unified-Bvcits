import { describe, expect, test } from "vitest";
import { classifyRegion, regionVerdict } from "./region";
import type { OpportunityCandidate } from "./types";

function candidate(overrides: Partial<OpportunityCandidate> = {}): OpportunityCandidate {
  return {
    title: "Software Engineering Intern",
    organization: "Example Corp",
    kind: "internship",
    applyUrl: "https://boards.greenhouse.io/example/jobs/1",
    ...overrides,
  };
}

describe("classifyRegion", () => {
  test.each([
    "Bengaluru, Karnataka, India",
    "Bangalore",
    "Hyderabad, Telangana",
    "Chennai",
    "Pune, Maharashtra",
    "Gurugram",
    "Noida, Uttar Pradesh",
    "Visakhapatnam, Andhra Pradesh",
    "Kochi, Kerala",
  ])("reads %j as India", (location) => {
    expect(classifyRegion(candidate({ location }))).toBe("india");
  });

  test.each([
    "Santa Clara, California",
    "Menlo Park, CA, United States",
    "Seattle, WA",
    "London, United Kingdom",
    "Dublin, Ireland",
    "Singapore",
    "Tel Aviv, Israel",
    "Toronto, Canada",
  ])("reads %j as foreign", (location) => {
    expect(classifyRegion(candidate({ location }))).toBe("foreign");
  });

  test.each(["Remote", "Online", "Worldwide", "Virtual event"])("reads %j as global", (location) => {
    expect(classifyRegion(candidate({ location }))).toBe("global");
  });

  test.each([
    // The state carries the row when the town is not on any list.
    "Kanpur, Uttar Pradesh",
    "Kakinada, Andhra Pradesh",
    "Vellore, Tamil Nadu",
    "Bhubaneswar, Odisha",
    "Indore, Madhya Pradesh",
  ])("reads %j as India via its state or second-tier city", (location) => {
    expect(classifyRegion(candidate({ location }))).toBe("india");
  });

  test("an ISO country code alone is not read as Indian", () => {
    // discover.ts expands addressCountry before this ever sees it; matching a
    // bare \bIN\b here would hit the English preposition on every page.
    expect(classifyRegion(candidate({ location: "Raleigh, NC, IN" }))).not.toBe("india");
  });

  test("a US city that shares its name with an Indian one is not claimed", () => {
    expect(classifyRegion(candidate({ location: "Salem, Oregon" }))).not.toBe("india");
  });

  test("no location at all is unknown, not foreign", () => {
    expect(classifyRegion(candidate({ location: null }))).toBe("unknown");
  });

  test("India wins when a posting lists both countries", () => {
    // A multi-site req is still applicable here; ordering the other way round
    // rejected genuinely Indian roles at global companies.
    expect(classifyRegion(candidate({ location: "London, UK / Bengaluru, India" }))).toBe("india");
  });

  test("looks beyond the location field", () => {
    expect(
      classifyRegion(candidate({ location: null, description: "Join our Hyderabad engineering team." }))
    ).toBe("india");
  });

  test("both spellings of renamed cities are recognised", () => {
    expect(classifyRegion(candidate({ location: "Bengaluru" }))).toBe("india");
    expect(classifyRegion(candidate({ location: "Bangalore" }))).toBe("india");
    expect(classifyRegion(candidate({ location: "Gurgaon" }))).toBe("india");
    expect(classifyRegion(candidate({ location: "Gurugram" }))).toBe("india");
  });
});

describe("regionVerdict — jobs and internships", () => {
  test("an Indian role is published", () => {
    const verdict = regionVerdict(candidate({ location: "Bengaluru, India" }));
    expect(verdict.acceptable).toBe(true);
    expect(verdict.needsReview).toBe(false);
  });

  test.each(["job", "internship"] as const)("a foreign %s is rejected outright", (kind) => {
    const verdict = regionVerdict(candidate({ kind, location: "Santa Clara, California" }));
    expect(verdict.acceptable).toBe(false);
    expect(verdict.signal).toContain("outside India");
  });

  test("this is the exact case that motivated the gate", () => {
    // Real rows from a live run: trustworthy, student-level, and unusable.
    const nvidia = regionVerdict(
      candidate({ title: "NVIDIA 2027 Internships: Software Engineering", location: "Santa Clara, CA" })
    );
    const fedex = regionVerdict(
      candidate({ kind: "job", title: "ACE Graduate Trainee", location: "Memphis, Tennessee" })
    );
    expect(nvidia.acceptable).toBe(false);
    expect(fedex.acceptable).toBe(false);
  });

  test("a location-less job is held for review, never dropped", () => {
    const verdict = regionVerdict(candidate({ location: null }));
    expect(verdict.acceptable).toBe(true);
    expect(verdict.needsReview).toBe(true);
  });

  test("a bare 'Remote' job is held rather than published", () => {
    // Remote almost always means remote-within-one-country.
    const verdict = regionVerdict(candidate({ location: "Remote" }));
    expect(verdict.needsReview).toBe(true);
  });

  test("remote in India is published outright", () => {
    expect(regionVerdict(candidate({ location: "Remote, India" })).needsReview).toBe(false);
  });
});

describe("regionVerdict — participation kinds", () => {
  test.each(["hackathon", "competition", "webinar", "workshop", "ambassador"] as const)(
    "an online %s is published wherever the organiser is",
    (kind) => {
      const verdict = regionVerdict(candidate({ kind, location: "Online" }));
      expect(verdict.acceptable).toBe(true);
      expect(verdict.needsReview).toBe(false);
    }
  );

  test("a hackathon with no stated location is still published", () => {
    // Unlike a job: there is nothing to lose by listing an online-ish event.
    const verdict = regionVerdict(candidate({ kind: "hackathon", location: null }));
    expect(verdict.acceptable).toBe(true);
    expect(verdict.needsReview).toBe(false);
  });

  test("an in-person foreign hackathon is still rejected", () => {
    const verdict = regionVerdict(candidate({ kind: "hackathon", location: "San Francisco, CA" }));
    expect(verdict.acceptable).toBe(false);
  });

  test("an Indian hackathon is published", () => {
    expect(regionVerdict(candidate({ kind: "hackathon", location: "Bengaluru" })).acceptable).toBe(true);
  });
});

describe("regionVerdict — money kinds are location-bound", () => {
  test.each(["scholarship", "fellowship"] as const)("a foreign %s is rejected", (kind) => {
    expect(regionVerdict(candidate({ kind, location: "United Kingdom" })).acceptable).toBe(false);
  });

  test("an Indian scholarship is published", () => {
    const verdict = regionVerdict(
      candidate({ kind: "scholarship", title: "AICTE Pragati Scholarship", location: "India" })
    );
    expect(verdict.acceptable).toBe(true);
    expect(verdict.needsReview).toBe(false);
  });
});
