// Quality Control Agent (spec Section 23): final gate before human review.
// Any critical issue → verdict needs_correction → campaign returns to
// CHANGES_REQUESTED; nothing reaches the admin review queue unreviewed.

import type { CampaignFact, ContentVersion, Platform, QualityScore } from "../domain";
import type { StorageProvider } from "../storage";
import { REQUIRED_FIELDS, FACT_LABELS } from "./context-agent";
import { scanExistingRoutes } from "./seo-agent";

const PLATFORM_LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 5000,
  linkedin: 3000,
  whatsapp: 4096,
  website: 50000,
};

/**
 * Ordinary words that routinely appear capitalised in marketing prose and
 * headings. Flagging these as possibly-invented names is noise that drowns out
 * the real signal — an actual unverified person or organisation.
 */
const COMMON_CAPITALISED: ReadonlySet<string> = new Set([
  // months and weekdays
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  // sentence and heading furniture
  "this", "that", "these", "those", "there", "their", "they", "then", "with",
  "from", "for", "our", "its", "his", "her", "you", "your", "was", "were",
  "here", "what", "when", "where", "which", "while", "who", "how", "why",
  "all", "also", "and", "are", "but", "not", "now", "the", "over", "under",
  "alongside", "across", "after", "before", "during", "throughout", "together",
  // common institutional / marketing vocabulary
  "event", "events", "students", "student", "faculty", "department", "departments",
  "college", "campus", "team", "teams", "winners", "winner", "prize", "prizes",
  "chief", "guest", "guests", "highlights", "overview", "about", "impact",
  "outcomes", "excellence", "celebration", "brilliance", "honoring", "honouring",
  "congratulations", "admissions", "placements", "gallery", "photo", "photos",
  "workshop", "seminar", "hackathon", "competition", "performance", "performances",
  "talent", "creativity", "confidence", "energy", "showcase", "recognition",
  "participants", "participation", "organisers", "organizers", "venue", "date",
  "visit", "success", "join", "apply", "follow", "read", "watch", "learn",
  "more", "thank", "thanks", "stay", "connected", "proud", "special", "every",
]);

const MAX_HASHTAGS: Record<string, number> = {
  instagram: 15,
  facebook: 5,
  linkedin: 5,
  whatsapp: 0,
  website: 0,
};

interface Issue {
  severity: "critical" | "warning" | "info";
  message: string;
}

export async function runQualityCheck(
  campaignId: string,
  version: number,
  facts: CampaignFact[],
  content: ContentVersion[],
  store: StorageProvider,
  campaignType: string
): Promise<QualityScore> {
  const issues: Issue[] = [];

  // 1. Missing required information
  const have = new Set(facts.filter((f) => f.value != null && f.value !== "" && f.value !== false).map((f) => f.field));
  for (const field of REQUIRED_FIELDS[campaignType as keyof typeof REQUIRED_FIELDS] ?? []) {
    if (!have.has(field)) {
      issues.push({ severity: "critical", message: `Missing required fact: ${FACT_LABELS[field] ?? field}.` });
    }
  }

  // 2. Contradictions — same fact stored twice with different values
  const byField = new Map<string, CampaignFact[]>();
  for (const f of facts) {
    const arr = byField.get(f.field) ?? [];
    arr.push(f);
    byField.set(f.field, arr);
  }
  for (const [field, values] of byField) {
    const distinct = new Set(values.map((v) => JSON.stringify(v.value)));
    if (distinct.size > 1) {
      issues.push({ severity: "critical", message: `Contradictory values for "${field}".` });
    }
  }

  // 3. Unsupported claims — capitalised names not present in the fact base
  const factText = facts.map((f) => String(Array.isArray(f.value) ? f.value.join(" ") : f.value ?? "")).join(" ").toLowerCase();
  const brand = await store.getBrand();
  const safeNames = new Set([
    ...brand.departments.map((d) => d.toLowerCase()),
    brand.shortName.toLowerCase(),
    brand.collegeName.toLowerCase().split(" "),
    "bvcits", "amalapuram", "bvts", "autonomous", "naac", "nba", "aicte", "jntuk", "konaseema",
  ]);

  /*
   * This check exists to catch an invented name. It is not a spell-checker for
   * English capitalisation, and treating it as one made it useless: a real run
   * produced 37 warnings for "This", "August", "Excellence", "Chief" and other
   * words capitalised by grammar rather than because they name anyone. At four
   * points each that floored a perfectly good campaign to 0/100.
   *
   * So a word is only suspicious when its capital cannot be explained by
   * position (start of a sentence, heading, or list item) or by being an
   * ordinary word that commonly appears capitalised.
   */
  for (const cv of content) {
    for (const rawLine of cv.body.split("\n")) {
      // Markdown headings and list markers capitalise their first word by
      // convention, so strip the marker and treat what follows as line-initial.
      const line = rawLine.replace(/^\s*(#{1,6}|[-*+]|\d+\.)\s*/, "");
      const words = line.split(/\s+/).filter(Boolean);

      for (let i = 0; i < words.length; i++) {
        // Emphasis and link syntax sit in front of the word: "**Success" and
        // "[Visit" are line-initial in the rendered output, so the marker must
        // come off before deciding whether the capital needs explaining.
        const w = words[i].replace(/^[*_~`[(“"']+/, "");
        if (!/^[A-Z]/.test(w)) continue;

        const clean = w.replace(/[^A-Za-z&.'-]/g, "");
        if (clean.length < 3) continue;
        const lower = clean.toLowerCase();
        if (safeNames.has(lower)) continue;
        if (/^(dr|mr|mrs|prof)\.?$/i.test(clean)) continue;

        const prevWord = words[i - 1]?.replace(/[*_~`]+$/, "");
        const prevLower = prevWord?.replace(/[^A-Za-z]/g, "").toLowerCase();

        // Directly after an honorific this is a person's name — the one case
        // worth treating as critical, because inventing a guest is serious.
        if (prevLower === "dr" || prevLower === "mr" || prevLower === "mrs" || prevLower === "prof") {
          if (!factText.includes(lower)) {
            issues.push({ severity: "critical", message: `${cv.platform}: name "${w}" not found in the fact base.` });
          }
          continue;
        }

        /*
         * Capital explained by position: first word of a line, or first word
         * after sentence-ending punctuation.
         *
         * Emoji and decoration are skipped when looking back, because social
         * copy routinely opens a line with one ("🎉 **Celebrating** …"). Treating
         * the emoji as the preceding word made the real first word look
         * mid-sentence and flagged it.
         */
        let back = i - 1;
        while (back >= 0 && !/[A-Za-z]/.test(words[back])) back--;
        const priorWord = back >= 0 ? words[back].replace(/[*_~`]+$/, "") : null;
        const sentenceInitial = priorWord === null || /[.!?:]["')]?$/.test(priorWord);
        if (sentenceInitial) continue;

        // Capital explained by the word simply being an ordinary one.
        if (COMMON_CAPITALISED.has(lower)) continue;

        if (!factText.includes(lower)) {
          issues.push({ severity: "warning", message: `${cv.platform}: capitalized term "${w}" not found in the fact base — verify it is not invented.` });
        }
      }
    }
  }

  // 4. Platform limits + hashtag counts + duplicates
  const seen: string[] = [];
  for (const cv of content) {
    const limit = PLATFORM_LIMITS[cv.platform] ?? 2200;
    if (cv.body.length > limit) {
      issues.push({ severity: "critical", message: `${cv.platform}: ${cv.body.length} chars exceeds the ${limit} limit.` });
    }
    const hashtagCount = (cv.body.match(/#[A-Za-z0-9_]+/g) ?? []).length;
    const maxTags = MAX_HASHTAGS[cv.platform] ?? 15;
    if (hashtagCount > maxTags) {
      issues.push({ severity: "warning", message: `${cv.platform}: ${hashtagCount} hashtags (max ${maxTags} recommended).` });
    }
    const norm = cv.body.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    if (seen.some((s) => s === norm)) {
      issues.push({ severity: "warning", message: `${cv.platform}: duplicate of another platform's content — platform versions should differ.` });
    }
    seen.push(norm);
  }

  // 5. Broken internal links (website version)
  const existingRoutes = await scanExistingRoutes();
  for (const cv of content) {
    if (cv.platform !== "website") continue;
    const links = cv.body.match(/\]\((https?:\/\/[^)]+|\/[^)]+)\)/g) ?? [];
    for (const raw of links) {
      const href = raw.replace(/^\]\(/, "").replace(/\)$/, "");
      if (/^https?:\/\//.test(href)) continue;
      const route = href.split("#")[0].split("?")[0];
      if (route && !existingRoutes.includes(route) && !route.startsWith("/media")) {
        issues.push({ severity: "warning", message: `Website article links to non-existent route ${route}.` });
      }
    }
  }

  // 6. Sensitive data — personal phone/email beyond brand contact
  const brandContact = [brand.contact.phone.replace(/\D/g, ""), brand.contact.email.toLowerCase()];
  for (const cv of content) {
    const phones = cv.body.match(/(?:\+91[\s-]?)?\d{10}/g) ?? [];
    for (const p of phones) {
      if (!brandContact.includes(p.replace(/\D/g, ""))) {
        issues.push({ severity: "warning", message: `${cv.platform}: phone number ${p} is not the official BVCITS contact.` });
      }
    }
    const emails = cv.body.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
    for (const e of emails) {
      if (!brandContact.includes(e.toLowerCase())) {
        issues.push({ severity: "warning", message: `${cv.platform}: email ${e} is not an official BVCITS address.` });
      }
    }
  }

  const criticals = issues.filter((i) => i.severity === "critical").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;

  /*
   * Warnings are capped, criticals are not.
   *
   * Uncapped warnings meant enough minor notes could drive the score to zero
   * while the verdict still read "pass", because the verdict only ever looked
   * at criticals. "Quality check passed (0/100)" is not a result an admin can
   * act on. Warnings now cost 3 each up to a 30-point ceiling, and the verdict
   * is tied to the score as well as to criticals, so the two can never
   * contradict each other.
   */
  const WARNING_PENALTY_CEILING = 30;
  const PASS_MARK = 60;
  const overall = Math.max(0, 100 - criticals * 22 - Math.min(warnings * 3, WARNING_PENALTY_CEILING));

  return {
    campaignId,
    contentVersion: version,
    overall,
    breakdown: {
      "factual grounding": criticals ? 60 - criticals * 15 : 96,
      "information completeness": have.size >= REQUIRED_FIELDS[campaignType as keyof typeof REQUIRED_FIELDS]?.length ? 92 : 55,
      "platform compliance": issues.filter((i) => i.message.includes("limit")).length ? 60 : 95,
      "internal linking": issues.filter((i) => i.message.includes("route")).length ? 65 : 90,
      "sensitivity": warnings ? 70 : 95,
      "duplication": issues.filter((i) => i.message.includes("duplicate")).length ? 60 : 93,
    },
    issues,
    verdict: criticals > 0 || overall < PASS_MARK ? "needs_correction" : "pass",
    checkedAt: new Date().toISOString(),
    by: "quality-agent-v1",
  };
}

export function verdictSummary(score: QualityScore): string {
  if (score.verdict === "pass") {
    return `Quality check passed (${score.overall}/100) — no unresolved factual conflicts.`;
  }
  return `Quality check requires correction (${score.overall}/100): ${score.issues
    .filter((i) => i.severity === "critical")
    .map((i) => i.message)
    .join(" ")}`;
}