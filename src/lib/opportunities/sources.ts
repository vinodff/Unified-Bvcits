// Domain trust registry.
//
// This is the single highest-leverage anti-scam control in the pipeline, and it
// is deliberately a static allowlist rather than a heuristic. A model asked "is
// this a real internship?" will confidently say yes about a Telegram link; a
// list of applicant tracking systems will not.
//
// The tiers mean different things and are treated differently downstream:
//   official    — the employer/organiser themselves, or the ATS they hired.
//                 Good enough to publish on its own.
//   aggregator  — a real, large job board. Publishable, but flagged as
//                 second-hand so a student knows to confirm on the source.
//   unknown     — everything else. Stays `pending`; a human decides.
//   blocked     — never publishable at any confidence. See BLOCKED_HOSTS.

import type { SourceTier } from "./types";

/**
 * Applicant tracking systems. If a posting lives here, an employer paid for a
 * seat and configured it — which is a far stronger authenticity signal than any
 * wording in the post itself.
 */
const ATS_SUFFIXES = [
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "workday.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "icims.com",
  "taleo.net",
  "successfactors.com",
  "oraclecloud.com",
  "eightfold.ai",
  "darwinbox.in",
  "keka.com",
  "zohorecruit.com",
] as const;

/** Career portals run by the employer directly. */
const OFFICIAL_CAREER_HOSTS = [
  "careers.google.com",
  "google.com",
  "amazon.jobs",
  "jobs.microsoft.com",
  "careers.microsoft.com",
  "metacareers.com",
  "apple.com",
  "careers.adobe.com",
  "jobs.netflix.com",
  "careers.ibm.com",
  "nextstep.tcs.com",
  "careers.infosys.com",
  "careers.wipro.com",
  "cognizant.com",
  "accenture.com",
  "jobs.accenture.com",
  "careers.salesforce.com",
  "jobs.nvidia.com",
  "studentambassadors.microsoft.com",
  "developers.google.com",
  "summerofcode.withgoogle.com",
] as const;

/** Hackathon, competition and open-source-programme platforms. */
const OFFICIAL_PROGRAMME_HOSTS = [
  "devpost.com",
  "mlh.io",
  "devfolio.co",
  "hackerearth.com",
  "unstop.com",
  "kaggle.com",
  "topcoder.com",
  "codeforces.com",
  "hackathon.com",
] as const;

/**
 * Public-sector and academic suffixes. In the Indian context these carry real
 * institutional weight — a `.gov.in` scholarship is not a scam — and they are
 * registry-controlled, so they cannot be squatted the way a `.com` can.
 */
const OFFICIAL_SUFFIXES = [
  ".gov.in",
  ".nic.in",
  ".ac.in",
  ".edu.in",
  ".edu",
  ".gov",
  ".ac.uk",
  ".europa.eu",
] as const;

/** Real boards, but the listing is second-hand and can be stale or reposted. */
const AGGREGATOR_HOSTS = [
  "linkedin.com",
  "internshala.com",
  "naukri.com",
  "indeed.com",
  "glassdoor.com",
  "wellfound.com",
  "angel.co",
  "monster.com",
  "shine.com",
  "timesjobs.com",
  "eventbrite.com",
  "meetup.com",
  "freshersworld.com",
  "cutshort.io",
  "instahyre.com",
] as const;

/**
 * Never publishable.
 *
 * Two families, both fatal for different reasons:
 *   - URL shorteners hide the real destination, so the entire trust check
 *     above becomes meaningless. A legitimate recruiter does not need one.
 *   - Chat/DM links as the *application route* are the signature of the
 *     "pay ₹500 to join our placement group" scam. A real employer collects
 *     applications, not WhatsApp members.
 */
const BLOCKED_HOSTS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "cutt.ly",
  "rb.gy",
  "is.gd",
  "shorturl.at",
  "rebrand.ly",
  "ow.ly",
  "buff.ly",
  "t.me",
  "chat.whatsapp.com",
  "wa.me",
  "api.whatsapp.com",
  "telegram.me",
] as const;

/** True when `host` is exactly `domain` or a subdomain of it. */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Classify a hostname.
 *
 * Order matters: blocked wins over everything (a shortener pointing at
 * greenhouse.io is still a shortener), then official, then aggregator.
 */
export function classifyHost(host: string): SourceTier {
  const normalized = host.toLowerCase().replace(/^www\./, "");

  if (BLOCKED_HOSTS.some((d) => hostMatches(normalized, d))) return "blocked";

  if (
    ATS_SUFFIXES.some((d) => hostMatches(normalized, d)) ||
    OFFICIAL_CAREER_HOSTS.some((d) => hostMatches(normalized, d)) ||
    OFFICIAL_PROGRAMME_HOSTS.some((d) => hostMatches(normalized, d)) ||
    OFFICIAL_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  ) {
    return "official";
  }

  if (AGGREGATOR_HOSTS.some((d) => hostMatches(normalized, d))) return "aggregator";

  return "unknown";
}

/** Points contributed to the ranking score by each tier. See score.ts. */
export const TIER_WEIGHT: Record<SourceTier, number> = {
  official: 25,
  aggregator: 12,
  unknown: 0,
  blocked: 0,
};
