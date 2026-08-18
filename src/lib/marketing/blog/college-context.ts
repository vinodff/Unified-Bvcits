// Grounding layer for the Blog Agent.
//
// Every number, name and claim a blog post is allowed to make about BVCITS
// comes from here, and from nowhere else. The writer receives this object as
// `context.grounded`; the quality gate re-reads it to verify that each figure
// in the finished prose actually appears in it.
//
// Why this exists as its own module rather than a prompt paragraph: see
// docs/AGENT-RULES.md and the fabricated-HOD-names incident. A model asked to
// write "an article about placements at BVCITS" will happily produce "92%
// placement rate" because that is what such articles say. Handing it the real
// figures and checking the output against them is the only reliable fix —
// asking it nicely is not.

import { BVCITS_META, RECRUITER_OFFERS, PLACEMENT_TOPPERS } from "@/data/bvcits-bot-knowledge";
import realDepartments from "@/data/real-departments.json";
import type { RealDept } from "@/data/departments";
import { site } from "@/lib/site";

export interface GroundedFact {
  key: string;
  value: string;
  /** Where it came from, so a wrong figure is traceable to one file. */
  source: string;
}

/**
 * The complete set of assertable facts, flattened to string values.
 *
 * Flat and stringly-typed on purpose: the quality gate does substring matching
 * over these values, and a nested structure would need a bespoke walker for
 * every new field.
 */
export function groundedFacts(): GroundedFact[] {
  const facts: GroundedFact[] = [
    { key: "collegeName", value: BVCITS_META.institutionName, source: "bvcits-bot-knowledge.ts" },
    { key: "shortName", value: site.shortName, source: "site.ts" },
    { key: "location", value: BVCITS_META.campusLocation, source: "bvcits-bot-knowledge.ts" },
    { key: "district", value: "Dr. B.R. Ambedkar Konaseema District, Andhra Pradesh", source: "bvcits-bot-knowledge.ts" },
    { key: "accreditation", value: BVCITS_META.accreditation, source: "bvcits-bot-knowledge.ts" },
    { key: "counsellingCode", value: BVCITS_META.counsellingCode, source: "site.ts" },
    { key: "campusSize", value: BVCITS_META.campusSize, source: "bvcits-bot-knowledge.ts" },
    { key: "facultyStrength", value: BVCITS_META.facultyStrength, source: "bvcits-bot-knowledge.ts" },
    { key: "graduates", value: BVCITS_META.graduates, source: "bvcits-bot-knowledge.ts" },
    { key: "highestPackage", value: BVCITS_META.highestPlacementPackage, source: "home-content.ts (via bot knowledge)" },
    { key: "averagePackage", value: BVCITS_META.averagePlacementPackage, source: "home-content.ts (via bot knowledge)" },
    { key: "totalPlacements", value: BVCITS_META.totalPlacements2026, source: "home-content.ts (via bot knowledge)" },
    { key: "topRecruiters", value: BVCITS_META.topRecruiters.join(", "), source: "bvcits-bot-knowledge.ts" },
    { key: "recognitions", value: BVCITS_META.recognitions.join(", "), source: "bvcits-bot-knowledge.ts" },
    { key: "phone", value: BVCITS_META.admissionsHelpline, source: "site.ts" },
    { key: "email", value: BVCITS_META.email, source: "site.ts" },
    { key: "website", value: BVCITS_META.liveUrl, source: "site.ts" },
  ];

  for (const offer of RECRUITER_OFFERS) {
    facts.push({
      key: `package.${offer.company.toLowerCase().replace(/\s+/g, "-")}`,
      value: `${offer.company} — ${offer.pkg}`,
      source: "bvcits-bot-knowledge.ts (RECRUITER_OFFERS)",
    });
  }

  // Named students are the highest-risk category: a misattributed package is a
  // real person's real salary published wrongly. Included so the writer can
  // cite them correctly, and so the gate can catch a name it was never given.
  for (const t of PLACEMENT_TOPPERS) {
    facts.push({
      key: `topper.${t.roll}`,
      value: `${t.name} (${t.branch}) — ${t.package} at ${t.recruiter}`,
      source: "bvcits-bot-knowledge.ts (PLACEMENT_TOPPERS)",
    });
  }

  const depts = realDepartments as Record<string, RealDept>;
  for (const [slug, d] of Object.entries(depts)) {
    if (d.name) {
      facts.push({ key: `dept.${slug}`, value: d.name, source: "real-departments.json" });
    }
    // Only verified heads. A department without a published head stays absent
    // rather than acquiring a plausible-sounding one.
    if (d.hod?.name) {
      facts.push({
        key: `hod.${slug}`,
        value: `${d.hod.name}${d.hod.designation ? `, ${d.hod.designation}` : ""} — ${d.name ?? slug}`,
        source: "real-departments.json",
      });
    }
  }

  return facts;
}

/** Fact lookup as a plain record, which is the shape handed to the LLM context. */
export function groundedRecord(): Record<string, string> {
  return Object.fromEntries(groundedFacts().map((f) => [f.key, f.value]));
}

/**
 * Every proper noun and figure the post is permitted to contain.
 *
 * Used by the quality gate's unverified-entity check: a capitalised name or a
 * ₹/percentage figure in the prose that has no match in this haystack is
 * flagged, because the model had no source for it.
 */
export function groundedHaystack(): string {
  return groundedFacts()
    .map((f) => f.value)
    .join(" | ")
    .toLowerCase();
}

/**
 * Claims a BVCITS blog post must never make, regardless of who asked for them.
 *
 * The first three are the ones that matter most for this project's stated goal
 * of ranking for "top colleges in Konaseema". Writing a listicle that ranks
 * named competitor colleges below BVCITS means publishing (a) a ranking nobody
 * produced, and (b) a disparaging factual claim about a named third party.
 * The honest version of that content — "what to check when choosing an
 * engineering college in Konaseema" — competes for the same query and is the
 * form the topic scout is instructed to generate.
 */
export const FORBIDDEN_CLAIM_PATTERNS: { code: string; pattern: RegExp; message: string }[] = [
  {
    code: "self_ranking",
    pattern: /\b(?:no\.?\s*1|number\s*one|#1|top\s*(?:1|one)|best)\b[^.]{0,60}\b(?:college|institute|engineering)\b/i,
    message:
      "Claims a #1 / best-college ranking. No such ranking has been published for BVCITS — state verifiable accreditations (Autonomous, NAAC 'A') instead.",
  },
  {
    code: "competitor_ranking",
    pattern: /\b(?:better than|ahead of|outperforms|compared to)\b[^.]{0,50}\b(?:college|institute|university)\b/i,
    message:
      "Ranks or disparages another named institution. Comparative claims about competitors are unverifiable and legally exposed — compare against criteria, not colleges.",
  },
  {
    code: "guaranteed_outcome",
    // No trailing \b after the alternation: "100%" ends on a non-word
    // character, so \b there requires a word character next and the whole rule
    // silently never matched "100% placement" — the single most important
    // phrase it exists to catch.
    // Stems, not exact words: "guarantees", "guaranteeing" and "assures" are
    // the same promise as "guaranteed", and matching only the past participle
    // let the most natural phrasing ("BVCITS guarantees placement") straight
    // through.
    pattern: /(?:\b100\s?%|\bguarantee\w*|\bassur(?:ed|es|ing)\b|\bsure[- ]shot\b)[^.]{0,40}\b(?:placement|job|admission|package|selection)\b/i,
    message: "Guarantees a placement or admission outcome. Nothing about an individual's placement can be guaranteed.",
  },
  {
    code: "fabricated_survey",
    pattern: /\b(?:studies show|research shows|surveys? (?:show|found)|according to (?:a|our) (?:study|survey|report))\b/i,
    message: "Cites a study or survey with no source. Either name and link the real source or drop the claim.",
  },
  {
    code: "absolute_superlative",
    pattern: /\b(?:world'?s best|the best college|finest institution|unmatched|second to none)\b/i,
    message: "Unfalsifiable superlative — on the brand's forbidden-terminology list.",
  },
];

/**
 * The site sections a blog post may link to. Resolved against the real app
 * directory at run time by the outline agent; this is the curated subset worth
 * linking from editorial content, with human labels.
 */
export const PREFERRED_INTERNAL_LINKS: { label: string; href: string; topics: string[] }[] = [
  { label: "Admissions", href: "/admissions", topics: ["admission", "apply", "eap", "counselling", "fee", "seat"] },
  { label: "Departments", href: "/departments", topics: ["branch", "department", "course", "cse", "ece", "eee", "civil", "mechanical", "mba", "mca"] },
  { label: "Placements Cell", href: "/placements-cell", topics: ["placement", "job", "recruiter", "package", "career", "interview", "internship"] },
  { label: "For Students", href: "/students", topics: ["student", "study", "exam", "library", "hostel", "club"] },
  { label: "For Parents", href: "/parents", topics: ["parent", "fee", "safety", "transport", "hostel", "attendance"] },
  { label: "For Recruiters", href: "/recruiters", topics: ["recruiter", "hiring", "campus drive", "company"] },
  { label: "Campus Experience", href: "/experience", topics: ["campus", "life", "culture", "fest", "sports", "facility"] },
  { label: "Contact Us", href: "/contact-us", topics: ["contact", "visit", "enquiry", "phone", "address"] },
  { label: "About BVCITS", href: "/about-us", topics: ["about", "history", "vision", "management", "accreditation"] },
];

/** Picks the links whose topics actually match the article, capped so the prose stays readable. */
export function relevantInternalLinks(text: string, max = 5): { label: string; href: string }[] {
  const haystack = text.toLowerCase();
  const scored = PREFERRED_INTERNAL_LINKS.map((l) => ({
    link: { label: l.label, href: l.href },
    score: l.topics.reduce((n, t) => (haystack.includes(t) ? n + 1 : n), 0),
  }));
  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  // Admissions is the one link that belongs on every post — it is the action a
  // reader convinced by the article would take next.
  const fallback = { label: "Admissions", href: "/admissions" };
  const picked = matched.slice(0, max).map((s) => s.link);
  if (!picked.some((p) => p.href === fallback.href)) picked.push(fallback);
  return picked.slice(0, max);
}
