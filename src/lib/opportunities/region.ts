// Where an opportunity actually is.
//
// The third relevance gate, alongside domain trust (sources.ts) and seniority
// (isStudentLevel in verify.ts). It exists for the same reason those do: the
// first live runs published perfectly trustworthy, perfectly student-level
// listings that were useless to the students reading them — NVIDIA Santa
// Clara, Meta Menlo Park, SpaceX Hawthorne, FedEx Memphis. A BVCITS
// undergraduate cannot apply to a US on-site internship, so a board full of
// them is a board with nothing on it.
//
// Trustworthy, student-level, and reachable are all still true of those rows.
// Reachable-by-this-student is a separate question, and nothing was asking it.

import type { OpportunityCandidate, OpportunityKind } from "./types";

export const REGION_FITS = ["india", "global", "foreign", "unknown"] as const;
export type RegionFit = (typeof REGION_FITS)[number];

/**
 * Indian locations, as they are actually written on job postings.
 *
 * Both spellings of the renamed cities appear in the wild and postings are
 * inconsistent about which they use, so both are listed. Word boundaries matter:
 * a bare "in" or "goa" would match inside unrelated words.
 *
 * The state list carries most of the weight, because a posting that names an
 * unlisted town almost always names its state too. Metro-only coverage held
 * genuinely Indian roles at `pending` for no better reason than being outside
 * the eight cities someone happened to type.
 */
const INDIA_STATES = [
  /\bandhra\b/i,
  /\btelangana\b/i,
  /\bkarnataka\b/i,
  /\btamil\s*nadu\b/i,
  /\bkerala\b/i,
  /\bmaharashtra\b/i,
  /\bgujarat\b/i,
  /\bodisha\b/i,
  /\borissa\b/i,
  /\bwest\s*bengal\b/i,
  /\buttar\s*pradesh\b/i,
  /\bmadhya\s*pradesh\b/i,
  /\brajasthan\b/i,
  /\bpunjab\b/i,
  /\bharyana\b/i,
  /\bbihar\b/i,
  /\bjharkhand\b/i,
  /\bchhattisgarh\b/i,
  /\bassam\b/i,
  /\buttarakhand\b/i,
  /\bhimachal\b/i,
  /\bgoa\b/i,
  /\bpuducherry\b/i,
  /\bpondicherry\b/i,
];

const INDIA_CITIES = [
  /\bbe?ngal[uo]ru\b/i,
  /\bbangalore\b/i,
  /\bhyderabad\b/i,
  /\bsecunderabad\b/i,
  /\bchennai\b/i,
  /\bmadras\b/i,
  /\bmumbai\b/i,
  /\bbombay\b/i,
  /\bnavi\s*mumbai\b/i,
  /\bthane\b/i,
  /\bpune\b/i,
  /\bdelhi\b/i,
  /\bnoida\b/i,
  /\bgurgaon\b/i,
  /\bgurugram\b/i,
  /\bghaziabad\b/i,
  /\bfaridabad\b/i,
  /\bncr\b/i,
  /\bkolkata\b/i,
  /\bcalcutta\b/i,
  /\bahmedabad\b/i,
  /\bsurat\b/i,
  /\bvadodara\b/i,
  /\bcoimbatore\b/i,
  /\bmadurai\b/i,
  // Salem is deliberately absent: Oregon, Massachusetts and New Hampshire all
  // have one, and since India wins ties a US posting would read as Indian.
  /\bvellore\b/i,
  /\bkochi\b/i,
  /\bcochin\b/i,
  /\btrivandrum\b/i,
  /\bthiruvananthapuram\b/i,
  /\bkozhikode\b/i,
  /\bindore\b/i,
  /\bbhopal\b/i,
  /\bjaipur\b/i,
  /\bjodhpur\b/i,
  /\bchandigarh\b/i,
  /\bludhiana\b/i,
  /\bamritsar\b/i,
  /\bdehradun\b/i,
  /\bbhubaneswar\b/i,
  /\bcuttack\b/i,
  /\brourkela\b/i,
  /\bnagpur\b/i,
  /\bnashik\b/i,
  /\baurangabad\b/i,
  /\bkolhapur\b/i,
  /\bmysore\b/i,
  /\bmysuru\b/i,
  /\bmangalore\b/i,
  /\bmangaluru\b/i,
  /\bhubli\b/i,
  /\bbelgaum\b/i,
  /\blucknow\b/i,
  /\bkanpur\b/i,
  /\bvaranasi\b/i,
  /\bprayagraj\b/i,
  /\ballahabad\b/i,
  /\bagra\b/i,
  /\bmeerut\b/i,
  /\bpatna\b/i,
  /\branchi\b/i,
  /\braipur\b/i,
  /\bguwahati\b/i,
  /\bsiliguri\b/i,
  // Coastal Andhra — the college's own catchment, and the towns most likely to
  // appear on a local posting that no national board would bother listing.
  /\bvisakhapatnam\b/i,
  /\bvizag\b/i,
  /\bvijayawada\b/i,
  /\bamalapuram\b/i,
  /\bkakinada\b/i,
  /\brajahmundry\b/i,
  /\brajamahendravaram\b/i,
  /\bbhimavaram\b/i,
  /\beluru\b/i,
  /\btanuku\b/i,
  /\bguntur\b/i,
  /\bnellore\b/i,
  /\bongole\b/i,
  /\bkurnool\b/i,
  /\btirupati\b/i,
  /\bwarangal\b/i,
  /\bkarimnagar\b/i,
];

const INDIA_MARKERS = [/\bindia\b/i, /\bbharat\b/i, ...INDIA_STATES, ...INDIA_CITIES];

/**
 * Places that are definitively not India.
 *
 * Only unambiguous ones. "Cambridge" and "Birmingham" exist on two continents;
 * "Hyderabad" exists in Pakistan too but overwhelmingly means the Indian city
 * on a tech posting, so it stays above. A name that could plausibly be either
 * belongs in neither list — `unknown` is the honest answer.
 */
const FOREIGN_MARKERS = [
  /\bunited states\b/i,
  /\bu\.?s\.?a\.?\b/i,
  /\bcalifornia\b/i,
  /\bnew york\b/i,
  /\bseattle\b/i,
  /\bsan francisco\b/i,
  /\bsanta clara\b/i,
  /\bmenlo park\b/i,
  /\bmountain view\b/i,
  /\bsunnyvale\b/i,
  /\baustin\b/i,
  /\bboston\b/i,
  /\bchicago\b/i,
  /\bredmond\b/i,
  /\bhawthorne\b/i,
  /\bmemphis\b/i,
  /\btexas\b/i,
  /\bwashington\b/i,
  /\bcanada\b/i,
  /\btoronto\b/i,
  /\bvancouver\b/i,
  /\bunited kingdom\b/i,
  /\blondon\b/i,
  /\bireland\b/i,
  /\bdublin\b/i,
  /\bgermany\b/i,
  /\bberlin\b/i,
  /\bmunich\b/i,
  /\bnetherlands\b/i,
  /\bamsterdam\b/i,
  /\bfrance\b/i,
  /\bparis\b/i,
  /\bsingapore\b/i,
  /\bsydney\b/i,
  /\bmelbourne\b/i,
  /\baustralia\b/i,
  /\bjapan\b/i,
  /\btokyo\b/i,
  /\bisrael\b/i,
  /\btel aviv\b/i,
  /\bpoland\b/i,
  /\bwarsaw\b/i,
  /\bzurich\b/i,
  /\bswitzerland\b/i,
  /\bsweden\b/i,
  /\bdubai\b/i,
  /\babu dhabi\b/i,
];

/** Anywhere-in-the-world participation — normal for online events. */
const GLOBAL_MARKERS = [/\bremote\b/i, /\bonline\b/i, /\bvirtual\b/i, /\bworldwide\b/i, /\banywhere\b/i, /\bglobal\b/i];

/**
 * Where an opportunity is, from whatever the source stated.
 *
 * India wins over foreign when both appear, because "Bengaluru, India /
 * London, UK" on a multi-site posting still means a student here can apply.
 * The reverse ordering rejected genuinely Indian roles at global companies.
 */
export function classifyRegion(candidate: Pick<OpportunityCandidate, "location" | "eligibility" | "description" | "title">): RegionFit {
  const haystack = [candidate.location, candidate.eligibility, candidate.title, candidate.description]
    .filter(Boolean)
    .join(" · ");

  if (!haystack.trim()) return "unknown";
  if (INDIA_MARKERS.some((re) => re.test(haystack))) return "india";
  if (FOREIGN_MARKERS.some((re) => re.test(haystack))) return "foreign";
  if (GLOBAL_MARKERS.some((re) => re.test(haystack))) return "global";
  return "unknown";
}

/**
 * Kinds a student can take part in from Amalapuram regardless of where the
 * organiser sits. An online hackathon on Devpost is genuinely open to them;
 * an on-site graduate role in Seattle is not.
 */
const LOCATION_FREE_KINDS: ReadonlySet<OpportunityKind> = new Set([
  "hackathon",
  "competition",
  "webinar",
  "workshop",
  "ambassador",
  "event",
]);

export interface RegionVerdict {
  fit: RegionFit;
  /** False means reject outright — the wrong country for this audience. */
  acceptable: boolean;
  /** True when it should be held for a human rather than published. */
  needsReview: boolean;
  signal: string | null;
}

/**
 * Apply the region policy for a kind.
 *
 * Employment and money are location-bound: a job, internship, scholarship or
 * fellowship in another country is not something these students can take, so
 * an explicitly foreign one is rejected rather than held. Participation kinds
 * are not: a remote hackathon is open to anyone with a laptop.
 *
 * `unknown` is never rejected. A posting that simply did not state a location
 * might well be Indian, and silently dropping it would lose real opportunities
 * to a formatting quirk — so it is held for review instead.
 */
export function regionVerdict(candidate: OpportunityCandidate): RegionVerdict {
  const fit = classifyRegion(candidate);

  // No signal: signals are caveats a reviewer needs to weigh, and being in the
  // right country is the expected case, not a warning about one.
  if (fit === "india") {
    return { fit, acceptable: true, needsReview: false, signal: null };
  }

  if (LOCATION_FREE_KINDS.has(candidate.kind)) {
    // Only an explicitly foreign IN-PERSON event is out; remote/online is fine.
    if (fit === "foreign") {
      return {
        fit,
        acceptable: false,
        needsReview: false,
        signal: "in-person event outside India",
      };
    }
    return { fit, acceptable: true, needsReview: false, signal: fit === "global" ? "open online worldwide" : null };
  }

  if (fit === "foreign") {
    return {
      fit,
      acceptable: false,
      needsReview: false,
      signal: "based outside India — students here cannot apply",
    };
  }

  if (fit === "global") {
    // "Remote" on a job with no country is usually remote-within-one-country.
    // Worth a look, not worth publishing unchecked.
    return { fit, acceptable: true, needsReview: true, signal: "remote, country not stated" };
  }

  return { fit, acceptable: true, needsReview: true, signal: "location not stated" };
}
