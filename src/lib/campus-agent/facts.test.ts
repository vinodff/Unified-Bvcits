import { describe, expect, test } from "vitest";
import { buildFactSheet, extractNumbers } from "./facts";
import { resolveDepartment } from "./catalog";
import { tokenize } from "./normalize";

/**
 * The fact sheet is the grounding boundary for the language model. If a figure is absent
 * here the model has no legitimate way to produce it, so these tests assert both what the
 * sheet must contain and what it must never leak.
 */

function deptFor(query: string) {
  return resolveDepartment(tokenize(query));
}

describe("fact sheets carry the figures an answer needs", () => {
  test("MBA fee sheet contains the MBA fee and not the B.Tech fee", () => {
    const sheet = buildFactSheet("fees", deptFor("mba"));
    expect(sheet).toContain("35,000");
    expect(sheet).not.toContain("43,000");
  });

  test("B.Tech fee sheet contains the convenor fee", () => {
    expect(buildFactSheet("fees", deptFor("cse"))).toContain("43,000");
  });

  test("placement sheet names the real topper and recruiter", () => {
    const sheet = buildFactSheet("placements");
    expect(sheet).toContain("K. Naga Satya Rajesh");
    expect(sheet).toContain("ServiceNow");
    expect(sheet).toContain("38 LPA");
  });

  test("department sheet carries the real HOD name", () => {
    expect(buildFactSheet("hod_contact", deptFor("cse"))).toContain("Dr. Katikireddy Srinivas");
  });

  test("a department with no published head instructs the model not to invent one", () => {
    const sheet = buildFactSheet("hod_contact", deptFor("aiml"));
    expect(sheet).toMatch(/NOT PUBLISHED/);
    expect(sheet).toMatch(/Do not name anyone/i);
  });

  test("an unrecognised question still gets substantial grounding", () => {
    // This is the case that used to produce a bare "I didn't understand".
    const sheet = buildFactSheet("unknown");
    expect(sheet).toContain("BVTS");
    expect(sheet).toContain("43,000");
    expect(sheet).toContain("ServiceNow");
    expect(sheet.split("\n").length).toBeGreaterThan(15);
  });

  test("every sheet states the institution and its phone number", () => {
    for (const topic of ["fees", "placements", "hostel", "unknown", "library"] as const) {
      const sheet = buildFactSheet(topic);
      expect(sheet).toContain("BVCITS");
      expect(sheet).toContain("99854 22678");
    }
  });

  test("no fabricated per-HOD email address appears in any sheet", () => {
    // A previous knowledge base invented addresses like hod.cse@bvcits.edu.in.
    for (const key of ["cse", "ece", "mba", "mca"]) {
      const sheet = buildFactSheet("hod_contact", deptFor(key));
      expect(sheet).not.toMatch(/hod\.[a-z]+@bvcits\.edu\.in/);
    }
  });
});

describe("number extraction backs the anti-hallucination guard", () => {
  test("separators are normalised so 43,000 and 43000 compare equal", () => {
    expect(extractNumbers("Fee is 43,000 rupees").has("43000")).toBe(true);
  });

  test("multiple figures are all captured", () => {
    const found = extractNumbers("180 seats, 53 faculty, Rs 43,000");
    expect(found.has("180")).toBe(true);
    expect(found.has("53")).toBe(true);
    expect(found.has("43000")).toBe(true);
  });

  test("text with no digits yields nothing", () => {
    expect(extractNumbers("ముప్పై ఐదు వేల రూపాయలు").size).toBe(0);
  });

  /** Mirrors the guard in the assistant route. */
  function isGrounded(candidate: string, facts: string): boolean {
    const allowed = extractNumbers(facts);
    for (const n of extractNumbers(candidate)) {
      if (n.length <= 2) continue;
      if (!allowed.has(n)) return false;
    }
    return true;
  }

  test("a reply quoting the supplied fee passes", () => {
    const facts = buildFactSheet("fees", deptFor("mba"));
    expect(isGrounded("The MBA fee is 35,000 per year.", facts)).toBe(true);
  });

  test("a reply inventing a fee is rejected", () => {
    const facts = buildFactSheet("fees", deptFor("mba"));
    expect(isGrounded("The MBA fee is 99,500 per year.", facts)).toBe(false);
  });

  test("a reply inventing a phone number is rejected", () => {
    const facts = buildFactSheet("hod_contact", deptFor("cse"));
    expect(isGrounded("Call 98765 43210 to reach him.", facts)).toBe(false);
  });

  test("small incidental numbers are allowed through", () => {
    const facts = buildFactSheet("fees", deptFor("cse"));
    expect(isGrounded("It is a 4 year course with 2 semesters each.", facts)).toBe(true);
  });
});
