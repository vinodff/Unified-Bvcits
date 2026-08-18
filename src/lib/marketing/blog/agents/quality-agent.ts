// Blog Quality Gate — the only thing standing between a generated draft and
// the live site.
//
// Every check here is deterministic. Asking a model whether its own article
// contains invented statistics gets a confident "no", so verification is done
// by matching the prose against the grounded fact set in ../college-context.ts
// rather than by a second opinion from the same class of system.
//
// A `critical` issue means the post cannot auto-publish. It stops in
// NEEDS_REVIEW with the issue shown to the admin, who can fix it, re-run the
// revise pass, or publish anyway with their name on the override.

import type { BlogOutline, BlogPost, BlogQualityIssue, BlogQualityReport, BlogTopic } from "../domain";
import { countWords, nowIso } from "../domain";
import { FORBIDDEN_CLAIM_PATTERNS, groundedFacts, groundedHaystack } from "../college-context";
import { DEFAULT_BRAND } from "../../brand";

/**
 * Phrases that mark text as machine-written to any reader who has seen a few
 * of these. Their presence is not a factual error, so they are warnings — but
 * enough of them tanks the score, which is what forces the revise pass.
 */
const SLOP_PHRASES = [
  "in today's fast-paced world",
  "in today's world",
  "in conclusion",
  "it is important to note",
  "it's important to note",
  "let's dive in",
  "dive into",
  "game-changer",
  "game changer",
  "unlock the",
  "unlock your",
  "delve into",
  "the landscape of",
  "testament to",
  "navigate the",
  "in the realm of",
  "ever-evolving",
  "when it comes to",
  "at the end of the day",
  "embark on",
  "a myriad of",
  "plays a crucial role",
  "plays a vital role",
  "it goes without saying",
];

/** Sentence openers that, repeated, produce the characteristic essay drone. */
const CONNECTIVE_OPENERS = ["furthermore", "moreover", "additionally", "in addition", "consequently"];

/**
 * Figures the article asserts. Rupee amounts, percentages and counts are where
 * fabrication actually shows up — a wrong adjective is a style problem, a wrong
 * placement percentage is a false claim about a real institution.
 */
const FIGURE_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "rupee amount", re: /₹\s?[\d,.]+\s*(?:lpa|lakh|lakhs|crore|cr|l)?/gi },
  { label: "percentage", re: /\b\d{1,3}(?:\.\d+)?\s?%/g },
  { label: "large count", re: /\b\d{1,3}(?:,\d{3})+\+?\b/g },
  { label: "plus-count", re: /\b\d{2,5}\+/g },
];

/**
 * Words that are capitalised mid-sentence for ordinary reasons. Shared in
 * spirit with COMMON_CAPITALISED in ../../agents/quality-agent.ts — kept
 * separate because editorial prose has a different vocabulary from campaign
 * copy (weekday names matter here, event words do not).
 */
const COMMON_CAPITALISED = new Set([
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "india", "indian", "andhra", "pradesh", "amalapuram", "konaseema", "rajahmundry",
  "english", "telugu", "hindi", "google", "youtube", "linkedin", "github",
  "python", "java", "javascript", "excel", "word", "windows", "linux",
  "the", "this", "that", "these", "those", "there", "their", "they", "then",
  "with", "from", "for", "our", "its", "his", "her", "you", "your", "was",
  "were", "here", "what", "when", "where", "which", "while", "who", "how",
  "why", "all", "also", "and", "are", "but", "not", "now", "over", "under",
  "after", "before", "during", "if", "it", "in", "on", "at", "by", "to", "as",
  "engineering", "college", "student", "students", "parent", "parents",
  "semester", "exam", "exams", "placement", "placements", "internship",
  "resume", "interview", "campus", "hostel", "branch", "degree", "course",
  "step", "note", "tip", "example", "summary", "read", "start", "keep",
]);

/** Acronyms and institution names that are legitimately capitalised. */
const KNOWN_ACRONYMS = new Set([
  "bvcits", "bvc", "jntuk", "naac", "nba", "aicte", "ugc", "eapcet", "eamcet",
  "ap", "cse", "ece", "eee", "mba", "mca", "ai", "ds", "ml", "iot", "gate",
  "cat", "gre", "toefl", "ielts", "nptel", "swayam", "iit", "nit", "iiit",
  "hr", "it", "cs", "ug", "pg", "btech", "b.tech", "m.tech", "lpa", "ctc",
  "dsa", "sql", "api", "faq", "pdf", "atc", "ats", "cgpa", "sgpa", "kt",
]);

export interface BlogQualityInput {
  topic: BlogTopic;
  outline: BlogOutline;
  bodyMd: string;
  title: string;
  excerpt: string;
  /** Hrefs the article is permitted to link to. */
  allowedLinks: string[];
  /**
   * Whether the post ended up with a hero image.
   *
   * Every article must carry at least one image — it is the card thumbnail on
   * /blog, the OG image on every share, and the `image` field of the
   * BlogPosting schema. An article without one looks broken in three places at
   * once, so its absence is a publishing blocker, not a cosmetic warning.
   */
  hasHeroImage: boolean;
}

/** Strips markdown to the prose a reader actually sees. */
export function toProse(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>]/g, "")
    .trim();
}

/** Every markdown link target in the article. */
export function extractLinks(md: string): string[] {
  const out: string[] = [];
  const re = /\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) out.push(m[1]);
  return out;
}

/**
 * Named people in the prose.
 *
 * Kept separate from the general entity scan, and matched by shape rather than
 * inferred from it. "Ramesh Varma" and "Google Cloud" are structurally
 * identical to a capitalisation heuristic, so a broad rule either misses
 * invented staff names or drowns the admin in false positives on every product
 * mentioned in a resource article.
 *
 * Two shapes are unambiguous and are the two that matter here:
 *   an honorific followed by a name (Dr. Ramesh Varma, Smt. K. Lakshmi)
 *   Indian initial-led names (K. Naga Satya Rajesh, B. V. Chalamayya)
 */
export function candidatePeople(prose: string): string[] {
  const found = new Set<string>();
  /*
   * Full-word segments carry NO optional trailing period.
   *
   * The earlier `[A-Z][A-Za-z]*\.?\s*` swallowed the full stop at the end of a
   * sentence and kept going into the next one, so "Dr. Katikireddy Srinivas.
   * If you…" was extracted as the name "Katikireddy Srinivas. If" — which of
   * course matched nothing in the fact set, and flagged a real, correctly-cited
   * HOD as invented. Initials get their own alternative instead.
   */
  const WORD = "(?:[A-Z]\\.|[A-Z][a-z]+)";
  const patterns = [
    new RegExp(`\\b(?:Dr|Prof|Mr|Mrs|Ms|Shri|Sri|Smt)\\.?\\s+(${WORD}(?:\\s+${WORD}){0,3})`, "g"),
    new RegExp(`\\b((?:[A-Z]\\.\\s*){1,3}[A-Z][a-z]{2,}(?:\\s+[A-Z][a-z]{2,}){0,3})\\b`, "g"),
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(prose)) !== null) {
      const name = m[1].trim().replace(/\s+/g, " ");
      // A lone honorific ("Dr. Reddy" is fine, "Dr. The" is a false hit).
      if (name.split(/\s+/).every((w) => COMMON_CAPITALISED.has(w.toLowerCase().replace(/\.$/, "")))) continue;
      if (name.replace(/[.\s]/g, "").length < 4) continue;
      found.add(name);
    }
  }
  return [...found];
}

/** Capitalised multi-word sequences that look like a person or organisation. */
export function candidateEntities(prose: string): string[] {
  const found = new Set<string>();
  // Sentence-initial words are skipped by requiring a preceding non-boundary,
  // which is what keeps "Students often ask..." out of the results.
  const re = /(?<![.!?]\s|^|\n)\b([A-Z][a-z]{2,}(?:\s+(?:[A-Z][a-z]{2,}|[A-Z]\.))+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prose)) !== null) {
    const phrase = m[1].trim();
    const words = phrase.split(/\s+/);
    // Every word being an ordinary word means it is a capitalised heading
    // fragment, not a name.
    if (words.every((w) => COMMON_CAPITALISED.has(w.toLowerCase().replace(/\.$/, "")))) continue;
    if (words.every((w) => KNOWN_ACRONYMS.has(w.toLowerCase().replace(/\.$/, "")))) continue;
    found.add(phrase);
  }
  return [...found];
}

const BREAKDOWN_KEYS = [
  "factual grounding",
  "claim safety",
  "originality",
  "depth",
  "structure",
  "readability",
  "search fit",
  "linking",
  "imagery",
] as const;

export function runBlogQuality(input: BlogQualityInput): BlogQualityReport {
  const { topic, outline, bodyMd, title, excerpt } = input;
  const issues: BlogQualityIssue[] = [];
  const prose = toProse(bodyMd);
  const lower = prose.toLowerCase();
  const haystack = groundedHaystack();
  const words = countWords(bodyMd);

  const breakdown: Record<string, number> = Object.fromEntries(BREAKDOWN_KEYS.map((k) => [k, 100]));
  const penalise = (key: (typeof BREAKDOWN_KEYS)[number], amount: number) => {
    breakdown[key] = Math.max(0, breakdown[key] - amount);
  };

  // ---- 1. Forbidden claims -------------------------------------------------
  for (const rule of FORBIDDEN_CLAIM_PATTERNS) {
    const hit = prose.match(rule.pattern);
    if (hit) {
      issues.push({ severity: "critical", code: rule.code, message: `${rule.message} Found: "${hit[0].trim()}".` });
      penalise("claim safety", 40);
    }
  }

  for (const term of DEFAULT_BRAND.forbiddenTerminology) {
    if (lower.includes(term.toLowerCase())) {
      issues.push({
        severity: "critical",
        code: "forbidden_terminology",
        message: `Uses brand-forbidden phrase "${term}".`,
      });
      penalise("claim safety", 25);
    }
  }

  // ---- 2. Unverifiable figures --------------------------------------------
  // A figure is acceptable when it appears in the grounded facts, or when it is
  // plainly generic ("20 minutes", "3 steps"). Money, percentages and large
  // counts are the categories where invention does real damage.
  const unverifiedFigures: string[] = [];
  for (const { re } of FIGURE_PATTERNS) {
    for (const match of prose.match(re) ?? []) {
      const norm = match.toLowerCase().replace(/\s+/g, "").replace(/,/g, "");
      const inGround = haystack.replace(/\s+/g, "").replace(/,/g, "").includes(norm);
      if (!inGround) unverifiedFigures.push(match.trim());
    }
  }
  // Percentages and rupee figures are only a problem when the sentence is about
  // BVCITS — "spend 20% of your time on revision" is fine.
  const institutionalFigures = unverifiedFigures.filter((f) => {
    const idx = prose.indexOf(f);
    const window = prose.slice(Math.max(0, idx - 160), idx + 160).toLowerCase();
    return /bvcits|our college|this college|our campus|our students|our placement/.test(window);
  });
  if (institutionalFigures.length) {
    issues.push({
      severity: "critical",
      code: "unverified_figure",
      message: `States figures about BVCITS that are not in the grounded fact set: ${[...new Set(institutionalFigures)].slice(0, 5).join(", ")}. Remove them or replace with a verified figure.`,
    });
    penalise("factual grounding", 45);
  } else if (unverifiedFigures.length > 6) {
    issues.push({
      severity: "info",
      code: "many_figures",
      message: `${unverifiedFigures.length} numeric claims in the article. None are about BVCITS, but spot-check the general ones.`,
    });
  }

  // ---- 3. Unverified named entities ---------------------------------------
  // People are checked by name shape; organisations are checked separately and
  // only ever warned about, because editorial content legitimately mentions
  // companies and products (Coursera, Infosys) that are not in our fact set.
  const personShaped = candidatePeople(prose).filter((e) => !haystack.includes(e.toLowerCase()));
  const entities = candidateEntities(prose).filter(
    (e) => !haystack.includes(e.toLowerCase()) && !personShaped.some((p) => p.includes(e) || e.includes(p))
  );
  if (personShaped.length) {
    issues.push({
      severity: "critical",
      code: "unverified_person",
      message: `Names people who are not in the verified fact set: ${personShaped.slice(0, 4).join(", ")}. Publishing an invented staff or student name is a factual-integrity failure.`,
    });
    penalise("factual grounding", 50);
  } else if (entities.length > 8) {
    issues.push({
      severity: "warning",
      code: "many_entities",
      message: `${entities.length} named organisations/products appear that are not in the fact set (${entities.slice(0, 4).join(", ")}…). Fine for a resource article; verify they are real.`,
    });
    penalise("factual grounding", 5);
  }

  // ---- 4. AI slop ----------------------------------------------------------
  const slopHits = SLOP_PHRASES.filter((p) => lower.includes(p));
  if (slopHits.length) {
    issues.push({
      severity: slopHits.length >= 3 ? "critical" : "warning",
      code: "ai_slop",
      message: `Contains ${slopHits.length} stock AI phrase${slopHits.length === 1 ? "" : "s"}: ${slopHits.slice(0, 5).map((p) => `"${p}"`).join(", ")}.`,
    });
    penalise("originality", Math.min(60, slopHits.length * 18));
  }

  const openerHits = CONNECTIVE_OPENERS.filter((o) => new RegExp(`(?:^|\\n)\\s*${o}\\b`, "i").test(prose)).length;
  if (openerHits >= 2) {
    issues.push({
      severity: "warning",
      code: "connective_openers",
      message: `${openerHits} paragraphs open with a connective ("Furthermore", "Moreover"…). Rewrite those openings.`,
    });
    penalise("originality", 12);
  }

  // ---- 5. Depth and length -------------------------------------------------
  const target = outline.targetWords || 1500;
  if (words < target * 0.6) {
    issues.push({
      severity: "critical",
      code: "too_short",
      message: `Only ${words} words against a ${target}-word plan. Thin content does not rank and does not help the reader.`,
    });
    penalise("depth", 50);
  } else if (words < target * 0.8) {
    issues.push({ severity: "warning", code: "short", message: `${words} words against a ${target}-word plan.` });
    penalise("depth", 18);
  }

  // ---- 6. Structure --------------------------------------------------------
  const h2s = bodyMd.match(/^##\s+.+$/gm) ?? [];
  if (h2s.length < 3) {
    issues.push({
      severity: "critical",
      code: "no_structure",
      message: `Only ${h2s.length} H2 sections. The article needs scannable structure.`,
    });
    penalise("structure", 45);
  }
  if (/^#\s+/m.test(bodyMd)) {
    issues.push({
      severity: "warning",
      code: "duplicate_h1",
      message: "Body contains an H1. The page renders the title itself, so this creates two competing document headings.",
    });
    penalise("structure", 15);
  }

  const paragraphs = bodyMd
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith("#") && !p.startsWith("-") && !p.startsWith("|"));
  if (paragraphs.length) {
    const lengths = paragraphs.map((p) => countWords(p));
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
    const spread = Math.sqrt(variance) / (mean || 1);
    // Near-identical paragraph lengths throughout is the structural signature
    // of generated text, distinct from the phrase-level tells above.
    if (paragraphs.length >= 6 && spread < 0.28) {
      issues.push({
        severity: "warning",
        code: "uniform_rhythm",
        message: `Every paragraph is close to ${Math.round(mean)} words. Vary the rhythm — it currently reads as machine-written.`,
      });
      penalise("readability", 20);
    }
    const longOnes = lengths.filter((l) => l > 120).length;
    if (longOnes >= 3) {
      issues.push({ severity: "info", code: "long_paragraphs", message: `${longOnes} paragraphs exceed 120 words.` });
      penalise("readability", 8);
    }
  }

  // ---- 7. Search fit -------------------------------------------------------
  const keyword = topic.primaryKeyword.toLowerCase();
  if (keyword) {
    const occurrences = lower.split(keyword).length - 1;
    const inTitle = title.toLowerCase().includes(keyword.split(" ").slice(0, 2).join(" "));
    if (occurrences === 0 && !inTitle) {
      issues.push({
        severity: "warning",
        code: "keyword_absent",
        message: `The target phrase "${topic.primaryKeyword}" appears nowhere in the article or title.`,
      });
      penalise("search fit", 30);
    }
    const density = words ? occurrences / (words / 100) : 0;
    if (density > 2.2) {
      issues.push({
        severity: "warning",
        code: "keyword_stuffed",
        message: `"${topic.primaryKeyword}" appears ${occurrences} times (${density.toFixed(1)} per 100 words). That reads as stuffing.`,
      });
      penalise("search fit", 25);
    }
  }
  if (!excerpt || excerpt.length < 60) {
    issues.push({ severity: "warning", code: "weak_excerpt", message: "Excerpt is missing or too short for a meta description." });
    penalise("search fit", 12);
  }

  // ---- 8. Links ------------------------------------------------------------
  const links = extractLinks(bodyMd);
  const internal = links.filter((l) => l.startsWith("/"));
  const allowed = new Set(input.allowedLinks);
  const broken = internal.filter((l) => !allowed.has(l.split("#")[0]));
  if (broken.length) {
    issues.push({
      severity: "critical",
      code: "broken_internal_link",
      message: `Links to routes that do not exist: ${[...new Set(broken)].slice(0, 5).join(", ")}.`,
    });
    penalise("linking", 45);
  }
  if (!internal.length) {
    issues.push({ severity: "warning", code: "no_internal_links", message: "No internal links. The article is a dead end for the reader." });
    penalise("linking", 25);
  }

  // ---- 9. Imagery ----------------------------------------------------------
  if (!input.hasHeroImage) {
    issues.push({
      severity: "critical",
      code: "missing_hero_image",
      message:
        "No hero image. Every article needs one — it is the /blog card thumbnail, the social share image, and the `image` field of the article schema.",
    });
    penalise("imagery", 100);
  }

  // ---- score ---------------------------------------------------------------
  const overall = Math.round(
    BREAKDOWN_KEYS.reduce((sum, k) => sum + breakdown[k], 0) / BREAKDOWN_KEYS.length
  );
  const hasCritical = issues.some((i) => i.severity === "critical");

  return {
    overall,
    breakdown,
    issues,
    // A high score with a critical issue still fails: the score is an average,
    // and one invented placement figure is not offset by good structure.
    verdict: hasCritical || overall < 70 ? "needs_review" : "pass",
    revisions: [],
    checkedAt: nowIso(),
  };
}

/** The subset of issues worth sending back to the writer as a revise brief. */
export function revisionBrief(report: BlogQualityReport): string[] {
  return report.issues
    .filter((i) => i.severity === "critical" || i.severity === "warning")
    // Structure and link problems are fixed programmatically or by the admin;
    // handing them to the writer usually makes it rewrite the whole article.
    .filter((i) => !["broken_internal_link", "no_structure", "weak_excerpt"].includes(i.code))
    .map((i) => i.message);
}

/** One-line summary for the agent run log. */
export function qualitySummary(report: BlogQualityReport): string {
  const critical = report.issues.filter((i) => i.severity === "critical").length;
  const warnings = report.issues.filter((i) => i.severity === "warning").length;
  return `${report.overall}/100 — ${report.verdict === "pass" ? "passed" : "needs review"}; ${critical} critical, ${warnings} warning${warnings === 1 ? "" : "s"}.`;
}

/** Convenience for re-scoring a stored post (the studio's "re-check" action). */
export function rescore(post: BlogPost, outline: BlogOutline, topic: BlogTopic, allowedLinks: string[]): BlogQualityReport {
  return runBlogQuality({
    topic,
    outline,
    bodyMd: post.bodyMd,
    title: post.title,
    excerpt: post.excerpt,
    allowedLinks,
    hasHeroImage: Boolean(post.heroImageUrl),
  });
}

/** Exposed for the studio's provenance panel: what the writer was allowed to assert. */
export function groundingSnapshot(): Record<string, string> {
  return Object.fromEntries(groundedFacts().map((f) => [f.key, f.value]));
}
