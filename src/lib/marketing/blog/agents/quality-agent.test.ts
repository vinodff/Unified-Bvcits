import { describe, it, expect } from "vitest";
import { runBlogQuality, candidateEntities, extractLinks, toProse, revisionBrief } from "./quality-agent";
import { fallbackOutline } from "./outline-agent";
import type { BlogTopic } from "../domain";

const topic: BlogTopic = {
  id: "topic_test",
  title: "How to Prepare for Campus Placements",
  angle: "A practical preparation sequence.",
  rationale: "Students ask this constantly.",
  searchIntent: "How-to",
  primaryKeyword: "campus placement preparation",
  secondaryKeywords: ["placement tips"],
  promoAngle: "Links the placements cell.",
  audience: "students",
  category: "Career & Placements",
  score: 90,
  status: "approved",
  source: "agent",
  proposedOn: "2026-08-16",
  createdAt: "2026-08-16T00:00:00.000Z",
};

const outline = fallbackOutline(topic, [{ label: "Placements Cell", href: "/placements-cell" }]);
const ALLOWED = ["/placements-cell", "/admissions", "/students", "/"];

/**
 * A structurally sound article, long enough to clear the depth checks and
 * varied enough in paragraph length to clear the uniform-rhythm check.
 */
function goodArticle(): string {
  const para = (n: number) =>
    `Preparation is a habit before it is an event. ${"You build it in short, repeated sessions across the semester rather than in the fortnight before a drive, which is when most people start. ".repeat(
      n
    )}`;
  return [
    "## Why this matters right now",
    para(9),
    "Start earlier than feels necessary.",
    "",
    "## The short answer",
    para(7),
    "",
    "## What actually works",
    para(16),
    "- Solve problems on paper first",
    "- Track every company you apply to",
    "",
    "See the [Placements Cell](/placements-cell) for the current drive calendar.",
    "",
    "## Common mistakes to avoid",
    para(12),
    "",
    "## Where to go from here",
    para(4),
    "Read the campus placement preparation checklist and start this week.",
  ].join("\n");
}

function check(body: string, hasHeroImage = true) {
  return runBlogQuality({
    topic,
    outline,
    bodyMd: body,
    title: topic.title,
    excerpt: "A practical, week-by-week way to get ready for campus placement drives without cramming.",
    allowedLinks: ALLOWED,
    hasHeroImage,
  });
}

describe("blog quality gate — claim safety", () => {
  it("passes a grounded, well-structured article", () => {
    const report = check(goodArticle());
    expect(report.issues.filter((i) => i.severity === "critical")).toEqual([]);
    expect(report.verdict).toBe("pass");
  });

  it("blocks a self-ranking claim", () => {
    const report = check(`${goodArticle()}\n\nBVCITS is the best engineering college in the district.`);
    expect(report.verdict).toBe("needs_review");
    expect(report.issues.some((i) => i.code === "self_ranking" || i.code === "absolute_superlative")).toBe(true);
  });

  it("blocks a guaranteed-placement promise", () => {
    const report = check(`${goodArticle()}\n\nOur students get 100% placement every year.`);
    expect(report.issues.some((i) => i.code === "guaranteed_outcome")).toBe(true);
    expect(report.verdict).toBe("needs_review");
  });

  it("blocks an unsourced study citation", () => {
    const report = check(`${goodArticle()}\n\nStudies show that morning revision doubles retention.`);
    expect(report.issues.some((i) => i.code === "fabricated_survey")).toBe(true);
  });
});

describe("blog quality gate — factual grounding", () => {
  it("flags an invented figure asserted about the college", () => {
    const report = check(`${goodArticle()}\n\nBVCITS reports a 97.4% placement rate across our students every year.`);
    expect(report.issues.some((i) => i.code === "unverified_figure")).toBe(true);
    expect(report.verdict).toBe("needs_review");
  });

  it("leaves a generic figure alone when it makes no claim about the college", () => {
    const report = check(`${goodArticle()}\n\nSpend about 20% of each study block on revision.`);
    expect(report.issues.some((i) => i.code === "unverified_figure")).toBe(false);
  });

  it("accepts a verified figure that exists in the grounded fact set", () => {
    const report = check(`${goodArticle()}\n\nOur highest package on record at BVCITS is ₹38 LPA.`);
    expect(report.issues.some((i) => i.code === "unverified_figure")).toBe(false);
  });

  it("flags an invented staff name", () => {
    const report = check(`${goodArticle()}\n\nAs Dr. Ramesh Varma explains, preparation compounds.`);
    expect(report.issues.some((i) => i.code === "unverified_person")).toBe(true);
  });

  it("accepts a real HOD cited at the end of a sentence", () => {
    // The name-matching regex used to swallow the full stop and the first word
    // of the next sentence, turning a correctly-cited head of department into
    // an "invented" name. Regression guard for that.
    const report = check(
      `${goodArticle()}\n\nThe department is led by Dr. Katikireddy Srinivas. If you have questions, the office can route them.`
    );
    expect(report.issues.some((i) => i.code === "unverified_person")).toBe(false);
  });

  it("still flags an invented name that ends a sentence", () => {
    const report = check(`${goodArticle()}\n\nSpeak to Dr. Anitha Chowdary. She coordinates the drives.`);
    const issue = report.issues.find((i) => i.code === "unverified_person");
    expect(issue).toBeDefined();
    expect(issue?.message).toContain("Anitha Chowdary");
    expect(issue?.message).not.toContain("She");
  });
});

describe("blog quality gate — craft", () => {
  it("flags stock AI phrasing", () => {
    const report = check(
      `${goodArticle()}\n\nIn today's fast-paced world, it is important to note that we must delve into this.`
    );
    const slop = report.issues.find((i) => i.code === "ai_slop");
    expect(slop).toBeDefined();
    expect(slop?.severity).toBe("critical");
  });

  it("flags a draft that is far below its planned length", () => {
    const report = check("## One\n\nToo short.\n\n## Two\n\nStill too short.\n\n## Three\n\nAnd again.");
    expect(report.issues.some((i) => i.code === "too_short")).toBe(true);
  });

  it("flags a link to a route that does not exist", () => {
    const report = check(`${goodArticle()}\n\nSee our [fee page](/fees-2027) for details.`);
    expect(report.issues.some((i) => i.code === "broken_internal_link")).toBe(true);
  });

  it("flags an article with no internal links at all", () => {
    const report = check(goodArticle().replace("[Placements Cell](/placements-cell)", "the placements cell"));
    expect(report.issues.some((i) => i.code === "no_internal_links")).toBe(true);
  });

  it("refuses to pass an article with no hero image", () => {
    const report = check(goodArticle(), false);
    const issue = report.issues.find((i) => i.code === "missing_hero_image");
    expect(issue?.severity).toBe("critical");
    expect(report.verdict).toBe("needs_review");
  });

  it("passes the same article once it has a hero image", () => {
    expect(check(goodArticle(), true).verdict).toBe("pass");
  });

  it("keeps a high average score from overriding a critical finding", () => {
    const report = check(`${goodArticle()}\n\nBVCITS guarantees placement for every student.`);
    expect(report.overall).toBeGreaterThan(60);
    expect(report.verdict).toBe("needs_review");
  });
});

describe("quality helpers", () => {
  it("strips markdown down to readable prose", () => {
    expect(toProse("## Heading\n\n**Bold** and [a link](/x) and `code`.")).toContain("Bold and a link and");
    expect(toProse("![alt](/img.jpg)")).not.toContain("img.jpg");
  });

  it("extracts every link target", () => {
    expect(extractLinks("[a](/one) text [b](https://x.test/two)")).toEqual(["/one", "https://x.test/two"]);
  });

  it("does not treat ordinary capitalised sentence openers as names", () => {
    expect(candidateEntities("Students often struggle. Preparation is a habit.")).toEqual([]);
  });

  it("excludes findings the writer cannot usefully fix from the revision brief", () => {
    const report = check(`${goodArticle()}\n\nSee our [fee page](/fees-2027).`);
    expect(report.issues.some((i) => i.code === "broken_internal_link")).toBe(true);
    expect(revisionBrief(report).some((m) => m.includes("routes that do not exist"))).toBe(false);
  });
});
