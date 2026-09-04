import { describe, expect, test } from "vitest";
import {
  FAILURE_LIMIT,
  extractValidThrough,
  findTombstone,
  judge,
  nextFailureCount,
  shouldRetire,
  visibleText,
  type ProbeOutcome,
} from "./liveness";

const NOW = new Date("2026-09-04T10:00:00.000Z");

/** A live page: 200, real content, nothing expiring. */
function live(overrides: Partial<ProbeOutcome> = {}): ProbeOutcome {
  return {
    status: 200,
    html: "<html><body><h1>Software Engineering Intern</h1><p>Apply now.</p></body></html>",
    hostSoft404s: null,
    ...overrides,
  };
}

function jsonLd(validThrough: string): string {
  return `<html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"JobPosting","title":"Intern","validThrough":"${validThrough}"}
  </script></head><body>Intern</body></html>`;
}

describe("validThrough extraction", () => {
  test("reads validThrough from a JobPosting block", () => {
    expect(extractValidThrough(jsonLd("2026-07-31"))).toBe("2026-07-31");
  });

  test("finds it inside an @graph wrapper", () => {
    const html = `<script type="application/ld+json">
      {"@graph":[{"@type":"Organization","name":"Acme"},
                 {"@type":"JobPosting","validThrough":"2026-01-01"}]}
    </script>`;
    expect(extractValidThrough(html)).toBe("2026-01-01");
  });

  test("finds it inside a top-level array", () => {
    const html = `<script type="application/ld+json">
      [{"@type":"WebPage"},{"@type":"JobPosting","validThrough":"2026-02-02"}]
    </script>`;
    expect(extractValidThrough(html)).toBe("2026-02-02");
  });

  test("ignores non-JobPosting structured data", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Event","validThrough":"2020-01-01"}
    </script>`;
    expect(extractValidThrough(html)).toBeNull();
  });

  test("survives malformed JSON-LD rather than throwing", () => {
    const html = `<script type="application/ld+json">{ not json at all }</script>`;
    expect(extractValidThrough(html)).toBeNull();
  });

  test("returns null when there is no structured data — the common case", () => {
    expect(extractValidThrough("<html><body>Just a page</body></html>")).toBeNull();
  });
});

describe("tombstone detection", () => {
  test.each([
    "This job is no longer accepting applications",
    "Applications are now closed",
    "This position has been filled",
    "The vacancy has expired",
    "Registrations closed",
  ])("matches %j", (copy) => {
    expect(findTombstone(`<html><body><p>${copy}</p></body></html>`)).not.toBeNull();
  });

  test("does not fire on ordinary page copy containing 'closed'", () => {
    const html = "<html><body><p>Closed captioning is available for all sessions.</p></body></html>";
    expect(findTombstone(html)).toBeNull();
  });

  test("ignores text inside script and style tags", () => {
    const html = `<html><head><style>.applications-closed { display: none }</style>
      <script>const msg = "this job has expired";</script></head>
      <body><p>Apply by Friday.</p></body></html>`;
    expect(findTombstone(html)).toBeNull();
  });

  test("visibleText strips markup", () => {
    expect(visibleText("<p>Hello <b>world</b></p>").trim()).toBe("Hello world");
  });
});

describe("the ladder", () => {
  test("a healthy 200 is ok", () => {
    const result = judge(live(), NOW);
    expect(result.verdict).toBe("ok");
    expect(result.httpStatus).toBe(200);
  });

  test("410 is gone", () => {
    expect(judge(live({ status: 410, html: "" }), NOW).verdict).toBe("gone");
  });

  test("a past validThrough expires the row even on a 200", () => {
    const result = judge(live({ html: jsonLd("2026-07-31") }), NOW);
    expect(result.verdict).toBe("expired");
    expect(result.evidence[0]).toContain("2026-07-31");
  });

  test("a future validThrough leaves it live", () => {
    expect(judge(live({ html: jsonLd("2026-12-31") }), NOW).verdict).toBe("ok");
  });

  test("tombstone copy expires a 200 page", () => {
    const html = "<html><body><p>This job is no longer accepting applications.</p></body></html>";
    const result = judge(live({ html }), NOW);
    expect(result.verdict).toBe("expired");
    expect(result.evidence[0]).toContain("no longer accepting applications");
  });

  test("validThrough is consulted before the status code", () => {
    // Both signals present: an expired posting still served with 200.
    const result = judge(live({ status: 200, html: jsonLd("2020-01-01") }), NOW);
    expect(result.verdict).toBe("expired");
  });

  test.each([401, 403, 405, 406, 429])("HTTP %i is blocked, never dead", (status) => {
    const result = judge(live({ status, html: "" }), NOW);
    expect(result.verdict).toBe("blocked");
    expect(shouldRetire(result.verdict, 5)).toBe(false);
  });

  test("404 on a host with real 404s is gone", () => {
    const result = judge(live({ status: 404, html: "", hostSoft404s: false }), NOW);
    expect(result.verdict).toBe("gone");
    expect(result.evidence[0]).toContain("control URL");
  });

  test("404 on a soft-404 host is only ambiguous", () => {
    const result = judge(live({ status: 404, html: "", hostSoft404s: true }), NOW);
    expect(result.verdict).toBe("unreachable");
    expect(shouldRetire(result.verdict, 0)).toBe(false);
  });

  test("404 with an inconclusive control probe is still treated as gone", () => {
    expect(judge(live({ status: 404, html: "", hostSoft404s: null }), NOW).verdict).toBe("gone");
  });

  test("a network failure is unreachable, not dead", () => {
    const result = judge(
      { status: null, html: "", hostSoft404s: null, networkError: "timeout" },
      NOW
    );
    expect(result.verdict).toBe("unreachable");
    expect(result.evidence[0]).toContain("timeout");
  });

  test.each([500, 502, 503])("HTTP %i is unreachable, not dead", (status) => {
    expect(judge(live({ status, html: "" }), NOW).verdict).toBe("unreachable");
  });

  test("every verdict carries evidence", () => {
    const outcomes: ProbeOutcome[] = [
      live(),
      live({ status: 410, html: "" }),
      live({ status: 403, html: "" }),
      live({ status: 404, html: "", hostSoft404s: false }),
      { status: null, html: "", hostSoft404s: null, networkError: "reset" },
    ];
    for (const outcome of outcomes) {
      expect(judge(outcome, NOW).evidence.length).toBeGreaterThan(0);
    }
  });
});

describe("two-strike rule", () => {
  test("definitive verdicts retire on the first sighting", () => {
    expect(shouldRetire("gone", 0)).toBe(true);
    expect(shouldRetire("expired", 0)).toBe(true);
  });

  test("an ambiguous failure needs two consecutive strikes", () => {
    expect(shouldRetire("unreachable", 0)).toBe(false);
    expect(shouldRetire("unreachable", 1)).toBe(true);
    expect(FAILURE_LIMIT).toBe(2);
  });

  test("a healthy check never retires", () => {
    expect(shouldRetire("ok", 99)).toBe(false);
    expect(shouldRetire("blocked", 99)).toBe(false);
  });

  test("success forgives accumulated failures", () => {
    expect(nextFailureCount("ok", 1)).toBe(0);
    expect(nextFailureCount("blocked", 1)).toBe(0);
  });

  test("an ambiguous failure increments the counter", () => {
    expect(nextFailureCount("unreachable", 0)).toBe(1);
    expect(nextFailureCount("unreachable", 1)).toBe(2);
  });

  test("one bad day followed by a good one does not retire", () => {
    // Day 1: site is down.
    let failures = 0;
    const day1 = judge({ status: null, html: "", hostSoft404s: null, networkError: "ETIMEDOUT" }, NOW);
    expect(shouldRetire(day1.verdict, failures)).toBe(false);
    failures = nextFailureCount(day1.verdict, failures);
    expect(failures).toBe(1);

    // Day 2: site recovers. The strike must be cleared, not carried.
    const day2 = judge(live(), NOW);
    expect(shouldRetire(day2.verdict, failures)).toBe(false);
    expect(nextFailureCount(day2.verdict, failures)).toBe(0);
  });

  test("two consecutive bad days do retire", () => {
    let failures = 0;
    const outcome: ProbeOutcome = { status: 503, html: "", hostSoft404s: null };

    const day1 = judge(outcome, NOW);
    expect(shouldRetire(day1.verdict, failures)).toBe(false);
    failures = nextFailureCount(day1.verdict, failures);

    const day2 = judge(outcome, NOW);
    expect(shouldRetire(day2.verdict, failures)).toBe(true);
  });
});
