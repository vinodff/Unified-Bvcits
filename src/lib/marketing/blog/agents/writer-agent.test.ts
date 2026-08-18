import { describe, it, expect } from "vitest";
import { normaliseMarkdown, deriveExcerpt, stripInvalidLinks } from "./writer-agent";
import { titleOverlap } from "./topic-scout";
import { insertSectionImages } from "./image-agent";
import { fallbackOutline } from "./outline-agent";
import { slugify, countWords, readingMinutes, istDate, type BlogImage, type BlogTopic } from "../domain";

describe("normaliseMarkdown", () => {
  const title = "How to Prepare for Campus Placements";

  it("unwraps a whole-response markdown fence", () => {
    const out = normaliseMarkdown("```markdown\n## First\n\nBody text.\n```", title);
    expect(out.startsWith("## First")).toBe(true);
    expect(out).not.toContain("```");
  });

  it("strips HTML the model emitted", () => {
    const out = normaliseMarkdown('## First\n\n<script>alert(1)</script><p>Body</p>', title);
    expect(out).not.toMatch(/<[^>]+>/);
    expect(out).toContain("Body");
  });

  it("removes a leading H1 so the page does not render two document headings", () => {
    const out = normaliseMarkdown(`# ${title}\n\n## First\n\nBody.`, title);
    expect(out.startsWith("## First")).toBe(true);
  });

  it("demotes a later H1 to H2 rather than deleting a real section", () => {
    const out = normaliseMarkdown("## First\n\nBody.\n\n# Second\n\nMore.", title);
    expect(out).toContain("## Second");
    expect(out).not.toMatch(/^#\s/m);
  });

  it("drops a bare restatement of the title on the first line", () => {
    const out = normaliseMarkdown(`${title}\n\n## First\n\nBody.`, title);
    expect(out.startsWith("## First")).toBe(true);
  });

  it("normalises bullet markers and collapses blank-line runs", () => {
    const out = normaliseMarkdown("## A\n\n\n\n* one\n+ two", title);
    expect(out).toContain("- one");
    expect(out).toContain("- two");
    expect(out).not.toContain("\n\n\n");
  });
});

describe("deriveExcerpt", () => {
  it("takes the first substantial paragraph, not a heading", () => {
    const md = "## Heading\n\nShort.\n\nThis is a properly substantial opening paragraph that runs well past the eighty-character floor and should be chosen.";
    expect(deriveExcerpt(md, "fallback")).toContain("properly substantial opening paragraph");
  });

  it("strips link syntax and inline emphasis", () => {
    const md = "Here is a long enough paragraph containing **bold text** and [a link](/somewhere) that must be cleaned before it becomes a meta description.";
    const out = deriveExcerpt(md, "fallback");
    expect(out).not.toContain("[");
    expect(out).not.toContain("**");
    expect(out).not.toContain("/somewhere");
  });

  it("truncates at a sentence boundary and stays within meta length", () => {
    const long = `${"A meaningful sentence about preparation that carries real information. ".repeat(8)}`;
    const out = deriveExcerpt(long, "fallback");
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it("falls back when there is no usable paragraph", () => {
    expect(deriveExcerpt("## Only a heading", "the fallback text")).toBe("the fallback text");
  });
});

describe("topic de-duplication", () => {
  it("treats a reworded title as a duplicate", () => {
    expect(
      titleOverlap(
        "5 Study Techniques That Actually Work for Engineering Students",
        "Study Techniques That Really Work for Engineering Students"
      )
    ).toBeGreaterThan(0.5);
  });

  it("treats genuinely different topics as distinct", () => {
    expect(
      titleOverlap("How to Build an Engineering Resume With No Experience", "A Parent's Guide to the First Year of B.Tech")
    ).toBeLessThan(0.5);
  });
});

describe("stripInvalidLinks", () => {
  const allowed = ["/admissions", "/placements-cell"];

  it("demotes a link to a route that does not exist, keeping the sentence", () => {
    const { bodyMd, removed } = stripInvalidLinks(
      "Read the [department page](/dept.computer-science-engineering) first.",
      allowed
    );
    expect(bodyMd).toBe("Read the department page first.");
    expect(removed).toEqual(["/dept.computer-science-engineering"]);
  });

  it("leaves valid internal links and anchors intact", () => {
    const md = "See [Admissions](/admissions) and [that section](/placements-cell#drives).";
    expect(stripInvalidLinks(md, allowed).bodyMd).toBe(md);
  });

  it("never touches external links or images", () => {
    const md = "[NPTEL](https://nptel.ac.in) and ![hero](/blog-media/x/hero.jpg)";
    const { bodyMd, removed } = stripInvalidLinks(md, allowed);
    expect(bodyMd).toBe(md);
    expect(removed).toEqual([]);
  });
});

describe("insertSectionImages", () => {
  const topic = { title: "T", angle: "a", primaryKeyword: "k" } as BlogTopic;
  const outline = fallbackOutline(topic, []);
  const image: BlogImage = {
    id: "img1",
    postId: "p1",
    url: "https://cdn.test/section-0.jpg",
    alt: "Section image",
    placement: "section",
    sectionIndex: 2,
    photoBacked: true,
    sourceNote: "",
    createdAt: "2026-08-16T00:00:00.000Z",
  };

  it("places the image directly after its planned heading", () => {
    const body = `## ${outline.sections[2].heading}\n\nBody text.`;
    expect(insertSectionImages(body, outline, [image])).toContain(`![Section image](${image.url})`);
  });

  it("is idempotent — a second pass over an already-illustrated body adds nothing", () => {
    const body = `## ${outline.sections[2].heading}\n\nBody text.`;
    const once = insertSectionImages(body, outline, [image]);
    const twice = insertSectionImages(once, outline, [image]);
    expect(twice).toBe(once);
    expect(twice.split(image.url).length - 1).toBe(1);
  });
});

describe("domain helpers", () => {
  it("slugifies to a URL-safe segment", () => {
    expect(slugify("CSE, AI & DS, or ECE? A Straight Answer")).toBe("cse-ai-ds-or-ece-a-straight-answer");
    expect(slugify("Trailing punctuation!!!")).toBe("trailing-punctuation");
  });

  it("truncates a long slug at a word boundary, never mid-word", () => {
    const slug = slugify("How to Choose an Engineering College in Konaseema: 9 Things to Check Before You Lock a Seat");
    expect(slug.length).toBeLessThanOrEqual(72);
    // Every segment must be a whole word from the source title.
    expect(slug.endsWith("-")).toBe(false);
    expect(slug.split("-").pop()).not.toBe("l");
    expect("how to choose an engineering college in konaseema 9 things to check before you lock a seat").toContain(
      slug.split("-").pop()!
    );
  });

  it("counts words without counting markdown syntax", () => {
    expect(countWords("## Heading\n\n- one\n- two")).toBe(3);
  });

  it("never reports a zero-minute read", () => {
    expect(readingMinutes("one word")).toBe(1);
  });

  it("returns an IST calendar date", () => {
    // 22:00 UTC on the 15th is already the 16th in IST (+5:30).
    expect(istDate(new Date("2026-08-15T22:00:00.000Z"))).toBe("2026-08-16");
    expect(istDate(new Date("2026-08-15T10:00:00.000Z"))).toBe("2026-08-15");
  });
});
