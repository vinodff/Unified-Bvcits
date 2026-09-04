import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { OPPORTUNITY_KINDS, type OpportunityCandidate, type OpportunityKind } from "./types";
import { classifyHost } from "./sources";
import { canonicalizeUrl, contentFingerprint, urlFingerprint, verifyCandidate } from "./verify";
import { jobPostingNodes } from "./liveness";
import type { RunSource } from "./runs";

/**
 * Opportunity discovery — the half of the agent that finds NEW listings.
 *
 * Search → fetch → extract → verify → dedupe → upsert, the same spine as
 * scripts/discover-opportunities.ts, with one substitution: search runs on
 * Gemini's googleSearch grounding rather than Exa, so the agent needs no API
 * key beyond the GEMINI_API_KEY this project already has.
 *
 * The critical property that made the Exa version work is preserved. Its own
 * comment records that an unrestricted web search returned almost entirely SEO
 * reposting sites — one publishable row out of forty pages — and that scoping
 * the search to a registry of ATS and career hosts inverted that. Exa did it
 * with `includeDomains`; here the same constraint is expressed as Google
 * `site:` operators inside the query, so the narrowing still happens at the
 * search engine rather than as a filter afterwards.
 *
 * Sources are taken from `groundingMetadata.groundingChunks[].web.uri` —
 * server-verified citations of pages the search actually returned, not a list
 * the model was asked to self-report. That distinction is why the console can
 * honestly show where each opportunity came from.
 */

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
/** Cheapest usable model first; the flash-preview tier is 20 requests/day. */
const MODEL_CHAIN = ["gemini-3.1-flash-lite", "gemini-3-flash-preview"] as const;

const SEARCH_TIMEOUT_MS = 25_000;
const EXTRACT_TIMEOUT_MS = 20_000;
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Wall-clock budget for the whole discovery half.
 *
 * The route runs under Vercel's `maxDuration = 300`, and the liveness sweep
 * still has to happen afterwards. Rather than hope the work fits, each stage
 * checks the clock and stops taking on more — a run that returns 30
 * opportunities and admits it ran out of time is far better than one that is
 * killed mid-flight and records nothing at all.
 */
const DISCOVERY_BUDGET_MS = 170_000;
const USER_AGENT = "BVCITS-OpportunityBot/1.0 (+https://bvcits.edu.in)";

/**
 * Domains are grouped rather than listed flat.
 *
 * Google stops honouring a `site:` OR-chain after a handful of terms, so a
 * single query carrying thirteen hosts silently searches only the first few —
 * which is why the earlier version never once returned a result from Workday,
 * TCS or the Indian boards. Each group is searched as its own query instead, so
 * every host actually gets looked at.
 */
const ATS_GROUP = ["boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com"] as const;
const ENTERPRISE_ATS_GROUP = ["myworkdayjobs.com", "smartrecruiters.com", "eightfold.ai", "darwinbox.in"] as const;
const BIGTECH_GROUP = ["amazon.jobs", "careers.google.com", "jobs.microsoft.com", "careers.adobe.com"] as const;
const BIGTECH_GROUP_2 = ["jobs.nvidia.com", "careers.ibm.com", "metacareers.com", "careers.salesforce.com"] as const;

/** Indian employers and boards — the audience this feed actually serves. */
const INDIA_GROUP = ["nextstep.tcs.com", "careers.infosys.com", "careers.wipro.com", "jobs.zs.com"] as const;
const INDIA_BOARD_GROUP = ["internshala.com", "unstop.com", "instahyre.com", "cutshort.io"] as const;

/** Hackathon and programme organisers. */
const HACKATHON_GROUP = ["devpost.com", "mlh.io", "devfolio.co"] as const;
const HACKATHON_GROUP_2 = ["unstop.com", "hackerearth.com", "hack2skill.com", "dorahacks.io"] as const;

/** Standing contest platforms — monthly rounds students can enter cold. */
const CONTEST_GROUP = ["codechef.com", "hackerrank.com", "kaggle.com", "codeforces.com"] as const;

/** Scholarship and fellowship portals, mostly official Indian ones. */
const SCHOLARSHIP_GROUP = ["scholarships.gov.in", "buddy4study.com", "vidyasaarathi.co.in"] as const;
const GOV_SCHOLARSHIP_GROUP = ["scholarships.gov.in", "aicte-india.org", "ugc.gov.in"] as const;

/** Open-source and research programmes that take students directly. */
const OSS_PROGRAMME_GROUP = ["summerofcode.withgoogle.com", "outreachy.org", "developers.google.com"] as const;

interface SearchPlan {
  kind: OpportunityKind;
  /** Described the way a student would say it — the search engine matches meaning. */
  intent: string;
  domains?: readonly string[];
}

/**
 * What the agent goes looking for each run.
 *
 * The first four are scoped to the trusted registry and are where publishable
 * rows come from. The last two run on the open web deliberately: they are a
 * discovery channel for sources not yet in the allowlist, and anything they
 * surface on an unrecognised domain stays `pending` for a human rather than
 * reaching students.
 */
/**
 * India is written into the intent of every plan, not bolted on afterwards.
 *
 * The audience is undergraduates in Amalapuram, and an unqualified query
 * returns Santa Clara and Menlo Park because that is where the highest-ranked
 * postings are. The region gate in region.ts rejects those anyway, so leaving
 * "India" out of the query merely spends the whole budget fetching pages that
 * are then thrown away — the search has to want the right thing to begin with.
 *
 * Kinds are covered evenly. The earlier set was eleven job/internship plans
 * against three hackathon and two scholarship ones, so the board filled with
 * jobs and little else.
 */
const SEARCH_PLANS: readonly SearchPlan[] = [
  // --- internships (India) -----------------------------------------------
  { kind: "internship", intent: "software engineering internship in India for university students, applications open", domains: ATS_GROUP },
  { kind: "internship", intent: "internship in Bengaluru or Hyderabad for engineering students", domains: ATS_GROUP },
  { kind: "internship", intent: "internship in India for students, apply online", domains: ENTERPRISE_ATS_GROUP },
  { kind: "internship", intent: "India internship programme for engineering students", domains: BIGTECH_GROUP },
  { kind: "internship", intent: "India internship for computer science students", domains: BIGTECH_GROUP_2 },
  { kind: "internship", intent: "internship for engineering students in India, apply online", domains: INDIA_BOARD_GROUP },
  { kind: "internship", intent: "data science or machine learning internship in India for students", domains: ATS_GROUP },

  // --- graduate jobs (India) ---------------------------------------------
  { kind: "job", intent: "entry level software engineer role in India, no prior experience required", domains: ATS_GROUP },
  { kind: "job", intent: "graduate trainee or associate engineer role in India for fresh graduates", domains: ENTERPRISE_ATS_GROUP },
  { kind: "job", intent: "campus hiring or fresher software engineer role in India", domains: INDIA_GROUP },
  { kind: "job", intent: "fresher software developer job in India, 2026 batch, apply online", domains: INDIA_BOARD_GROUP },
  { kind: "job", intent: "university graduate software engineer position in Bengaluru India", domains: BIGTECH_GROUP },

  // --- hackathons --------------------------------------------------------
  { kind: "hackathon", intent: "hackathon in India open for college student registration", domains: HACKATHON_GROUP },
  { kind: "hackathon", intent: "hackathon for Indian college students, registration open", domains: HACKATHON_GROUP_2 },
  { kind: "hackathon", intent: "online hackathon open worldwide to students, registration open now", domains: HACKATHON_GROUP },
  { kind: "hackathon", intent: "student hackathon with prizes accepting registrations", domains: HACKATHON_GROUP_2 },
  { kind: "hackathon", intent: "AI or machine learning hackathon for students, apply now", domains: HACKATHON_GROUP },

  // --- competitions ------------------------------------------------------
  { kind: "competition", intent: "coding competition for engineering students in India, entries open", domains: HACKATHON_GROUP_2 },
  { kind: "competition", intent: "national level technical competition for Indian engineering students", domains: HACKATHON_GROUP },
  { kind: "competition", intent: "online programming contest open to students", domains: CONTEST_GROUP },
  { kind: "competition", intent: "innovation or case study challenge for Indian college students", domains: HACKATHON_GROUP_2 },

  // --- scholarships ------------------------------------------------------
  { kind: "scholarship", intent: "engineering scholarship for Indian undergraduate students, application open", domains: SCHOLARSHIP_GROUP },
  { kind: "scholarship", intent: "merit scholarship for engineering students in India, apply online", domains: SCHOLARSHIP_GROUP },
  { kind: "scholarship", intent: "government scholarship for engineering students in India, official portal", domains: GOV_SCHOLARSHIP_GROUP },
  { kind: "scholarship", intent: "scholarship for girl students in engineering in India, applications open" },

  // --- fellowships and programmes ----------------------------------------
  { kind: "fellowship", intent: "student fellowship or research programme in India accepting applications" },
  { kind: "fellowship", intent: "open source programme or research internship for Indian students", domains: OSS_PROGRAMME_GROUP },

  // --- open web: a discovery channel, not a publishing one ----------------
  // Anything these surface on an unrecognised domain stays `pending` by design.
  { kind: "ambassador", intent: "campus ambassador programme for Indian college students, application open" },
  { kind: "workshop", intent: "free online workshop or bootcamp for engineering students in India" },
];

// ---------------------------------------------------------------------------
// Stage 1 — search
// ---------------------------------------------------------------------------

interface FoundPage {
  url: string;
  title: string;
  kind: OpportunityKind;
  /** Which plan surfaced it, for the sources panel. */
  plan: string;
}

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

function buildQuery(plan: SearchPlan): string {
  if (!plan.domains?.length) return `${plan.intent} 2026`;
  // Google caps how much a single query can carry, and an OR chain of 13 site:
  // filters starts being ignored. Six is comfortably under that and still
  // covers the highest-yield hosts for the plan.
  const sites = plan.domains.slice(0, 6).map((d) => `site:${d}`).join(" OR ");
  return `(${sites}) ${plan.intent}`;
}

/** One grounded search. Returns the pages the search engine actually cited. */
async function searchPlan(plan: SearchPlan, apiKey: string): Promise<FoundPage[]> {
  const query = buildQuery(plan);
  const prompt = [
    `Search the web for: ${query}`,
    "",
    "List the specific opportunity pages you find. For each, give the exact page",
    "URL and its title. Only list pages for ONE specific opportunity — not",
    "category pages, search results, or articles about opportunities.",
    "Prefer listings that are currently open.",
  ].join("\n");

  for (const model of MODEL_CHAIN) {
    try {
      const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          // The search tool is what makes this real. Note it is NOT combined
          // with responseMimeType: "application/json" — the placement search
          // module records that pairing googleSearch with strict JSON mode
          // silently returns empty responses on this endpoint.
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      });

      if (response.status === 429) continue; // next model in the chain
      if (!response.ok) {
        console.warn(`[opportunity-discover] ${model} search ${response.status}`);
        continue;
      }

      const payload = (await response.json()) as {
        candidates?: { groundingMetadata?: { groundingChunks?: GroundingChunk[] } }[];
      };
      const chunks = payload.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

      return chunks
        .map((chunk) => chunk.web)
        .filter((web): web is { uri: string; title?: string } => Boolean(web?.uri))
        .map((web) => ({
          url: web.uri,
          title: web.title ?? "",
          kind: plan.kind,
          plan: plan.kind,
        }));
    } catch (error) {
      console.warn(
        `[opportunity-discover] ${model} search failed:`,
        error instanceof Error ? error.message : error
      );
    }
  }
  return [];
}

const REDIRECT_HOST = /vertexaisearch\.cloud\.google\.com|grounding-api-redirect/;

/**
 * Grounding citations arrive as Vertex redirect URLs, which are useless as an
 * apply link and unusable for domain classification. Follow one hop to recover
 * the publisher's real URL.
 *
 * Returns null when the hop fails, and the caller drops the page. Returning the
 * redirect unchanged — as this did — was quietly wrong twice over: the stored
 * apply link was a short-lived Vertex URL that would 404 for the student, and
 * `vertexaisearch.cloud.google.com` ends in `.google.com`, so the trust registry
 * classified whatever lay behind it as an OFFICIAL Google posting. A live run
 * published two rows that way. An unresolvable citation has no identifiable
 * publisher, and unidentified is precisely what this pipeline must not publish.
 */
async function resolveRedirect(url: string): Promise<string | null> {
  if (!REDIRECT_HOST.test(url)) return url;
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const resolved = response.url;
    return resolved && !REDIRECT_HOST.test(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stage 2 — fetch the page
// ---------------------------------------------------------------------------

/** Strip markup so the extractor reads copy rather than tags. */
function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface FetchedPage extends FoundPage {
  text: string;
  /** JSON-LD JobPosting, when the page publishes one. */
  jobPosting: Record<string, unknown> | null;
}

/** Below this there is nothing worth asking a model to read. */
const MIN_TEXT = 200;

async function fetchPage(page: FoundPage): Promise<FetchedPage | null> {
  try {
    const response = await fetch(page.url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const html = (await response.text()).slice(0, 300_000);
    const jobPosting = jobPostingNodes(html)[0] ?? null;
    const text = pageText(html);

    // A client-rendered board has almost no visible text, but usually still
    // ships JSON-LD for Google. Keeping the page when EITHER is present is what
    // recovers Greenhouse, Lever and Ashby listings that were previously
    // dropped as "too thin" — which was most of what the search actually found.
    if (text.length < MIN_TEXT && !jobPosting) return null;

    return { ...page, text: text.slice(0, 4000), jobPosting };
  } catch {
    return null;
  }
}

/** Read a plain string out of a JSON-LD value that may be nested or an array. */
function ldString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) return ldString(value[0]);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return ldString(record.name ?? record.value ?? record["@value"]);
  }
  return null;
}

/** Strip the HTML that JobPosting.description is allowed to contain. */
function ldDescription(value: unknown): string | null {
  const raw = ldString(value);
  if (!raw) return null;
  const clean = pageText(raw);
  return clean ? clean.slice(0, 400) : null;
}

/**
 * Country names for the ISO codes schema.org postings actually use.
 *
 * `addressCountry` is specified as an ISO 3166-1 code and most publishers
 * comply, so a real posting reaches us as "Bengaluru, Karnataka, IN". The
 * region gate reads free text and cannot match a bare code — and it must not
 * try, because a case-insensitive `\bIN\b` over a job description would match
 * the English preposition on virtually every page. Expanding it here is safe
 * precisely because this field is known to be a country.
 */
const COUNTRY_NAMES: Record<string, string> = {
  IN: "India",
  IND: "India",
  US: "United States",
  USA: "United States",
  GB: "United Kingdom",
  UK: "United Kingdom",
  CA: "Canada",
  DE: "Germany",
  FR: "France",
  NL: "Netherlands",
  IE: "Ireland",
  SG: "Singapore",
  AU: "Australia",
  JP: "Japan",
  IL: "Israel",
  PL: "Poland",
  CH: "Switzerland",
  SE: "Sweden",
  AE: "United Arab Emirates",
};

function expandCountry(value: string): string {
  return COUNTRY_NAMES[value.trim().toUpperCase()] ?? value;
}

function ldLocation(node: Record<string, unknown>): string | null {
  const loc = node.jobLocation;
  const first = Array.isArray(loc) ? loc[0] : loc;
  if (!first || typeof first !== "object") return ldString(loc);
  const address = (first as Record<string, unknown>).address;
  if (!address || typeof address !== "object") return ldString(first);
  const a = address as Record<string, unknown>;
  const country = ldString(a.addressCountry);
  const parts = [ldString(a.addressLocality), ldString(a.addressRegion), country ? expandCountry(country) : null]
    .filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(", ") : null;
}

/**
 * Build a candidate straight from JSON-LD, with no model involved.
 *
 * This is strictly better than asking a model to read stripped markup: the
 * publisher stated these fields, so nothing can be paraphrased, inferred or
 * invented. `validThrough` in particular becomes a deadline we can trust,
 * which is the one field a student actually acts on.
 */
export function fromJobPosting(
  node: Record<string, unknown>,
  page: FoundPage
): Extracted | null {
  const title = ldString(node.title) ?? ldString(node.name);
  const organization = ldString(node.hiringOrganization);
  if (!title || !organization) return null;

  const validThrough = ldString(node.validThrough);
  const datePosted = ldString(node.datePosted);
  const isoDay = (value: string | null): string | undefined => {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
  };

  const employment = ldString(node.employmentType)?.toUpperCase() ?? "";
  const looksLikeInternship = /INTERN/.test(employment) || /intern/i.test(title);

  return {
    isOpportunity: true,
    title,
    organization,
    kind: looksLikeInternship ? "internship" : page.kind === "internship" ? "internship" : "job",
    location: ldLocation(node) ?? undefined,
    description: ldDescription(node.description) ?? undefined,
    deadline: isoDay(validThrough),
    postedAt: isoDay(datePosted),
  };
}

// ---------------------------------------------------------------------------
// Stage 3 — extract structured fields
// ---------------------------------------------------------------------------

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

/**
 * Two constraints are load-bearing and must not be relaxed:
 *
 *   1. The model never supplies a URL. The apply link is always the page that
 *      was actually fetched, so a hallucinated address cannot reach a student.
 *   2. A deadline must appear verbatim on the page. An invented deadline on an
 *      opportunity board is worse than no deadline — it is the one field a
 *      student acts on.
 */
function extractionPrompt(page: FetchedPage, today: string): string {
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
    // The region gate reads this field. A posting that states a city but no
    // country reads as location-less downstream and is held back from students
    // rather than published, so the country is worth asking for explicitly.
    '  - location: city and country exactly as stated, e.g. "Bengaluru, India". If the page',
    '    gives only a city, still name the country. If it is remote or online, say so. Omit',
    "    the field only when the page genuinely states no location at all.",
    "  - skills: at most 8 short lowercase technology or subject terms.",
    "  - description: one or two factual sentences. No marketing language.",
    "  - Do not output any URL.",
    "",
    `PAGE URL: ${page.url}`,
    `PAGE TITLE: ${page.title}`,
    "PAGE TEXT:",
    page.text,
  ].join("\n");
}

async function extract(page: FetchedPage, today: string, apiKey: string): Promise<Extracted | null> {
  for (const model of MODEL_CHAIN) {
    try {
      const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: extractionPrompt(page, today) }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 800,
            responseMimeType: "application/json",
            responseSchema: EXTRACTION_SCHEMA,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
      });

      if (response.status === 429) continue;
      if (!response.ok) return null;

      const payload = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const raw = (payload.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      if (!raw) return null;

      return JSON.parse(raw) as Extracted;
    } catch {
      // Malformed JSON or a transport failure: try the next model, then give up.
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface DiscoverySummary {
  pagesSearched: number;
  extracted: number;
  verified: number;
  pending: number;
  rejected: number;
  duplicates: number;
  sources: RunSource[];
  /** Titles that reached the feed, for the run report. */
  added: { title: string; organization: string; host: string; status: string }[];
  model: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function asKind(value: unknown, fallback: OpportunityKind): OpportunityKind {
  return typeof value === "string" && (OPPORTUNITY_KINDS as readonly string[]).includes(value)
    ? (value as OpportunityKind)
    : fallback;
}

/**
 * Run `worker` over `items`, at most `size` in flight, stopping early once
 * `deadline` passes. Returning what has been gathered so far beats throwing
 * away a batch's work because the next one would have overrun.
 */
async function inBatches<T, R>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<R>,
  deadline?: number
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    if (deadline && Date.now() > deadline) break;
    out.push(...(await Promise.all(items.slice(i, i + size).map(worker))));
  }
  return out;
}

/**
 * Take one item per group, then a second from each, and so on.
 *
 * Search results arrive grouped by plan, so any straight `slice` off the front
 * spends the entire budget on whichever plans happen to run first. With the
 * internship and job plans listed first that meant the fetch budget was
 * exhausted before a single hackathon or scholarship URL was reached — the
 * queries for those kinds ran every night and their results were then thrown
 * away unread. Round-robin makes the cap cost every kind its tail results
 * rather than costing some kinds everything.
 */
function interleave<T>(items: T[], groupOf: (item: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = groupOf(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const out: T[] = [];
  const buckets = [...groups.values()];
  const deepest = Math.max(0, ...buckets.map((b) => b.length));
  for (let rank = 0; rank < deepest; rank += 1) {
    for (const bucket of buckets) {
      if (rank < bucket.length) out.push(bucket[rank]);
    }
  }
  return out;
}

/**
 * Pages fetched per run. Bounded so one invocation cannot run out of clock,
 * but high enough to be worth calling research: JSON-LD extraction costs no
 * model call, so most of these pages are nearly free. `inBatches` stops on the
 * deadline regardless, so this is a ceiling rather than a promise.
 */
const MAX_PAGES = 120;

/**
 * Pages sent to the model per run.
 *
 * The one stage that costs seconds each, so it is what gets cut first. It
 * matters more than it looks: Indian sites publish no JSON-LD at all (probed
 * across internshala, unstop, devfolio, hackerearth, cutshort, wipro and
 * buddy4study — zero of them emit it), so Indian results reach the board only
 * through this path while ATS pages take the free structured one.
 */
const MAX_MODEL_EXTRACTIONS = 30;

export async function runDiscovery(
  supabase: SupabaseClient,
  options: { runId?: string; now?: Date } = {}
): Promise<DiscoverySummary> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set — discovery cannot search.");

  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);

  const empty: DiscoverySummary = {
    pagesSearched: 0,
    extracted: 0,
    verified: 0,
    pending: 0,
    rejected: 0,
    duplicates: 0,
    sources: [],
    added: [],
    model: MODEL_CHAIN[0],
  };

  const deadline = now.getTime() + DISCOVERY_BUDGET_MS;

  // --- search every plan -------------------------------------------------
  // Searches are independent network calls, so they parallelise cleanly; at 2
  // at a time the plan list alone took longer than the whole function budget.
  const searched = await inBatches([...SEARCH_PLANS], 7, (plan) => searchPlan(plan, apiKey), deadline);
  const found = searched.flat();
  if (found.length === 0) return empty;

  // Resolve redirects, then drop duplicate URLs before spending any fetches.
  const resolvedRaw = await inBatches(
    found,
    10,
    async (page) => {
      const url = await resolveRedirect(page.url);
      return url ? { ...page, url } : null;
    },
    deadline
  );
  const resolved = resolvedRaw.filter((page): page is FoundPage => page !== null);

  const seenUrls = new Set<string>();
  const unique = resolved.filter((page) => {
    // Belt and braces: nothing carrying a grounding-redirect host may proceed,
    // whatever route it took to get here. See resolveRedirect.
    if (REDIRECT_HOST.test(page.url)) return false;
    const key = canonicalizeUrl(page.url) ?? page.url;
    if (seenUrls.has(key)) return false;
    seenUrls.add(key);
    // A blocked host (shortener, chat invite) is never worth a fetch.
    return classifyHost(hostOf(page.url)) !== "blocked";
  });

  const sourceTally = new Map<string, RunSource>();
  for (const page of unique) {
    const host = hostOf(page.url);
    const entry = sourceTally.get(host) ?? { host, plan: page.plan, results: 0, kept: 0 };
    entry.results += 1;
    sourceTally.set(host, entry);
  }

  const pages = interleave(unique, (page) => page.plan).slice(0, MAX_PAGES);

  // --- fetch + extract ---------------------------------------------------
  const fetched = (await inBatches(pages, 14, fetchPage, deadline)).filter(
    (page): page is FetchedPage => page !== null
  );

  /*
   * JSON-LD first, the model only for what is left.
   *
   * A page that publishes a JobPosting block has already stated its own title,
   * employer, location and expiry — reading them is exact, instant and free,
   * where asking a model to re-derive them from stripped markup is slower,
   * costs quota, and can paraphrase. On an ATS-heavy result set this is most of
   * the pages, which is what makes a 90-page run affordable at all.
   */
  const structured = fetched.filter((page) => page.jobPosting);
  const unstructured = fetched.filter((page) => !page.jobPosting);

  const extractions: { page: FetchedPage; data: Extracted | null }[] = structured.map((page) => ({
    page,
    data: fromJobPosting(page.jobPosting as Record<string, unknown>, page),
  }));

  // Only pages with real readable text are worth a model call, and only a
  // bounded number of them. Interleaved by kind for the same reason the fetch
  // budget is: the structured path is almost entirely foreign ATS pages, so
  // slicing this one in plan order would cut the Indian results specifically.
  const worthExtracting = interleave(
    unstructured.filter((page) => page.text.length >= MIN_TEXT),
    (page) => page.kind
  ).slice(0, MAX_MODEL_EXTRACTIONS);
  extractions.push(
    ...(await inBatches(
      worthExtracting,
      6,
      async (page) => ({ page, data: await extract(page, today, apiKey) }),
      deadline
    ))
  );

  // --- verify + dedupe ---------------------------------------------------
  const summary: DiscoverySummary = { ...empty, pagesSearched: unique.length };
  const rows: Record<string, unknown>[] = [];
  const byContent = new Map<string, number>();

  for (const { page, data } of extractions) {
    if (!data?.isOpportunity || !data.title || !data.organization) continue;
    summary.extracted += 1;

    const candidate: OpportunityCandidate = {
      title: data.title,
      organization: data.organization,
      kind: asKind(data.kind, page.kind),
      // Always the page actually fetched — the model never supplies a URL.
      applyUrl: page.url,
      sourceUrl: page.url,
      location: data.location ?? null,
      workMode:
        data.workMode === "onsite" || data.workMode === "remote" || data.workMode === "hybrid"
          ? data.workMode
          : null,
      eligibility: data.eligibility ?? null,
      skills: Array.isArray(data.skills) ? data.skills.slice(0, 8) : [],
      description: data.description ?? null,
      deadline: data.deadline ?? null,
      postedAt: data.postedAt ?? null,
    };

    const contentKey = contentFingerprint(candidate.title, candidate.organization);
    const seenBefore = byContent.get(contentKey) ?? 0;
    byContent.set(contentKey, seenBefore + 1);
    if (seenBefore > 0) summary.duplicates += 1;

    const verdict = verifyCandidate(candidate, {
      now,
      // The page was fetched successfully to get here, so it is reachable.
      reachability: "ok",
      // Corroboration counts distinct sources carrying the same listing.
      corroborations: seenBefore + 1,
    });

    if (verdict.status === "verified") summary.verified += 1;
    else if (verdict.status === "pending") summary.pending += 1;
    else summary.rejected += 1;

    const host = hostOf(page.url);
    const tally = sourceTally.get(host);
    if (tally && verdict.status === "verified") tally.kept += 1;

    if (verdict.status !== "rejected") {
      summary.added.push({
        title: candidate.title,
        organization: candidate.organization,
        host,
        status: verdict.status,
      });
    }

    const fingerprint = urlFingerprint(candidate.applyUrl);
    if (!fingerprint) continue;

    rows.push({
      title: candidate.title,
      organization: candidate.organization,
      kind: candidate.kind,
      apply_url: candidate.applyUrl,
      source_url: candidate.sourceUrl,
      url_fingerprint: fingerprint,
      content_fingerprint: contentKey,
      corroborations: seenBefore + 1,
      location: candidate.location,
      work_mode: candidate.workMode,
      eligibility: candidate.eligibility,
      skills: candidate.skills,
      description: candidate.description,
      deadline: candidate.deadline,
      posted_at: candidate.postedAt,
      status: verdict.status,
      source_tier: verdict.sourceTier,
      signals: verdict.signals,
      verified_at: verdict.status === "verified" ? now.toISOString() : null,
      last_checked_at: now.toISOString(),
      last_check_result: "ok",
      check_failures: 0,
      ...(options.runId ? { first_seen_run: options.runId, last_seen_run: options.runId } : {}),
    });
  }

  summary.sources = [...sourceTally.values()].sort((a, b) => b.results - a.results);

  if (rows.length > 0) {
    // merge-duplicates so a listing seen on a previous run is refreshed rather
    // than rejected by the unique index on url_fingerprint.
    const { error } = await supabase
      .from("opportunities")
      .upsert(rows, { onConflict: "url_fingerprint", ignoreDuplicates: false });
    if (error) throw new Error(`Could not save discovered opportunities: ${error.message}`);
  }

  return summary;
}
