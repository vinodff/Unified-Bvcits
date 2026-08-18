// Topic Scout — proposes the daily shortlist of blog ideas.
//
// Two sources, merged:
//   1. A seed bank of archetypes that are known to serve BVCITS's two real
//      audiences (students, parents) and to match how they actually search.
//      Deterministic, works offline, and is the floor the output can never
//      fall below.
//   2. The routed LLM, given the season, the grounded college context and the
//      titles already published, asked for fresh angles.
//
// The seed bank is not a fallback of last resort — it is the quality floor.
// A model asked for "10 blog topics for a college" returns ten variations of
// "Why choose our college", which is worth nothing to a reader and nothing to
// search. Seeding the request with real archetypes and then de-duplicating
// against what is already published is what makes the batch usable.

import { getLlm } from "../../providers/llm";
import { parseLlmJson } from "../../providers/llm-json";
import type { BlogAudience, BlogCategory, BlogTopic } from "../domain";
import { BLOG_CATEGORIES, istDate, newId, nowIso, slugify } from "../domain";
import { groundedRecord } from "../college-context";

export const TOPICS_PER_BATCH = 10;

interface SeedTopic {
  title: string;
  angle: string;
  rationale: string;
  searchIntent: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  promoAngle: string;
  audience: BlogAudience;
  category: BlogCategory;
  baseScore: number;
  /** Months (1–12, IST) where this topic is at peak search demand. */
  peakMonths: number[];
}

/**
 * The seed bank.
 *
 * Note what is deliberately absent: any "Top 5 colleges in Konaseema" style
 * ranking listicle. Ranking named competitor institutions means publishing a
 * ranking nobody produced and a disparaging claim about a third party. The
 * entries below chase the same searches honestly — someone typing "best
 * engineering college in Konaseema" is really asking "how do I choose one",
 * and an article that answers that question genuinely is the one that both
 * ranks and converts. See FORBIDDEN_CLAIM_PATTERNS in ../college-context.ts.
 */
const SEED_BANK: SeedTopic[] = [
  {
    title: "How to Choose an Engineering College in Konaseema: 9 Things to Check Before You Lock a Seat",
    angle: "A checklist a parent can actually use during counselling — accreditation, labs, placement transparency, transport, fee clarity.",
    rationale: "Parents in Konaseema search this every June–July and find only advertisements. A genuinely neutral checklist is the highest-value page we can own.",
    searchIntent: "Comparison / decision support before AP EAPCET counselling",
    primaryKeyword: "engineering college in Konaseema",
    secondaryKeywords: ["best engineering college Amalapuram", "how to choose engineering college", "AP EAPCET counselling tips"],
    promoAngle: "BVCITS meets every item on the checklist and can be cited as a worked example — the checklist stands on its own without it.",
    audience: "parents",
    category: "Admissions Guide",
    baseScore: 92,
    peakMonths: [5, 6, 7, 8],
  },
  {
    title: "How to Get a High-Package Placement from a Tier-3 Engineering College",
    angle: "The actual sequence — DSA from year two, one deep skill, real projects, mock interviews — with what BVCITS students who landed ₹15L+ actually did.",
    rationale: "The single most searched student anxiety, and we have real verified outcomes to ground it in rather than motivational filler.",
    searchIntent: "How-to / career planning",
    primaryKeyword: "how to get high package placement",
    secondaryKeywords: ["tier 3 college placement", "campus placement preparation", "engineering placement roadmap"],
    promoAngle: "Cite the verified BVCITS placement figures as evidence the path works, and link the Placements Cell page.",
    audience: "students",
    category: "Career & Placements",
    baseScore: 95,
    peakMonths: [1, 2, 8, 9, 10, 11],
  },
  {
    title: "5 Study Techniques That Actually Work for Engineering Students (and 3 That Waste Your Time)",
    angle: "Spaced repetition, active recall, the Feynman method, past-paper drilling, teaching a peer — against re-reading, highlighting and marathon cramming.",
    rationale: "Evergreen, shareable, and the kind of post students bookmark before semester exams. Pure utility, zero promotion needed.",
    searchIntent: "How-to / self-improvement",
    primaryKeyword: "study techniques for engineering students",
    secondaryKeywords: ["how to study for semester exams", "active recall", "best study methods B.Tech"],
    promoAngle: "None needed beyond the byline. Trust first; the reader finds the college through the article.",
    audience: "students",
    category: "Study Skills",
    baseScore: 88,
    peakMonths: [1, 3, 5, 11, 12],
  },
  {
    title: "12 Free Websites Every Engineering Student in India Should Be Using",
    angle: "NPTEL, SWAYAM, Coursera audit mode, freeCodeCamp, GeeksforGeeks, LeetCode, Kaggle — with what each one is genuinely good for and what it is not.",
    rationale: "High-share resource listicle, easy to keep current, and it establishes us as a source of practical help rather than promotion.",
    searchIntent: "Resource discovery",
    primaryKeyword: "free websites for engineering students",
    secondaryKeywords: ["best learning platforms for B.Tech", "free coding practice sites", "NPTEL courses"],
    promoAngle: "Mention the campus resources that complement them — Cisco Networking Academy, Pearson VUE test centre — both verifiable.",
    audience: "students",
    category: "Technology & Skills",
    baseScore: 85,
    peakMonths: [6, 7, 8, 9],
  },
  {
    title: "10 Books Every Engineering Student Should Read Before They Graduate",
    angle: "Split into three shelves: thinking, career, and the one technical book per branch that is worth owning.",
    rationale: "Evergreen, links well, and appeals to parents as much as students — a rare topic that both audiences share.",
    searchIntent: "Recommendation / resource discovery",
    primaryKeyword: "books for engineering students",
    secondaryKeywords: ["must read books B.Tech", "books for college students India", "career books for students"],
    promoAngle: "Reference the campus library as the place to find them. No hard sell.",
    audience: "both",
    category: "Study Skills",
    baseScore: 80,
    peakMonths: [6, 7, 12],
  },
  {
    title: "CSE, AI & DS, or ECE? A Straight Answer on Choosing Your B.Tech Branch",
    angle: "What each branch actually leads to in the AP job market, who each one suits, and the honest downside of the popular choice.",
    rationale: "The decision every EAPCET candidate agonises over. We can answer it with our own real department and placement data.",
    searchIntent: "Comparison / decision support",
    primaryKeyword: "which engineering branch to choose",
    secondaryKeywords: ["CSE vs AI DS", "best branch for placements", "B.Tech branch selection"],
    promoAngle: "Every branch named is one we run — the article naturally surfaces the department pages.",
    audience: "students",
    category: "Admissions Guide",
    baseScore: 90,
    peakMonths: [5, 6, 7],
  },
  {
    title: "A Parent's Guide to the First Year of B.Tech: What Changes, What to Watch For",
    angle: "Attendance rules, backlogs, hostel adjustment, the mid-first-year slump, and the three warning signs worth a phone call to the department.",
    rationale: "Almost nobody writes for parents. It is an underserved query with real emotional weight and it builds enormous institutional trust.",
    searchIntent: "Guidance / reassurance",
    primaryKeyword: "parents guide B.Tech first year",
    secondaryKeywords: ["engineering first year problems", "hostel life first year", "how parents can support engineering students"],
    promoAngle: "Points to the parents' portal and the department contact route — a real service, not a pitch.",
    audience: "parents",
    category: "Parents' Corner",
    baseScore: 84,
    peakMonths: [7, 8, 9],
  },
  {
    title: "How to Build an Engineering Resume When You Have No Work Experience",
    angle: "Projects as experience, the one-page rule, ATS formatting, and the sections to delete — with a before/after example.",
    rationale: "Directly actionable, high intent, and it connects to the placement story without needing to make a single claim about the college.",
    searchIntent: "How-to / template seeking",
    primaryKeyword: "engineering resume without experience",
    secondaryKeywords: ["fresher resume format", "B.Tech resume tips", "ATS resume for freshers"],
    promoAngle: "Link the campus Resume Optimizer in the student dashboard.",
    audience: "students",
    category: "Career & Placements",
    baseScore: 87,
    peakMonths: [1, 2, 8, 9, 10],
  },
  {
    title: "Why Campus Cultural Fests Matter More Than Students Think",
    angle: "The specific, employable skills built by running an event — budgeting, sponsorship, logistics, crisis handling — told through what actually happens on campus.",
    rationale: "Turns cultural activity coverage into something useful rather than a photo dump, and it is the natural home for real campus photographs.",
    searchIntent: "Perspective / student life research",
    primaryKeyword: "importance of college cultural fest",
    secondaryKeywords: ["college fest skills", "extracurricular activities benefits", "campus life engineering college"],
    promoAngle: "Carries real BVCITS fest photography and links the campus experience page.",
    audience: "both",
    category: "Campus Life",
    baseScore: 78,
    peakMonths: [1, 2, 9, 10, 11],
  },
  {
    title: "Semester Exam Preparation: A 21-Day Plan That Does Not Require All-Nighters",
    angle: "A day-by-day structure across three weeks, built around past papers and unit weightage rather than reading the textbook front to back.",
    rationale: "Seasonal spike twice a year, highly shareable within student WhatsApp groups, and it needs no institutional claims at all.",
    searchIntent: "How-to / planning",
    primaryKeyword: "semester exam preparation plan",
    secondaryKeywords: ["JNTUK exam preparation", "how to study in 21 days", "engineering exam timetable plan"],
    promoAngle: "None. This one exists purely to be useful and to be found.",
    audience: "students",
    category: "Study Skills",
    baseScore: 86,
    peakMonths: [3, 4, 10, 11, 12],
  },
  {
    title: "Internships for B.Tech Students: Where to Find Them and When to Apply",
    angle: "The real Indian internship calendar, which platforms are worth the time, and how a second-year student should approach it differently from a third-year.",
    rationale: "High-intent, seasonal, and genuinely under-answered for students outside metro colleges.",
    searchIntent: "How-to / opportunity discovery",
    primaryKeyword: "internships for B.Tech students",
    secondaryKeywords: ["summer internship engineering", "how to get internship second year", "internship platforms India"],
    promoAngle: "Links the opportunities board in the student dashboard.",
    audience: "students",
    category: "Career & Placements",
    baseScore: 83,
    peakMonths: [2, 3, 4, 11, 12],
  },
  {
    title: "What NAAC 'A' Grade and NBA Accreditation Actually Mean for a Student",
    angle: "Plain-language explanation of what each accreditation body checks, what it does not check, and how a family should weigh it.",
    rationale: "Parents see these badges everywhere and understand none of them. Explaining it honestly — including the limits — is a trust play.",
    searchIntent: "Informational / definition",
    primaryKeyword: "what is NAAC A grade",
    secondaryKeywords: ["NBA accreditation meaning", "autonomous college meaning", "AICTE approved meaning"],
    promoAngle: "BVCITS holds all three, so the explanation doubles as verified evidence — stated as fact, never as a boast.",
    audience: "parents",
    category: "Admissions Guide",
    baseScore: 81,
    peakMonths: [5, 6, 7],
  },
  {
    title: "Managing Exam Stress and Homesickness in Your First Year Away",
    angle: "Practical, non-preachy coping structure — sleep, routine, one trusted contact — plus when to actually seek help and who to approach on campus.",
    rationale: "A duty-of-care topic that also ranks. Students search this at 2am and find nothing written for them locally.",
    searchIntent: "Support / how-to",
    primaryKeyword: "exam stress college students",
    secondaryKeywords: ["homesickness hostel first year", "student mental health India", "how to handle academic pressure"],
    promoAngle: "Names the real campus support route. Nothing more.",
    audience: "students",
    category: "Student Wellbeing",
    baseScore: 76,
    peakMonths: [3, 8, 9, 11],
  },
  {
    title: "Life in Amalapuram as an Engineering Student: A Practical Guide",
    angle: "Transport, cost of living, what is available locally and what is a trip to Rajahmundry — written for a student arriving from outside the district.",
    rationale: "Local-intent content nobody else is writing. Strong for the Konaseema geographic queries we want to own.",
    searchIntent: "Local / practical research",
    primaryKeyword: "student life in Amalapuram",
    secondaryKeywords: ["Amalapuram engineering college hostel", "Konaseema student guide", "living in Amalapuram cost"],
    promoAngle: "Naturally geographic — mentions the campus location and transport routes, both verifiable facts.",
    audience: "both",
    category: "Konaseema & Community",
    baseScore: 74,
    peakMonths: [6, 7, 8],
  },
];

/** What a student or parent in Konaseema is searching for, by IST month. */
const SEASONAL_CONTEXT: Record<number, string> = {
  1: "Semester exams and the start of the main campus placement season.",
  2: "Placement drives in full swing; summer internship applications open.",
  3: "End-semester exams; AP EAPCET preparation intensifies.",
  4: "EAPCET exam period; results anxiety; summer internship starts.",
  5: "EAPCET results and rank analysis; branch and college shortlisting begins.",
  6: "Counselling season — the peak month for admissions research by parents.",
  7: "Counselling and seat allotment; first-year joining and hostel preparation.",
  8: "First-year students settling in; clubs and orientation; mid-term rhythm begins.",
  9: "Mid-semester exams; hackathon and technical event season.",
  10: "Cultural fest season; placement drives resume for the graduating batch.",
  11: "Placement season peak; end-semester exam preparation begins.",
  12: "Semester exams; winter internships; next-year goal setting.",
};

export interface TopicBatch {
  batch: string;
  topics: BlogTopic[];
  /** How many came from the live model vs the seed bank — surfaced in the UI. */
  fromModel: number;
  fromSeeds: number;
  notes: string[];
}

/**
 * Scores a seed for today: base value, plus a seasonal boost when the month
 * matches peak demand, minus a penalty for anything close to already-published
 * work.
 */
function scoreSeed(seed: SeedTopic, month: number, publishedTitles: string[]): number {
  const seasonal = seed.peakMonths.includes(month) ? 8 : 0;
  const duplicate = publishedTitles.some((t) => titleOverlap(t, seed.title) > 0.5) ? -60 : 0;
  return Math.max(0, Math.min(100, seed.baseScore + seasonal + duplicate));
}

/** Jaccard overlap on significant words — cheap, and good enough to catch a rewrite. */
export function titleOverlap(a: string, b: string): number {
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3)
    );
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size);
}

function seedToTopic(seed: SeedTopic, score: number, batch: string): BlogTopic {
  return {
    id: newId("topic"),
    title: seed.title,
    angle: seed.angle,
    rationale: seed.rationale,
    searchIntent: seed.searchIntent,
    primaryKeyword: seed.primaryKeyword,
    secondaryKeywords: seed.secondaryKeywords,
    promoAngle: seed.promoAngle,
    audience: seed.audience,
    category: seed.category,
    score,
    status: "proposed",
    source: "agent",
    proposedOn: batch,
    createdAt: nowIso(),
  };
}

/** Coerce one model-proposed idea into a BlogTopic, or reject it. */
function modelToTopic(raw: unknown, batch: string): BlogTopic | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = r[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const pickList = (...keys: string[]): string[] => {
    for (const k of keys) {
      const v = r[k];
      if (Array.isArray(v)) return v.map(String).filter(Boolean);
      if (typeof v === "string" && v.trim()) return [v.trim()];
    }
    return [];
  };

  const title = pick("title", "headline", "topic");
  // A topic with no title is not repairable into anything useful, and a
  // three-word title is a category name rather than an article.
  if (title.length < 15) return null;

  const rawCategory = pick("category");
  const category = (BLOG_CATEGORIES as readonly string[]).includes(rawCategory)
    ? (rawCategory as BlogCategory)
    : "Study Skills";
  const rawAudience = pick("audience").toLowerCase();
  const audience: BlogAudience = (["students", "parents", "both", "recruiters", "faculty"] as const).includes(
    rawAudience as BlogAudience
  )
    ? (rawAudience as BlogAudience)
    : "students";

  const scoreRaw = Number(r.score ?? r.opportunityScore ?? 70);
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 70;

  return {
    id: newId("topic"),
    title,
    angle: pick("angle", "approach", "hook") || "—",
    rationale: pick("rationale", "why", "reason") || "—",
    searchIntent: pick("searchIntent", "search_intent", "intent") || "Informational",
    primaryKeyword: pick("primaryKeyword", "primary_keyword", "keyword") || slugify(title).replace(/-/g, " "),
    secondaryKeywords: pickList("secondaryKeywords", "secondary_keywords", "keywords").slice(0, 6),
    promoAngle: pick("promoAngle", "promo_angle", "institutionalAngle") || "—",
    audience,
    category,
    score,
    status: "proposed",
    source: "agent",
    proposedOn: batch,
    createdAt: nowIso(),
  };
}

const SCOUT_INSTRUCTION = [
  "Propose blog topics for the official blog of BVCITS, an autonomous engineering college in Amalapuram, Konaseema district, Andhra Pradesh.",
  "",
  "The blog exists to be genuinely useful to students and their parents. Search visibility is the consequence of that usefulness, never the substitute for it.",
  "",
  "HARD RULES:",
  "1. Never propose a topic that ranks named competitor colleges, or that asserts BVCITS is the best/#1. Those rankings do not exist. Propose the honest form of the query instead (a decision checklist, a comparison of criteria).",
  "2. Never propose a topic that requires inventing statistics, studies or survey results.",
  "3. Every topic must be useful to the reader even if they never apply to BVCITS.",
  "4. Prefer specific, answerable titles over broad ones: 'How to build an engineering resume with no work experience' over 'Career tips for students'.",
  "5. Avoid topics too close to anything in context.alreadyPublished.",
  "",
  "Return JSON: {\"topics\":[{title, angle, rationale, searchIntent, primaryKeyword, secondaryKeywords[], promoAngle, audience, category, score}]}",
  "audience ∈ students|parents|both|recruiters|faculty. category ∈ the values in context.categories. score is 0-100 opportunity.",
].join("\n");

/**
 * Build one batch of topic ideas.
 *
 * The seed bank always contributes; the model tops the batch up with fresh
 * angles when it is routed live. If the model returns nothing usable the batch
 * is still complete, which is what makes the daily cron safe to run unattended.
 */
export async function proposeTopics(opts: {
  batch?: string;
  publishedTitles?: string[];
  existingBatchTitles?: string[];
  count?: number;
  recentCampaigns?: string[];
}): Promise<TopicBatch> {
  const batch = opts.batch ?? istDate();
  const count = opts.count ?? TOPICS_PER_BATCH;
  const published = opts.publishedTitles ?? [];
  const month = Number(batch.slice(5, 7));
  const notes: string[] = [];

  const taken = [...published, ...(opts.existingBatchTitles ?? [])];
  const isNovel = (title: string): boolean => !taken.some((t) => titleOverlap(t, title) > 0.5);

  // 1. Model pass — fresh angles, seasonal and campaign-aware.
  const llm = getLlm("strategy");
  const modelTopics: BlogTopic[] = [];
  try {
    const res = await llm.complete({
      kind: "strategy",
      instruction: SCOUT_INSTRUCTION,
      context: {
        count,
        month,
        season: SEASONAL_CONTEXT[month] ?? "",
        categories: BLOG_CATEGORIES,
        grounded: groundedRecord(),
        alreadyPublished: published.slice(0, 40),
        recentCampusActivity: (opts.recentCampaigns ?? []).slice(0, 10),
        archetypesThatWorkHere: SEED_BANK.slice(0, 6).map((s) => s.title),
      },
      jsonSchemaHint: true,
      temperature: 0.85,
    });
    const parsed = parseLlmJson(res.text);
    const list = parsed
      ? (parsed.topics ?? parsed.ideas ?? parsed.blogTopics ?? (Array.isArray(parsed) ? parsed : null))
      : null;
    if (Array.isArray(list)) {
      for (const raw of list) {
        const t = modelToTopic(raw, batch);
        if (t && isNovel(t.title) && !modelTopics.some((m) => titleOverlap(m.title, t.title) > 0.5)) {
          modelTopics.push(t);
        }
      }
    }
    if (!modelTopics.length) {
      notes.push("The model returned no usable topics — the batch is entirely from the curated seed bank.");
    }
  } catch (e) {
    notes.push(`Topic model call failed (${(e as Error).message}); the batch is entirely from the curated seed bank.`);
  }

  // 2. Seed pass — fills the batch and guarantees the floor.
  const seeds = SEED_BANK.map((s) => ({ seed: s, score: scoreSeed(s, month, published) }))
    .filter(({ seed, score }) => score > 0 && isNovel(seed.title))
    .sort((a, b) => b.score - a.score);

  const topics: BlogTopic[] = [];
  const accept = (t: BlogTopic) => {
    if (topics.length >= count) return;
    if (topics.some((x) => titleOverlap(x.title, t.title) > 0.5)) return;
    topics.push(t);
  };

  // Interleave so the batch is not "6 model ideas then 4 seeds" — the admin
  // should see the strongest ideas first regardless of where they came from.
  const merged = [...modelTopics, ...seeds.map(({ seed, score }) => seedToTopic(seed, score, batch))].sort(
    (a, b) => b.score - a.score
  );
  for (const t of merged) accept(t);

  const fromModel = topics.filter((t) => modelTopics.some((m) => m.id === t.id)).length;
  return { batch, topics, fromModel, fromSeeds: topics.length - fromModel, notes };
}

/** An admin-supplied title, promoted straight to an approved topic. */
export function adminTopic(title: string, opts: { by: string; category?: BlogCategory; audience?: BlogAudience }): BlogTopic {
  return {
    id: newId("topic"),
    title: title.trim(),
    angle: "Admin-specified title.",
    rationale: `Requested directly by ${opts.by}.`,
    searchIntent: "Admin-directed",
    primaryKeyword: slugify(title).replace(/-/g, " "),
    secondaryKeywords: [],
    promoAngle: "—",
    audience: opts.audience ?? "students",
    category: opts.category ?? "Campus Life",
    score: 100,
    status: "approved",
    source: "admin",
    proposedOn: istDate(),
    decidedBy: opts.by,
    decidedAt: nowIso(),
    createdAt: nowIso(),
  };
}
