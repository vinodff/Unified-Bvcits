// Turning pasted or extracted resume text into structured sections.
//
// This has to cope with genuinely hostile input. A PDF export routinely
// arrives with headings welded to the previous sentence
// ("...simplify work.PROFILE / SUMMARYEDUCATIONB.TECH CSE STUDENT..."),
// with no blank lines between entries, and with the candidate's name buried
// after a summary paragraph. pdf-text.ts repairs most of that upstream, but
// this module must still degrade gracefully when it cannot.
//
// Three passes:
//   1. reflow  — re-inject line breaks lost by a flattening extractor
//   2. bucket  — assign every line to a section
//   3. shape   — split each bucket into entries and fields
//
// Everything here is verbatim extraction, never rewriting: whatever comes out
// must be findable in the input, because this output is what the evidence map
// and the "before" score are computed from.

import { splitSkillList } from "./skills";
import { emptySections } from "./types";
import type { ResumeSections } from "./types";

type SectionKey = "summary" | "education" | "experience" | "projects" | "skills" | "certifications" | "achievements";

/**
 * Heading aliases, matched longest-first so "technical skills" wins over
 * "skills" and cannot leave a stray "technical" behind.
 */
const HEADING_ALIASES: Record<SectionKey, readonly string[]> = {
  summary: ["profile / summary", "professional summary", "career objective", "summary", "objective", "profile", "about me"],
  education: ["educational qualifications", "education & training", "academic background", "qualifications", "education", "academics"],
  experience: ["professional experience", "work experience", "employment history", "internship experience", "internships", "experience", "employment", "internship"],
  projects: ["academic projects", "personal projects", "key projects", "projects", "project"],
  skills: ["technical skills", "core competencies", "skills & abilities", "key skills", "skills", "technologies", "tech stack"],
  certifications: ["certifications & courses", "certifications", "certificates", "certification", "courses", "licenses"],
  achievements: ["achievements & awards", "accomplishments", "achievements", "awards", "honors", "honours", "extracurricular"],
};

const ALL_HEADINGS: { key: SectionKey; alias: string }[] = Object.entries(HEADING_ALIASES)
  .flatMap(([key, aliases]) => aliases.map((alias) => ({ key: key as SectionKey, alias })))
  .sort((a, b) => b.alias.length - a.alias.length);

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w]{2,}/;
const PHONE_RE = /(?:\+?\d[\d\s()-]{8,}\d)/;
const URL_RE = /(?:https?:\/\/|www\.)[^\s,]+|(?:linkedin|github)\.com\/[^\s,]+/i;
const YEAR_RANGE_RE = /\(?\b((?:19|20)\d{2}\s*[–—-]\s*(?:(?:19|20)\d{2}|present|current|ongoing)|(?:19|20)\d{2})\b\)?/i;
const BULLET_RE = /^[•●▪◦*·+-]\s*/;

function normalizeHeading(line: string): string {
  return line
    .replace(/[:：]/g, " ")
    .replace(/[^a-zA-Z&/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** A line is a heading when, stripped of punctuation, it is exactly an alias. */
function headingOf(line: string): SectionKey | null {
  const normalized = normalizeHeading(line);
  if (!normalized || normalized.length > 40) return null;
  return ALL_HEADINGS.find((h) => h.alias === normalized)?.key ?? null;
}

/**
 * Peels known headings off the front of an ALL-CAPS run.
 *
 * A flattened PDF welds consecutive headings together — "PROFILE /
 * SUMMARYEDUCATION" is two headings and the start of a third. Matching
 * aliases only inside an all-caps run is what makes this safe: the same words
 * in body text ("...development skills, AI prompt...") are mixed case and are
 * never touched. An earlier case-insensitive version got this wrong and
 * shredded the summary paragraph.
 */
function splitCapsHeadings(line: string): string[] {
  if (!/[A-Z]/.test(line) || line !== line.toUpperCase()) return [line];

  const out: string[] = [];
  let rest = line.trim();

  // Bounded: each iteration either consumes an alias or stops.
  for (let guard = 0; guard < 12 && rest; guard++) {
    const normalizedRest = normalizeHeading(rest);
    const hit = ALL_HEADINGS.find(({ alias }) => normalizedRest.startsWith(alias));
    if (!hit) break;

    // Walk the raw string far enough to cover the alias's letters, so
    // punctuation and spacing inside it ("PROFILE / SUMMARY") is consumed too.
    const wanted = hit.alias.replace(/[^a-z&]/g, "").length;
    let seen = 0;
    let cut = 0;
    while (cut < rest.length && seen < wanted) {
      if (/[a-zA-Z&]/.test(rest[cut])) seen++;
      cut++;
    }

    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  if (rest) out.push(rest);
  return out.length > 0 ? out : [line];
}

/**
 * Matches any known heading written in caps, however it is glued to its
 * neighbours. Longest alias first (ALL_HEADINGS is already sorted that way)
 * so "TECHNICAL SKILLS" wins over a bare "SKILLS".
 */
const CAPS_HEADING_RE = new RegExp(
  `(${ALL_HEADINGS.map(({ alias }) =>
    alias
      .toUpperCase()
      .replace(/[/&]/g, (c) => `\\s*\\${c}\\s*`)
      .replace(/ /g, "\\s+")
  ).join("|")})`,
  "g"
);

/**
 * Pass 1 — repair text that lost its line breaks.
 *
 * Only runs when the input looks flat (very long lines), so a well-formed
 * paste is never mangled. Works off letter-case transitions rather than word
 * matching, because in a real PDF export the heading is the ALL-CAPS run and
 * the body is mixed case — that distinction survives flattening even though
 * the newlines did not.
 */
export function reflow(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/ /g, " ");
  const longest = normalized.split("\n").reduce((max, l) => Math.max(max, l.length), 0);
  if (longest < 160) return normalized;

  // Isolating known headings FIRST is what makes the rest tractable. The two
  // generic case-transition rules below conflict on real input —
  // "PROJECTSCollege" must split after PROJECTS while "KONDETIvinod" must
  // split after KONDETI, and no single greedy rule gets both right. Pulling
  // the headings onto their own lines removes every case where it matters.
  const repaired = normalized
    .replace(CAPS_HEADING_RE, "\n$1\n")
    // "...simplify work.PROFILE" — body text running into a caps run.
    .replace(/([a-z.,;:)\]])([A-Z]{2,})/g, "$1\n$2")
    // "KONDETIvinodkondeti081@..." — caps run running into lowercase.
    .replace(/([A-Z]{2,})([a-z])/g, "$1\n$2");

  return repaired
    .split("\n")
    .flatMap((line) => splitCapsHeadings(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

interface Buckets {
  header: string[];
  sections: Map<SectionKey, string[]>;
}

/** Pass 2 — assign every line to the section heading above it. */
function bucket(lines: string[]): Buckets {
  const header: string[] = [];
  const sections = new Map<SectionKey, string[]>();
  let active: SectionKey | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    const heading = line ? headingOf(line) : null;

    if (heading) {
      active = heading;
      if (!sections.has(active)) sections.set(active, []);
      continue;
    }

    if (active) sections.get(active)?.push(raw);
    else if (line) header.push(line);
  }

  return { header, sections };
}

/**
 * Splits a bucket into entries.
 *
 * A blank line is the clearest signal, but plenty of resumes have none — so a
 * line carrying a date range also starts a new entry, since that is how a job
 * or degree announces itself. Bullets never start an entry: they belong to
 * whatever preceded them.
 */
function splitEntries(lines: string[]): string[][] {
  const entries: string[][] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length) entries.push(current);
    current = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }

    const isBullet = BULLET_RE.test(line);
    const startsNewEntry = !isBullet && current.length > 0 && YEAR_RANGE_RE.test(line) && current.some((l) => !BULLET_RE.test(l));

    if (startsNewEntry) flush();
    current.push(line);
  }

  flush();
  return entries;
}

function extractYears(line: string): { text: string; years: string } {
  const match = line.match(YEAR_RANGE_RE);
  if (!match) return { text: line.trim(), years: "" };
  return {
    text: line.replace(match[0], "").replace(/[|,–—-]\s*$/, "").replace(/\s{2,}/g, " ").trim(),
    years: match[1].trim(),
  };
}

/** Bullets in an entry: explicitly marked ones, or every line after the header. */
function bulletsOf(entry: string[]): string[] {
  const marked = entry.filter((l) => BULLET_RE.test(l)).map((l) => l.replace(BULLET_RE, "").trim());
  if (marked.length > 0) return marked.filter(Boolean);
  return entry.slice(1).map((l) => l.trim()).filter(Boolean);
}

/** Splits "Acme Corp — Backend Intern" into its two halves on any common separator. */
function splitOrgRole(text: string): [string, string] {
  const parts = text.split(/\s+[|–—•]\s+|\s+-\s+|\s+,\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts.slice(1).join(", ")];
  return [text.trim(), ""];
}

const NAME_RE = /^[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){1,3}$/;

/**
 * Finds the candidate's name.
 *
 * Preferring a name-SHAPED line over "the first line" is what stops a summary
 * paragraph being promoted to the name — the defect that rendered a whole
 * paragraph as a three-line all-caps title on the optimized document. A
 * two-column PDF often puts the summary above the name, so the header block
 * alone is not enough and the search widens to the top of the document.
 */
function findName(header: string[], allLines: string[]): string {
  const isCandidate = (l: string) =>
    l.length <= 45 && !EMAIL_RE.test(l) && !PHONE_RE.test(l) && !URL_RE.test(l) && !/\d/.test(l) && NAME_RE.test(l.trim());

  return (
    header.find(isCandidate) ??
    // ALL-CAPS names ("VINOD KUMAR KONDETI") fail the Title-Case test above.
    header.find((l) => l.length <= 45 && !/\d/.test(l) && /^[A-Z][A-Z\s.'-]{4,}$/.test(l.trim()) && !headingOf(l)) ??
    allLines.slice(0, 40).find((l) => !headingOf(l) && isCandidate(l.trim())) ??
    allLines.slice(0, 40).find((l) => {
      const t = l.trim();
      return t.length <= 45 && !/\d/.test(t) && /^[A-Z][A-Z\s.'-]{4,}$/.test(t) && !headingOf(t);
    })?.trim() ??
    ""
  );
}

export function parsePastedResume(text: string): ResumeSections {
  const sections = emptySections();
  const reflowed = reflow(text);
  const lines = reflowed.split("\n");
  const { header, sections: buckets } = bucket(lines);

  // ---- Contact: searched across the whole document, since a flattened export
  // gives no guarantee the header block is where these ended up. ----
  sections.contact.email = reflowed.match(EMAIL_RE)?.[0] ?? "";
  sections.contact.phone = reflowed.match(PHONE_RE)?.[0]?.trim() ?? "";
  sections.contact.fullName = findName(header, lines);

  const nameLine = sections.contact.fullName;
  const locationLine = header.find(
    (l) =>
      l.trim() !== nameLine &&
      l.includes(",") &&
      !EMAIL_RE.test(l) &&
      !PHONE_RE.test(l) &&
      !URL_RE.test(l) &&
      !/\d/.test(l) &&
      l.length <= 80
  );
  sections.contact.location = locationLine?.trim() ?? "";

  // ---- Summary ----
  const summaryLines = buckets.get("summary");
  const bucketedSummary = summaryLines?.map((l) => l.trim()).filter(Boolean).join(" ").trim() ?? "";
  if (bucketedSummary.length >= 40) {
    sections.summary = bucketedSummary;
  } else {
    // No usable summary heading. A long prose line anywhere near the top is a
    // summary in all but name — common when a two-column PDF puts the text
    // above its own heading.
    const prose = lines.map((l) => l.trim()).find((l) => l.length > 120 && l !== nameLine && !headingOf(l));
    sections.summary = prose ?? bucketedSummary;
  }

  // ---- Education ----
  for (const entry of splitEntries(buckets.get("education") ?? [])) {
    const { text: head, years } = extractYears(entry[0] ?? "");
    const rest = entry.slice(1).map((l) => l.replace(BULLET_RE, "").trim()).filter(Boolean);
    if (!head && rest.length === 0) continue;
    sections.education.push({ institution: head, degree: rest[0] ?? "", years, detail: rest.slice(1).join(" · ") });
  }

  // ---- Experience ----
  for (const entry of splitEntries(buckets.get("experience") ?? [])) {
    const { text: head, years } = extractYears(entry[0] ?? "");
    const [organization, role] = splitOrgRole(head);
    if (!organization) continue;
    sections.experience.push({ organization, role, years, bullets: bulletsOf(entry) });
  }

  // ---- Projects ----
  for (const entry of splitEntries(buckets.get("projects") ?? [])) {
    const { text: head } = extractYears(entry[0] ?? "");
    const [name, stack] = splitOrgRole(head);
    if (!name) continue;
    sections.projects.push({ name, stack, bullets: bulletsOf(entry) });
  }

  // ---- Skills ----
  const skillLines = buckets.get("skills");
  if (skillLines) {
    // Strip "Category:" prefixes — "Languages: Python, Java" should contribute
    // the languages, not a skill literally called "languages".
    const cleaned = skillLines
      .map((l) => l.replace(BULLET_RE, "").replace(/^[A-Za-z &/]{3,30}:\s*/, "").trim())
      .filter(Boolean);
    sections.skills = splitSkillList(cleaned.join(", ")).filter((s) => s.length <= 40);
  }

  // ---- Certifications (achievements fold in; both read as credentials) ----
  const certLines = [...(buckets.get("certifications") ?? []), ...(buckets.get("achievements") ?? [])];
  for (const entry of splitEntries(certLines)) {
    const { text: head, years } = extractYears(entry[0] ?? "");
    const name = head.replace(BULLET_RE, "").trim();
    if (!name) continue;
    const [certName, issuer] = splitOrgRole(name);
    sections.certifications.push({
      name: certName,
      issuer: issuer || (entry[1]?.replace(BULLET_RE, "").trim() ?? ""),
      year: years,
    });
  }

  return sections;
}
