// Link catalog + department entity resolution.
//
// LINK RULE: every href here is either a route that exists in this app (see
// `src/app/**/page.tsx`) or a URL verified present in `scrape/urls.json` (300 URLs crawled
// from the live site). The previous engine linked to `/examinations/autonomous/results`,
// which has no page here and silently fell through to the `[...slug]` "being migrated"
// stub — a dead end presented as an answer. Nothing in this file points at that stub.

import { HOD_DIRECTORY, type HodInfo } from "@/data/bvcits-bot-knowledge";
import { hasAlias, hasTeluguStem, isTelugu } from "./normalize";
import type { DeptEntity } from "./types";

/** Routes implemented in this app. */
export const LOCAL_ROUTES = {
  home: "/",
  about: "/about-us",
  admissions: "/admissions",
  departments: "/departments",
  placements: "/placements-cell",
  contact: "/contact-us",
  experience: "/experience",
} as const;

/** Live-site URLs for sections not yet built locally (all verified in scrape/urls.json). */
export const LIVE_ROUTES = {
  examinationsAutonomous: "https://bvcits.edu.in/examinations/autonomous/",
  examinationsJntuk: "https://bvcits.edu.in/examinations/jntuk/",
  library: "https://bvcits.edu.in/library/",
  nirf: "https://bvcits.edu.in/nirf/",
  naacSsr: "https://bvcits.edu.in/iqac/naac-ssr/",
  apply: "https://apply.bvcits.edu.in/",
} as const;

/** Department detail sections that exist under /departments/[slug]/[section]. */
export const DEPT_SECTIONS = {
  hod: "hod",
  faculty: "faculty",
  syllabus: "syllabus",
  placements: "placements",
  infrastructure: "infrastructure",
  visionMission: "vision-mission",
  admissions: "students-admissions",
  toppers: "students-toppers",
  internships: "students-internships",
} as const;

export function deptUrl(slug: string, section?: string): string {
  return section ? `/departments/${slug}/${section}` : `/departments/${slug}`;
}

/**
 * Department aliases. Latin aliases match whole tokens only; Telugu aliases match as
 * stems (prefix) because Telugu attaches case endings to the noun.
 *
 * Note the absent entries: bare "ai" and "ds" are NOT aliases, because they collide with
 * ordinary English words. "ai ds", "aids", "data science" are unambiguous and safe.
 */
interface DeptAliases {
  key: string;
  short: string;
  latin: string[];
  telugu: string[];
}

const DEPT_ALIASES: DeptAliases[] = [
  {
    key: "cse",
    short: "CSE",
    latin: ["cse", "csc", "computer", "computers", "computer science", "software", "cs"],
    telugu: ["కంప్యూటర్", "సీఎస్‌ఈ", "సిఎస్ఈ", "సిఎస్సి", "సీఎస్సీ"],
  },
  {
    key: "aids",
    short: "AI & DS",
    latin: ["aids", "ai ds", "aids", "data science", "datascience", "ai and ds"],
    telugu: ["డేటా సైన్స్", "డేటాసైన్స్"],
  },
  {
    key: "aiml",
    short: "AI & ML",
    latin: ["aiml", "ai ml", "machine learning", "machinelearning", "ml", "ai and ml"],
    telugu: ["మెషిన్ లెర్నింగ్"],
  },
  {
    key: "ece",
    short: "ECE",
    latin: ["ece", "electronics", "communication", "ecs"],
    telugu: ["ఈసీఈ", "ఎలక్ట్రానిక్స్"],
  },
  {
    key: "eee",
    short: "EEE",
    latin: ["eee", "electrical"],
    telugu: ["ఈఈఈ", "ఎలక్ట్రికల్"],
  },
  {
    key: "mech",
    short: "MECH",
    latin: ["mech", "mechanical", "me"],
    telugu: ["మెకానికల్"],
  },
  {
    key: "civil",
    short: "CIVIL",
    latin: ["civil", "ce"],
    telugu: ["సివిల్"],
  },
  {
    key: "mba",
    short: "MBA",
    latin: ["mba", "management", "business administration"],
    telugu: ["ఎంబీఏ", "ఎంబా", "మేనేజ్‌మెంట్"],
  },
  {
    key: "mca",
    short: "MCA",
    latin: ["mca", "computer applications"],
    telugu: ["ఎంసీఏ", "ఎంసిఎ"],
  },
  {
    key: "sh",
    short: "S&H",
    latin: ["science humanities", "humanities", "basic sciences"],
    telugu: ["హ్యుమానిటీస్"],
  },
];

/**
 * Resolves the department a query is about. Returns the highest-scoring match so
 * "CSE AI ML" resolves to the more specific AIML rather than whichever matched first.
 */
export function resolveDepartment(tokens: string[]): DeptEntity | undefined {
  let best: { entry: DeptAliases; score: number } | undefined;

  for (const entry of DEPT_ALIASES) {
    let score = 0;

    for (const alias of entry.latin) {
      if (hasAlias(tokens, alias)) {
        const words = alias.split(" ").length;
        score = Math.max(score, 1 + (words - 1) * 0.9 + alias.length / 40);
      }
    }
    for (const alias of entry.telugu) {
      if (isTelugu(alias) && alias.split(" ").every((p) => hasTeluguStem(tokens, p))) {
        score = Math.max(score, 1.2);
      }
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }

  if (!best) return undefined;
  const hod: HodInfo | undefined = HOD_DIRECTORY[best.entry.key];
  if (!hod) return undefined;

  return { key: best.entry.key, short: best.entry.short, hod };
}

/** All departments, for "what courses do you offer" style questions. */
export function allDepartments(): DeptEntity[] {
  return DEPT_ALIASES.filter((d) => HOD_DIRECTORY[d.key]).map((d) => ({
    key: d.key,
    short: d.short,
    hod: HOD_DIRECTORY[d.key],
  }));
}
