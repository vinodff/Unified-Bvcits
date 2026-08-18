#!/usr/bin/env node
// Opportunity discovery run.
//
//   npm run discover:opportunities            # search, verify, write to Supabase
//   npm run discover:opportunities -- --dry   # search and verify, write JSON only
//
// The pipeline, one stage per section below:
//
//   Exa (semantic search)  →  find candidate pages
//   Firecrawl              →  re-scrape pages Exa could not read (JS-heavy)
//   Gemini                 →  extract structured fields from page text
//   verify.ts              →  gate on domain trust, scam signals, deadline, reachability
//   dedup                  →  collapse repostings, count corroborations
//   Supabase               →  upsert
//
// Two deliberate constraints on the model's role, both anti-hallucination:
//
//   1. It NEVER produces a URL. The apply link is always the page we actually
//      fetched, so a fabricated link cannot reach a student.
//   2. It may only report a deadline that appears verbatim in the page text,
//      and verify.ts independently rejects the result if it is in the past or
//      implausibly distant.
//
// The model extracts. It does not decide what is trustworthy — verify.ts does,
// with static rules that can be read and argued with.

import { readFileSync, writeFileSync } from "node:fs";
import { verifyCandidate, urlFingerprint, contentFingerprint } from "../src/lib/opportunities/verify";
import { OPPORTUNITY_KINDS } from "../src/lib/opportunities/types";
import type { OpportunityCandidate, OpportunityKind } from "../src/lib/opportunities/types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadEnv(path = ".env.local"): void {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
    }
  } catch {
    // .env.local is optional when the variables are already exported.
  }
}

loadEnv();

const DRY_RUN = process.argv.includes("--dry");
const SNAPSHOT_PATH = "scripts/opportunities-latest.json";

const EXA_KEY = process.env.EXA_API_KEY;
const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

/**
 * What to look for.
 *
 * Queries are phrased the way a student would describe the thing, because Exa
 * matches on meaning rather than keywords — "internship application page for
 * Indian engineering students" finds application pages, where the keyword query
 * "internship" finds articles about internships.
 */
interface SearchPlan {
  kind: OpportunityKind;
  query: string;
  /** Restricts the search to pages published recently, in days. */
  freshnessDays?: number;
  /**
   * Restrict the search to these domains.
   *
   * This is the single biggest quality lever in the whole pipeline, and it was
   * added after the first live run: an unrestricted query for "fresher software
   * engineer job India" returns almost entirely SEO reposting sites
   * (freshershunt.in, jobsnet.in, indiascholarships.in). Those are not
   * necessarily scams, but they are second-hand and often stale, so the
   * verifier correctly parked all of them at `pending` — and the run published
   * one row out of forty pages.
   *
   * Searching INSIDE the trusted registry inverts that: rather than filtering
   * blogspam out after the fact, look where the primary sources actually live.
   * The open-web plans below are kept as a discovery channel, but what they
   * find lands at `pending` for a human, which is the honest place for it.
   */
  includeDomains?: readonly string[];
}

/** Applicant tracking systems and career portals — where real postings live. */
const PRIMARY_JOB_DOMAINS = [
  "boards.greenhouse.io",
  "jobs.lever.co",
  "job-boards.greenhouse.io",
  "jobs.ashbyhq.com",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "careers.google.com",
  "amazon.jobs",
  "jobs.microsoft.com",
  "metacareers.com",
  "careers.adobe.com",
  "jobs.nvidia.com",
  "careers.ibm.com",
  "nextstep.tcs.com",
] as const;

const PRIMARY_PROGRAMME_DOMAINS = [
  "devpost.com",
  "mlh.io",
  "devfolio.co",
  "unstop.com",
  "hackerearth.com",
  "summerofcode.withgoogle.com",
] as const;

const SEARCH_PLANS: readonly SearchPlan[] = [
  // --- primary sources: searched inside the trusted registry ---
  {
    kind: "internship",
    query: "software engineering internship for university students, open for applications",
    freshnessDays: 120,
    includeDomains: PRIMARY_JOB_DOMAINS,
  },
  {
    kind: "job",
    query: "new graduate entry level software engineer role, no prior experience required",
    freshnessDays: 120,
    includeDomains: PRIMARY_JOB_DOMAINS,
  },
  {
    kind: "hackathon",
    query: "hackathon open for student registration with prizes",
    freshnessDays: 180,
    includeDomains: PRIMARY_PROGRAMME_DOMAINS,
  },
  {
    kind: "competition",
    query: "student coding competition or challenge accepting entries",
    freshnessDays: 180,
    includeDomains: PRIMARY_PROGRAMME_DOMAINS,
  },

  // --- open web: a discovery channel, not a publishing one ---
  // Anything these surface on an unrecognised domain stays `pending` by design.
  {
    kind: "scholarship",
    query:
      "engineering scholarship application for undergraduate students in India, official application page",
    freshnessDays: 240,
  },
  {
    kind: "ambassador",
    query: "campus ambassador program application page for college students 2026",
    freshnessDays: 240,
  },
];

const RESULTS_PER_QUERY = 8;

// ---------------------------------------------------------------------------
// Stage 1 — Exa search
// ---------------------------------------------------------------------------

interface PageResult {
  url: string;
  title: string;
  text: string;
  publishedDate?: string | null;
}

async function exaSearch(plan: SearchPlan): Promise<PageResult[]> {
  if (!EXA_KEY) throw new Error("EXA_API_KEY is not set");

  const body: Record<string, unknown> = {
    query: plan.query,
    numResults: RESULTS_PER_QUERY,
    type: "auto",
    contents: { text: { maxCharacters: 4000 } },
  };

  if (plan.freshnessDays) {
    const from = new Date(Date.now() - plan.freshnessDays * 86_400_000);
    body.startPublishedDate = from.toISOString().slice(0, 10);
  }

  if (plan.includeDomains) {
    body.includeDomains = [...plan.includeDomains];
  }

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": EXA_KEY },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.warn(`  [exa] ${plan.kind}: HTTP ${response.status} ${(await response.text()).slice(0, 160)}`);
    return [];
  }

  const payload = (await response.json()) as {
    results?: { url?: string; title?: string; text?: string; publishedDate?: string }[];
  };

  return (payload.results ?? [])
    .filter((r): r is { url: string; title?: string; text?: string; publishedDate?: string } =>
      typeof r.url === "string"
    )
    .map((r) => ({
      url: r.url,
      title: r.title ?? "",
      text: r.text ?? "",
      publishedDate: r.publishedDate ?? null,
    }));
}

// ---------------------------------------------------------------------------
// Stage 2 — Firecrawl fallback
//
// Exa returns an empty or near-empty body for pages that render their content
// client-side, which is most modern ATS boards. Rather than discard those (they
// are exactly the high-trust official sources we most want), re-fetch them.
// ---------------------------------------------------------------------------

const THIN_TEXT_THRESHOLD = 500;

async function firecrawlScrape(url: string): Promise<string> {
  if (!FIRECRAWL_KEY) return "";

  try {
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${FIRECRAWL_KEY}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, timeout: 20000 }),
    });

    if (!response.ok) return "";

    const payload = (await response.json()) as { data?: { markdown?: string } };
    return (payload.data?.markdown ?? "").slice(0, 4000);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Stage 3 — Gemini extraction
// ---------------------------------------------------------------------------

const EXTRACTION_MODELS = ["gemini-3.1-flash-lite", "gemini-3-flash-preview"];

interface Extracted {
  isOpportunity: boolean;
  title?: string;
  organization?: string;
  kind?: string;
  location?: string;
  workMode?: string;
  eligibility?: string;
  skills?: string[];
  description?: string;
  deadline?: string;
  postedAt?: string;
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    isOpportunity: { type: "boolean" },
    title: { type: "string" },
    organization: { type: "string" },
    kind: { type: "string", enum: [...OPPORTUNITY_KINDS] },
    location: { type: "string" },
    workMode: { type: "string", enum: ["onsite", "remote", "hybrid"] },
    eligibility: { type: "string" },
    skills: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    deadline: { type: "string" },
    postedAt: { type: "string" },
  },
  required: ["isOpportunity"],
};

function extractionPrompt(page: PageResult, today: string): string {
  return [
    "You are extracting structured data from a web page for a student opportunity board.",
    "",
    "Set isOpportunity to false — and return nothing else — if the page is:",
    "  - a list, index, category or search-results page rather than ONE specific opportunity",
    "  - a news article, blog post or guide ABOUT opportunities",
    "  - an opportunity that has already closed",
    "",
    "If it IS one specific opportunity, fill the fields from the page text only.",
    "",
    "RULES:",
    `  - today's date is ${today}. Resolve relative dates ("closes in two weeks") against it.`,
    "  - deadline must be YYYY-MM-DD and must be stated on the page. If the page does not",
    "    state a deadline, OMIT the field. Never estimate or guess one.",
    "  - organization is the employer or organiser, not the website hosting the page.",
    "  - skills: at most 8 short lowercase technology or subject terms.",
    "  - description: one or two factual sentences. No marketing language.",
    "  - Do not output any URL.",
    "",
    `PAGE URL: ${page.url}`,
    `PAGE TITLE: ${page.title}`,
    "PAGE TEXT:",
    page.text.slice(0, 4000),
  ].join("\n");
}

async function extract(page: PageResult, today: string): Promise<Extracted | null> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY is not set");

  for (const model of EXTRACTION_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-goog-api-key": GEMINI_KEY },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: extractionPrompt(page, today) }] }],
            generationConfig: {
              // Extraction is a transcription task, not a creative one.
              temperature: 0,
              maxOutputTokens: 800,
              responseMimeType: "application/json",
              responseSchema: EXTRACTION_SCHEMA,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        }
      );

      if (response.status === 429) continue; // try the next model in the chain
      if (!response.ok) return null;

      const payload = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = (payload.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      if (!text.trim()) return null;

      return JSON.parse(text) as Extracted;
    } catch {
      // Fall through to the next model; a parse failure on one is not fatal.
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Stage 4 — reachability
// ---------------------------------------------------------------------------

/**
 * Probe the apply URL.
 *
 * Returns three outcomes rather than a boolean. 401/403/405/429 mean the server
 * is alive and chose not to serve a bot — common on corporate career sites, and
 * emphatically not the same thing as a dead link. Only a 404/410, a 5xx or a
 * transport failure is treated as dead. See the Reachability type in verify.ts.
 */
async function probe(url: string): Promise<"ok" | "blocked" | "dead"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    // GET rather than HEAD: plenty of career sites answer HEAD with 405 while
    // serving the page perfectly well.
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "BVCITS-OpportunityBot/1.0 (+https://bvcits.edu.in)" },
    });

    if (response.ok) return "ok";
    if ([401, 403, 405, 406, 429].includes(response.status)) return "blocked";
    return "dead";
  } catch {
    return "dead";
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

interface PreparedRow {
  title: string;
  organization: string;
  kind: OpportunityKind;
  apply_url: string;
  source_url: string | null;
  url_fingerprint: string;
  content_fingerprint: string;
  corroborations: number;
  location: string | null;
  work_mode: string | null;
  eligibility: string | null;
  skills: string[];
  description: string | null;
  deadline: string | null;
  posted_at: string | null;
  status: string;
  source_tier: string;
  signals: string[];
  verified_at: string | null;
}

function isValidKind(value: unknown): value is OpportunityKind {
  return typeof value === "string" && (OPPORTUNITY_KINDS as readonly string[]).includes(value);
}

/** YYYY-MM-DD or null — never passes a malformed string to a `date` column. */
function asDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

async function main(): Promise<void> {
  const missing = [
    !EXA_KEY && "EXA_API_KEY",
    !GEMINI_KEY && "GEMINI_API_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    console.error("Add them to .env.local — see .env.example.");
    process.exit(1);
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const byUrl = new Map<string, PreparedRow>();
  const byContent = new Map<string, string>();
  const stats = { pages: 0, extracted: 0, verified: 0, pending: 0, rejected: 0, duplicates: 0 };
  const rejections: { title: string; url: string; reason: string }[] = [];

  for (const plan of SEARCH_PLANS) {
    console.log(`\n[search] ${plan.kind}: ${plan.query.slice(0, 70)}…`);
    const pages = await exaSearch(plan);
    console.log(`  ${pages.length} pages`);

    for (const page of pages) {
      stats.pages += 1;

      let text = page.text;
      if (text.length < THIN_TEXT_THRESHOLD) {
        text = (await firecrawlScrape(page.url)) || text;
      }
      if (text.length < 200) continue;

      const parsed = await extract({ ...page, text }, today);
      if (!parsed || !parsed.isOpportunity || !parsed.title || !parsed.organization) continue;
      stats.extracted += 1;

      const candidate: OpportunityCandidate = {
        title: parsed.title.trim().slice(0, 240),
        organization: parsed.organization.trim().slice(0, 160),
        kind: isValidKind(parsed.kind) ? parsed.kind : plan.kind,
        // Always the page we actually fetched — the model never supplies a URL.
        applyUrl: page.url,
        sourceUrl: page.url,
        location: parsed.location ?? null,
        workMode:
          parsed.workMode === "onsite" || parsed.workMode === "remote" || parsed.workMode === "hybrid"
            ? parsed.workMode
            : null,
        eligibility: parsed.eligibility ?? null,
        skills: (parsed.skills ?? []).slice(0, 8).map((s) => s.toLowerCase().trim()).filter(Boolean),
        description: parsed.description ?? null,
        deadline: asDate(parsed.deadline),
        postedAt: asDate(parsed.postedAt) ?? asDate(page.publishedDate),
      };

      const fingerprint = urlFingerprint(candidate.applyUrl);
      if (!fingerprint) continue;

      const contentKey = contentFingerprint(candidate.title, candidate.organization);

      // Same posting seen again on another source: count the corroboration
      // instead of storing it twice.
      const existingId = byContent.get(contentKey);
      if (existingId && existingId !== fingerprint) {
        const existing = byUrl.get(existingId);
        if (existing) {
          existing.corroborations += 1;
          stats.duplicates += 1;
          continue;
        }
      }
      if (byUrl.has(fingerprint)) {
        stats.duplicates += 1;
        continue;
      }

      const reachability = await probe(candidate.applyUrl);
      const verdict = verifyCandidate(candidate, { now, reachability, corroborations: 1 });

      if (verdict.status === "verified") stats.verified += 1;
      else if (verdict.status === "pending") stats.pending += 1;
      else {
        stats.rejected += 1;
        rejections.push({
          title: candidate.title,
          url: candidate.applyUrl,
          reason: verdict.signals[0] ?? "unknown",
        });
      }

      const row: PreparedRow = {
        title: candidate.title,
        organization: candidate.organization,
        kind: candidate.kind,
        apply_url: candidate.applyUrl,
        source_url: candidate.sourceUrl ?? null,
        url_fingerprint: fingerprint,
        content_fingerprint: contentKey,
        corroborations: 1,
        location: candidate.location ?? null,
        work_mode: candidate.workMode ?? null,
        eligibility: candidate.eligibility ?? null,
        skills: [...(candidate.skills ?? [])],
        description: candidate.description ?? null,
        deadline: candidate.deadline ?? null,
        posted_at: candidate.postedAt ?? null,
        status: verdict.status,
        source_tier: verdict.sourceTier,
        signals: verdict.signals,
        verified_at: verdict.status === "verified" ? now.toISOString() : null,
      };

      byUrl.set(fingerprint, row);
      byContent.set(contentKey, fingerprint);

      const mark = verdict.status === "verified" ? "✓" : verdict.status === "pending" ? "?" : "✗";
      console.log(`  ${mark} [${verdict.sourceTier}] ${candidate.title.slice(0, 62)}`);
    }
  }

  const rows = [...byUrl.values()];

  console.log(
    `\n[summary] ${stats.pages} pages → ${stats.extracted} extracted → ` +
      `${stats.verified} verified · ${stats.pending} pending · ${stats.rejected} rejected · ` +
      `${stats.duplicates} duplicates collapsed`
  );

  if (rejections.length > 0) {
    console.log("\n[rejected]");
    for (const r of rejections) console.log(`  - ${r.title.slice(0, 50)} — ${r.reason}`);
  }

  writeFileSync(
    SNAPSHOT_PATH,
    JSON.stringify({ runAt: now.toISOString(), stats, rows }, null, 2),
    "utf8"
  );
  console.log(`\n[snapshot] ${rows.length} rows written to ${SNAPSHOT_PATH}`);

  if (DRY_RUN) {
    console.log("[dry] --dry passed; not writing to Supabase.");
    return;
  }

  await upsert(rows);
}

/**
 * Write to Supabase with the service key.
 *
 * Uses the service role because discovery is trusted server-side code and the
 * `opportunities` table deliberately has no insert policy for `authenticated` —
 * see 0006. The database still refuses to publish an untrusted source: the
 * `opportunities_verified_needs_trusted_source` CHECK applies to this path too.
 */
async function upsert(rows: PreparedRow[]): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    console.error("[supabase] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY missing; skipped.");
    return;
  }
  if (rows.length === 0) return;

  const response = await fetch(`${url}/rest/v1/opportunities?on_conflict=url_fingerprint`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (response.status === 404) {
    console.error(
      "[supabase] table `opportunities` does not exist.\n" +
        "           Run supabase/migrations/0006_opportunities.sql in the SQL editor,\n" +
        `           then: npx tsx scripts/load-opportunities.ts ${SNAPSHOT_PATH}`
    );
    return;
  }

  if (!response.ok) {
    console.error(`[supabase] upsert failed: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
    return;
  }

  console.log(`[supabase] upserted ${rows.length} rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
