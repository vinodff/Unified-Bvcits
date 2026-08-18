// Blog Writer — turns an outline into the finished article.
//
// One generation call, then a targeted expansion call only if the draft comes
// back materially short. Two calls rather than one-per-section is a deliberate
// quota trade: the daily cron plus a critique pass has to fit inside a modest
// API budget, and a whole-article call also produces better transitions between
// sections than stitching six independently-written blocks together.
//
// Everything the model returns is normalised before it is stored: raw HTML is
// stripped, the H1 is removed (the page renders the title itself), and heading
// depth is clamped. The renderer is allowlist-based too — this is the first of
// two layers, not the only one.

import { getLlm } from "../../providers/llm";
import type { BlogOutline, BlogTopic } from "../domain";
import { countWords } from "../domain";
import { groundedRecord } from "../college-context";

export interface WrittenArticle {
  bodyMd: string;
  excerpt: string;
  wordCount: number;
  /** True when the second expansion call had to run. */
  expanded: boolean;
  /** Non-fatal problems worth showing the admin. */
  notes: string[];
}

/**
 * Below this fraction of target, the draft is too thin and gets an expansion
 * pass. Set at 0.75 rather than 0.62 after the first live article came back at
 * 1080 words against a 1500 plan — under the old floor, so it shipped short
 * and the quality gate could only complain about it afterwards.
 */
const SHORT_DRAFT_RATIO = 0.75;

const STYLE_RULES = [
  "VOICE — write the way a sharp, experienced teacher writes when they respect the reader's time:",
  "• Short paragraphs, 2-4 sentences. Vary sentence length deliberately; a three-word sentence after a long one is good.",
  "• Address the reader as 'you'. Never 'one must' or 'students should note that'.",
  "• Concrete over abstract. '45 minutes, twice a day' beats 'regular practice'.",
  "• Indian context throughout: rupees, JNTUK, AP EAPCET, semester system, hostel life.",
  "",
  "BANNED — these are the tells of machine-written prose and the draft is rejected if it contains them:",
  "• 'In today's fast-paced world', 'In conclusion', 'It is important to note', 'Let's dive in', 'game-changer', 'unlock', 'delve', 'landscape', 'testament to', 'navigate the'.",
  "• Opening a paragraph with 'Furthermore', 'Moreover', 'Additionally'.",
  "• Uniform paragraph lengths, and every section ending on a summarising sentence.",
  "• Em-dash-heavy rhythm. Use them sparingly.",
  "",
  "FACTS — this is not negotiable:",
  "• Every claim about BVCITS must come from context.grounded verbatim in substance. Nothing else.",
  "• Never invent a statistic, a percentage, a study, a survey, a ranking, or a person's name.",
  "• Never state or imply BVCITS is the best/#1 college, and never rank or criticise a named competitor.",
  "• Never guarantee a placement, package or admission outcome.",
  "• If you need a figure you were not given, write the sentence without the figure.",
  "",
  "FORMAT:",
  "• Markdown only. No HTML tags of any kind.",
  "• Do NOT include the article title as an H1 — start at the first '## ' heading.",
  "• Use '## ' for the planned sections. '### ' is allowed inside a section.",
  "• Bullet lists and numbered lists where they genuinely help. Tables are fine for comparisons.",
  "• Bold sparingly, for terms that matter, not for emphasis on ordinary words.",
  "• Internal links only from context.internalLinks, written as [Label](/href). Two to four across the article.",
].join("\n");

function buildPlan(outline: BlogOutline): string {
  return outline.sections
    .map((s, i) => `${i + 1}. ## ${s.heading}\n   — ${s.brief}\n   — target ≈ ${s.targetWords} words`)
    .join("\n");
}

/**
 * Normalise model markdown into what the renderer expects.
 *
 * Order matters: fences are stripped before HTML, because a model that wraps
 * its whole answer in ```markdown would otherwise have its content treated as
 * a code block and survive every later check untouched.
 */
export function normaliseMarkdown(raw: string, title: string): string {
  let md = (raw ?? "").trim();

  // A whole-response code fence.
  const whole = md.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$/i);
  if (whole) md = whole[1].trim();

  // HTML has no legitimate reason to be here — the renderer would drop it, and
  // leaving it in means the word count and the reader see different articles.
  md = md.replace(/<\/?(?:script|style|iframe|object|embed)[^>]*>/gi, "");
  md = md.replace(/<[^>]+>/g, "");

  // Drop a leading H1: the page renders the title from the post record, so an
  // H1 here would produce two competing document headings and break the
  // single-H1 rule the SEO agent asserts in the schema.
  md = md.replace(/^#\s+.*\n+/, "");
  // Any later H1 becomes an H2 rather than being deleted — it is a real section.
  md = md.replace(/^#\s+/gm, "## ");

  // Model sometimes restates the title as the first line without a heading.
  const firstLine = md.split("\n", 1)[0]?.trim() ?? "";
  if (firstLine && firstLine.toLowerCase() === title.trim().toLowerCase()) {
    md = md.slice(firstLine.length).trimStart();
  }

  // Collapse runs of blank lines; normalise bullet markers to '-'.
  md = md.replace(/\n{3,}/g, "\n\n").replace(/^[ \t]*[*+][ \t]+/gm, "- ");

  return md.trim();
}

/**
 * Demote internal links whose route does not exist to plain text.
 *
 * The model invents site paths. The first live article linked to
 * "/dept.computer-science-engineering" — it had turned a grounded *fact key*
 * into a URL. Sending that back to the writer as a revision note tends to make
 * it rewrite whole paragraphs around the link; deleting the link and keeping
 * the sentence is both smaller and always correct.
 *
 * External links are left alone: they are not ours to validate, and the
 * renderer already restricts them to safe protocols.
 */
export function stripInvalidLinks(
  bodyMd: string,
  allowedLinks: string[]
): { bodyMd: string; removed: string[] } {
  const allowed = new Set(allowedLinks);
  const removed: string[] = [];

  const cleaned = bodyMd.replace(/(!?)\[([^\]]*)\]\((\/[^)\s]*)([^)]*)\)/g, (match, bang, label, href) => {
    if (bang) return match; // image, not a link
    if (allowed.has(String(href).split("#")[0])) return match;
    removed.push(String(href));
    return String(label);
  });

  return { bodyMd: cleaned, removed: [...new Set(removed)] };
}

/** First substantial paragraph, trimmed to a meta-description-friendly length. */
export function deriveExcerpt(md: string, fallback: string): string {
  const para = md
    .split("\n\n")
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("#") && !p.startsWith("-") && !p.startsWith(">") && p.length > 80);
  const text = (para ?? fallback).replace(/[*_`\[\]]/g, "").replace(/\(\/[^)]*\)/g, "").trim();
  if (text.length <= 200) return text;
  const cut = text.slice(0, 197);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return lastStop > 120 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}

export async function writeArticle(topic: BlogTopic, outline: BlogOutline): Promise<WrittenArticle> {
  const llm = getLlm("writing");
  const notes: string[] = [];
  const grounded = groundedRecord();

  const context = {
    title: outline.title,
    hook: outline.hook,
    audience: topic.audience,
    searchIntent: topic.searchIntent,
    primaryKeyword: topic.primaryKeyword,
    secondaryKeywords: topic.secondaryKeywords,
    sectionPlan: buildPlan(outline),
    targetWords: outline.targetWords,
    internalLinks: outline.internalLinks,
    grounded,
  };

  const res = await llm.complete({
    kind: "writing",
    instruction: [
      `Write the complete article "${outline.title}" for the official BVCITS college blog.`,
      `Target length: ${outline.targetWords} words (±15%). Follow the section plan in context.sectionPlan exactly — same headings, same order.`,
      "",
      STYLE_RULES,
    ].join("\n"),
    context,
    temperature: 0.75,
  });

  let bodyMd = normaliseMarkdown(res.text, outline.title);
  let wordCount = countWords(bodyMd);
  let expanded = false;

  // A short draft is the most common live-model failure: it obeys the structure
  // and then writes 60 words per section. Expanding is cheaper and produces a
  // better article than regenerating from scratch, because the structure and
  // the good sentences survive.
  if (wordCount < outline.targetWords * SHORT_DRAFT_RATIO) {
    notes.push(`First draft came back at ${wordCount} words against a ${outline.targetWords} target — ran an expansion pass.`);
    try {
      const expand = await llm.complete({
        kind: "writing",
        instruction: [
          `This draft is too thin at ${wordCount} words. Expand it to approximately ${outline.targetWords} words.`,
          "",
          "Add substance, not padding: worked examples, specific numbers you were given, concrete scenarios, the 'why' behind each piece of advice.",
          "Keep every existing heading. Do not add a conclusion section that only restates the article.",
          "",
          STYLE_RULES,
        ].join("\n"),
        context: { ...context, draft: bodyMd },
        temperature: 0.7,
      });
      const expandedMd = normaliseMarkdown(expand.text, outline.title);
      // Only accept the expansion if it actually grew the article — a model
      // that returns a summary instead would otherwise silently shrink it.
      if (countWords(expandedMd) > wordCount) {
        bodyMd = expandedMd;
        wordCount = countWords(bodyMd);
        expanded = true;
      } else {
        notes.push("The expansion pass did not lengthen the draft; kept the original.");
      }
    } catch (e) {
      notes.push(`Expansion pass failed (${(e as Error).message}); kept the first draft.`);
    }
  }

  if (!bodyMd) {
    throw new Error("The writing model returned an empty article.");
  }

  return {
    bodyMd,
    excerpt: deriveExcerpt(bodyMd, `${topic.angle}`),
    wordCount,
    expanded,
    notes,
  };
}

/** Rewrite pass driven by the quality gate's findings. */
export async function reviseArticle(
  topic: BlogTopic,
  outline: BlogOutline,
  bodyMd: string,
  problems: string[]
): Promise<{ bodyMd: string; changed: boolean }> {
  if (!problems.length) return { bodyMd, changed: false };
  const llm = getLlm("writing");

  const res = await llm.complete({
    kind: "writing",
    instruction: [
      "Revise the article below to fix the listed problems. Change only what the problems require — keep every heading, and keep the sentences that are already good.",
      "",
      "Problems to fix:",
      ...problems.map((p, i) => `${i + 1}. ${p}`),
      "",
      "If a problem is an unverifiable claim, the fix is to DELETE the claim or rewrite the sentence without it. Never replace one invented figure with another.",
      "",
      STYLE_RULES,
      "",
      "Return the full revised article in markdown. No commentary.",
    ].join("\n"),
    context: {
      title: outline.title,
      draft: bodyMd,
      grounded: groundedRecord(),
      internalLinks: outline.internalLinks,
      primaryKeyword: topic.primaryKeyword,
    },
    temperature: 0.4,
  });

  const revised = normaliseMarkdown(res.text, outline.title);
  // Guard against a model that "revises" by returning a two-line apology.
  if (countWords(revised) < countWords(bodyMd) * 0.7) {
    return { bodyMd, changed: false };
  }
  return { bodyMd: revised, changed: revised !== bodyMd };
}
