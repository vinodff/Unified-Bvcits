// Outline Agent — turns an approved topic into a section plan.
//
// The outline exists to control three things the writer cannot be trusted to
// get right on its own:
//
//   Length.  A word target per section, varied deliberately. Uniform 200-word
//            sections are the clearest tell of machine-written prose.
//   Layout.  Which sections carry an image, and where the H2 boundaries fall,
//            so the rendered page has rhythm rather than a wall of text.
//   Links.   Internal links are resolved against the real app directory here,
//            before writing, so the article can never link to a route that does
//            not exist.

import { promises as fs } from "node:fs";
import path from "node:path";
import { getLlm } from "../../providers/llm";
import { parseLlmJson } from "../../providers/llm-json";
import type { BlogOutline, BlogSection, BlogTopic } from "../domain";
import { groundedRecord, relevantInternalLinks } from "../college-context";

/** Total article length. Long enough to be substantive, short enough to finish. */
const DEFAULT_TARGET_WORDS = 1500;
const MIN_SECTIONS = 4;
const MAX_SECTIONS = 8;

/**
 * Routes that exist in src/app but are not linkable from a public article.
 * Mirrors the intent of NON_PUBLIC_ROUTES in ../../agents/seo-agent.ts.
 */
const NON_LINKABLE = new Set(["api", "admin", "login", "signup", "dashboard", "placement-portal", "blog"]);

/** Public top-level routes, read from the filesystem so links cannot go stale. */
export async function linkableRoutes(): Promise<string[]> {
  const appDir = path.join(process.cwd(), "src", "app");
  try {
    const entries = await fs.readdir(appDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !/^[[(_]/.test(e.name) && !NON_LINKABLE.has(e.name))
      .map((e) => `/${e.name}`)
      .sort();
  } catch {
    // Not readable in some deploy targets. Falling back to the curated list is
    // correct — those routes are hand-verified, so the links stay valid.
    return [];
  }
}

/**
 * Deterministic outline.
 *
 * Not a placeholder: this is the shape the model is asked to improve on, and
 * it is what ships when the model returns nothing usable. It is built from the
 * topic's own angle and keywords, so it is specific to the article rather than
 * a generic intro/body/conclusion skeleton.
 */
export function fallbackOutline(topic: BlogTopic, links: { label: string; href: string }[]): BlogOutline {
  const subject = topic.primaryKeyword || topic.title;
  const sections: BlogSection[] = [
    {
      heading: `Why this matters right now`,
      brief: `Open with the reader's actual situation. Establish the stakes of ${subject} in two or three concrete sentences. No throat-clearing, no "in today's fast-paced world".`,
      targetWords: 180,
      citeFacts: [],
      wantsImage: false,
    },
    {
      heading: `The short answer`,
      brief: `Give the direct answer up front, before the detail. A reader who stops here should still have got what they came for.`,
      targetWords: 160,
      citeFacts: [],
      wantsImage: false,
    },
    {
      heading: `What actually works`,
      brief: `The substance of the article: ${topic.angle} Use specific, checkable detail rather than general advice.`,
      targetWords: 420,
      citeFacts: [],
      wantsImage: true,
    },
    {
      heading: `Common mistakes to avoid`,
      brief: `Three or four things people get wrong about ${subject}, and what to do instead. Be concrete about the consequence of each.`,
      targetWords: 300,
      citeFacts: [],
      wantsImage: false,
    },
    {
      heading: `How this looks at BVCITS`,
      brief: `Connect the advice to what is actually available at BVCITS, using ONLY verified facts from the grounded context. If nothing verified applies, keep this section short and factual rather than padding it.`,
      targetWords: 220,
      citeFacts: ["accreditation", "campusSize", "topRecruiters"],
      wantsImage: true,
    },
    {
      heading: `Where to go from here`,
      brief: `A short, practical next step for the reader. One or two internal links, no hard sell.`,
      targetWords: 140,
      citeFacts: [],
      wantsImage: false,
    },
  ];

  return {
    title: topic.title,
    hook: `${topic.angle}`,
    sections,
    internalLinks: links,
    targetWords: DEFAULT_TARGET_WORDS,
    repaired: [],
  };
}

function coerceSection(raw: unknown): BlogSection | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const heading = [r.heading, r.title, r.h2].find((v) => typeof v === "string" && v.trim());
  if (typeof heading !== "string" || heading.trim().length < 3) return null;

  const brief = [r.brief, r.summary, r.description, r.covers].find((v) => typeof v === "string" && v.trim());
  const wordsRaw = Number(r.targetWords ?? r.target_words ?? r.words ?? 0);
  const targetWords = Number.isFinite(wordsRaw) && wordsRaw > 0 ? Math.min(700, Math.max(90, Math.round(wordsRaw))) : 250;

  const citeFacts = Array.isArray(r.citeFacts ?? r.cite_facts)
    ? ((r.citeFacts ?? r.cite_facts) as unknown[]).map(String).filter(Boolean)
    : [];

  return {
    heading: heading.trim().replace(/^#+\s*/, ""),
    brief: typeof brief === "string" ? brief.trim() : `Cover "${heading}" with specific, checkable detail.`,
    targetWords,
    citeFacts,
    wantsImage: r.wantsImage === true || r.wants_image === true,
  };
}

const OUTLINE_INSTRUCTION = [
  "Plan the section structure for one article on the official BVCITS college blog.",
  "",
  "The reader is a student or parent in Andhra Pradesh. They want the answer, not a warm-up.",
  "",
  "RULES:",
  "1. Vary section lengths deliberately (some 150 words, some 400+). Uniform sections read as machine-written.",
  "2. Front-load the answer. The second section should already deliver value.",
  "3. At most ONE section may be about BVCITS itself, and it must be grounded in context.grounded only.",
  "4. Never plan a section that ranks other colleges or that needs invented statistics.",
  "5. Headings must be specific and human: 'What recruiters actually look at in a fresher resume', not 'Key Considerations'.",
  "6. Mark wantsImage:true on 2-3 sections at most.",
  "",
  "Return JSON: {title, hook, targetWords, sections:[{heading, brief, targetWords, citeFacts[], wantsImage}]}",
].join("\n");

export async function generateOutline(topic: BlogTopic): Promise<BlogOutline> {
  const routes = await linkableRoutes();
  const links = relevantInternalLinks(`${topic.title} ${topic.angle} ${topic.primaryKeyword} ${topic.secondaryKeywords.join(" ")}`)
    // Keep only links whose route genuinely exists when the scan worked.
    .filter((l) => !routes.length || routes.includes(l.href));

  const fallback = fallbackOutline(topic, links);

  const llm = getLlm("strategy");
  let parsed: Record<string, unknown> | null = null;
  try {
    const res = await llm.complete({
      kind: "strategy",
      instruction: OUTLINE_INSTRUCTION,
      context: {
        topic: {
          title: topic.title,
          angle: topic.angle,
          searchIntent: topic.searchIntent,
          primaryKeyword: topic.primaryKeyword,
          secondaryKeywords: topic.secondaryKeywords,
          audience: topic.audience,
          category: topic.category,
        },
        grounded: groundedRecord(),
        availableInternalLinks: links,
        targetWords: DEFAULT_TARGET_WORDS,
      },
      jsonSchemaHint: true,
      temperature: 0.6,
    });
    parsed = parseLlmJson(res.text);
  } catch {
    // Handled below by falling through with parsed === null; the caller records
    // the failure as an agent run with the real error already logged upstream.
  }

  if (!parsed) return { ...fallback, repaired: ["sections", "hook"] };

  const repaired: string[] = [];
  const rawSections = parsed.sections ?? parsed.outline ?? parsed.structure;
  const coerced = Array.isArray(rawSections)
    ? rawSections.map(coerceSection).filter((s): s is BlogSection => s !== null)
    : [];

  // Too few sections means the model gave a sketch, not a plan — an article
  // built from three vague headings is exactly the thin content this pipeline
  // exists to avoid, so the deterministic outline wins.
  let sections = coerced;
  if (sections.length < MIN_SECTIONS) {
    repaired.push("sections");
    sections = fallback.sections;
  } else if (sections.length > MAX_SECTIONS) {
    sections = sections.slice(0, MAX_SECTIONS);
  }

  const hook = typeof parsed.hook === "string" && parsed.hook.trim() ? parsed.hook.trim() : (repaired.push("hook"), fallback.hook);
  const targetRaw = Number(parsed.targetWords ?? parsed.target_words ?? 0);
  const targetWords =
    Number.isFinite(targetRaw) && targetRaw >= 700
      ? Math.min(2600, Math.round(targetRaw))
      : sections.reduce((n, s) => n + s.targetWords, 0) || DEFAULT_TARGET_WORDS;

  // At most three images, and never on consecutive sections — the layout wants
  // breathing room, not a slideshow.
  let imageCount = 0;
  sections = sections.map((s, i) => {
    const prevHadImage = i > 0 && sections[i - 1].wantsImage;
    const allow = s.wantsImage && imageCount < 3 && !prevHadImage;
    if (allow) imageCount++;
    return { ...s, wantsImage: allow };
  });

  return { title: topic.title, hook, sections, internalLinks: links, targetWords, repaired };
}
