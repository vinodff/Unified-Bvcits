import { describe, expect, it } from "vitest";
import {
  canonicalizeUrl,
  contentFingerprint,
  isDeadlineSane,
  urlFingerprint,
  verifyCandidate,
} from "./verify";
import type { OpportunityCandidate } from "./types";

const NOW = new Date("2026-08-15T00:00:00Z");

function candidate(overrides: Partial<OpportunityCandidate> = {}): OpportunityCandidate {
  return {
    title: "Software Engineering Intern",
    organization: "Example Corp",
    kind: "internship",
    applyUrl: "https://boards.greenhouse.io/example/jobs/1234",
    deadline: "2026-09-30",
    description: "Twelve-week internship for final-year students.",
    // A real posting states where it is, and since region.ts was added a
    // location-less row is held for review rather than published. These cases
    // are about trust and seniority, so the fixture states a location to keep
    // the region gate out of what they are measuring — the gate has its own
    // suite in region.test.ts.
    location: "Bengaluru, India",
    ...overrides,
  };
}

describe("canonicalizeUrl", () => {
  it("strips tracking parameters, www, trailing slash and fragment", () => {
    const url = "HTTPS://WWW.Example.com/jobs/12/?utm_source=linkedin&id=7#apply";

    expect(canonicalizeUrl(url)).toBe("example.com/jobs/12?id=7");
  });

  it("collapses the same posting reached by three different links", () => {
    const a = canonicalizeUrl("https://careers.google.com/jobs/99?utm_campaign=x");
    const b = canonicalizeUrl("http://www.careers.google.com/jobs/99/");
    const c = canonicalizeUrl("https://careers.google.com/jobs/99#content");

    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("returns null for a non-http scheme", () => {
    expect(canonicalizeUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalizeUrl("mailto:hr@example.com")).toBeNull();
    expect(canonicalizeUrl("not a url")).toBeNull();
  });

  it("keeps distinct postings distinct", () => {
    expect(urlFingerprint("https://example.com/jobs/1")).not.toBe(
      urlFingerprint("https://example.com/jobs/2")
    );
  });
});

describe("contentFingerprint", () => {
  it("matches the same drive titled differently across two boards", () => {
    const a = contentFingerprint("Google STEP Internship 2026", "Google");
    const b = contentFingerprint("google step internship — Apply Now", "Google");

    expect(a).toBe(b);
  });

  it("does not merge two different programmes from one organisation", () => {
    expect(contentFingerprint("STEP Internship", "Google")).not.toBe(
      contentFingerprint("Summer of Code", "Google")
    );
  });
});

describe("isDeadlineSane", () => {
  it("accepts a missing deadline", () => {
    expect(isDeadlineSane(null, NOW)).toBe(true);
  });

  it("rejects a deadline that has already passed", () => {
    expect(isDeadlineSane("2026-08-14", NOW)).toBe(false);
  });

  it("accepts today", () => {
    expect(isDeadlineSane("2026-08-15", NOW)).toBe(true);
  });

  it("rejects an implausibly distant deadline", () => {
    expect(isDeadlineSane("2029-01-01", NOW)).toBe(false);
  });

  it("rejects an unparseable date", () => {
    expect(isDeadlineSane("someday", NOW)).toBe(false);
  });
});

describe("verifyCandidate", () => {
  it("verifies a reachable posting on an applicant tracking system", () => {
    const result = verifyCandidate(candidate(), { now: NOW, reachability: "ok" });

    expect(result.status).toBe("verified");
    expect(result.sourceTier).toBe("official");
    expect(result.signals).toEqual([]);
  });

  it("rejects a link shortener even when everything else looks fine", () => {
    const result = verifyCandidate(candidate({ applyUrl: "https://bit.ly/3xYz" }), {
      now: NOW,
      reachability: "ok",
    });

    expect(result.status).toBe("rejected");
    expect(result.sourceTier).toBe("blocked");
  });

  it("rejects a WhatsApp group used as the application route", () => {
    const result = verifyCandidate(
      candidate({ applyUrl: "https://chat.whatsapp.com/ABCdef123" }),
      { now: NOW, reachability: "ok" }
    );

    expect(result.status).toBe("rejected");
  });

  it("rejects an advance-fee posting", () => {
    const result = verifyCandidate(
      candidate({
        description: "Selected candidates must pay a registration fee of Rs 999 to confirm.",
      }),
      { now: NOW, reachability: "ok" }
    );

    expect(result.status).toBe("rejected");
    expect(result.signals[0]).toMatch(/fee or deposit/);
  });

  it("rejects a posting that asks for bank or Aadhaar details up front", () => {
    const result = verifyCandidate(
      candidate({ description: "Share your Aadhaar and bank account number to register." }),
      { now: NOW, reachability: "ok" }
    );

    expect(result.status).toBe("rejected");
    expect(result.signals[0]).toMatch(/credentials/);
  });

  it("rejects a guaranteed-placement claim", () => {
    const result = verifyCandidate(
      candidate({ title: "100% guaranteed job — no interview required" }),
      { now: NOW, reachability: "ok" }
    );

    expect(result.status).toBe("rejected");
  });

  it("rejects a posting whose apply URL is dead", () => {
    const result = verifyCandidate(candidate(), { now: NOW, reachability: "dead" });

    expect(result.status).toBe("rejected");
    expect(result.signals[0]).toMatch(/dead or returned a server error/);
  });

  // Regression: the first live run rejected a real Cummins scholarship page
  // because the site answered our bot with 403. A server that says "no" to a
  // crawler is not a dead link, and treating it as one threw away exactly the
  // official sources this pipeline exists to find.
  it("still publishes an official posting whose site blocks bots", () => {
    const result = verifyCandidate(candidate(), { now: NOW, reachability: "blocked" });

    expect(result.status).toBe("verified");
    expect(result.signals.join(" ")).toMatch(/bot protection/);
  });

  it("holds an unchecked posting at pending rather than publishing it", () => {
    const result = verifyCandidate(candidate(), { now: NOW });

    expect(result.status).toBe("pending");
  });

  it("holds an unknown domain at pending instead of rejecting it", () => {
    const result = verifyCandidate(
      candidate({ applyUrl: "https://some-startup-careers.xyz/apply" }),
      { now: NOW, reachability: "ok" }
    );

    expect(result.status).toBe("pending");
    expect(result.sourceTier).toBe("unknown");
  });

  it("publishes an aggregator listing but flags it as second-hand", () => {
    const result = verifyCandidate(
      candidate({ applyUrl: "https://internshala.com/internship/detail/abc-123" }),
      { now: NOW, reachability: "ok", corroborations: 1 }
    );

    expect(result.status).toBe("verified");
    expect(result.sourceTier).toBe("aggregator");
    expect(result.signals.join(" ")).toMatch(/second-hand/);
  });

  // Regression: the second live run published "Principal Software Engineer —
  // Site Reliability" and "Sr. AI Engineer" to a student board. Both were real,
  // official and open — trustworthy, and useless to a student.
  it("rejects a senior role even from an official source", () => {
    for (const title of [
      "Senior Software Engineer, Enterprise",
      "Principal Software Engineer - Site Reliability",
      "Sr. AI Engineer",
      "Engineering Manager, Payments",
    ]) {
      const result = verifyCandidate(candidate({ title, kind: "job" }), {
        now: NOW,
        reachability: "ok",
      });

      expect(result.status, title).toBe("rejected");
      expect(result.signals[0]).toMatch(/student-level/);
    }
  });

  it("rejects a role demanding several years of experience", () => {
    const result = verifyCandidate(
      candidate({
        title: "Backend Engineer",
        kind: "job",
        eligibility: "Requires 5+ years of experience building distributed systems.",
      }),
      { now: NOW, reachability: "ok" }
    );

    expect(result.status).toBe("rejected");
  });

  it("keeps an internship whose title happens to contain a seniority word", () => {
    const result = verifyCandidate(
      candidate({ title: "Lead Generation Intern", kind: "internship" }),
      { now: NOW, reachability: "ok" }
    );

    expect(result.status).toBe("verified");
  });

  it("does not apply the seniority rule to hackathons or scholarships", () => {
    for (const kind of ["hackathon", "scholarship"] as const) {
      const result = verifyCandidate(
        candidate({ title: "Principal's Excellence Challenge", kind }),
        { now: NOW, reachability: "ok" }
      );

      expect(result.status, kind).toBe("verified");
    }
  });

  it("keeps an ordinary job title with no seniority signal", () => {
    const result = verifyCandidate(candidate({ title: "Software Engineer", kind: "job" }), {
      now: NOW,
      reachability: "ok",
    });

    expect(result.status).toBe("verified");
  });

  it("rejects a posting located outside India", () => {
    const result = verifyCandidate(
      candidate({ title: "Software Engineer Intern", location: "Santa Clara, California" }),
      { now: NOW, reachability: "ok" }
    );

    expect(result.status).toBe("rejected");
    expect(result.signals.join(" ")).toContain("outside India");
  });

  it("holds a posting that never stated a location", () => {
    // Not rejected: it may well be Indian, and dropping it on a formatting
    // quirk would lose a real opportunity. A human decides instead.
    const result = verifyCandidate(candidate({ location: null }), { now: NOW, reachability: "ok" });

    expect(result.status).toBe("pending");
  });

  it("publishes an online hackathon regardless of where the organiser sits", () => {
    const result = verifyCandidate(
      candidate({ kind: "hackathon", title: "Global AI Hackathon", location: "Online", applyUrl: "https://devpost.com/h/1" }),
      { now: NOW, reachability: "ok" }
    );

    expect(result.status).toBe("verified");
  });

  it("rejects an expired posting before any other check can pass it", () => {
    const result = verifyCandidate(candidate({ deadline: "2026-01-01" }), {
      now: NOW,
      reachability: "ok",
    });

    expect(result.status).toBe("rejected");
  });
});
