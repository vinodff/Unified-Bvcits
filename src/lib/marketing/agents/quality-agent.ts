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

  // 3. Unsupported claims — capitalized names not present in the fact base
  const factText = facts.map((f) => String(Array.isArray(f.value) ? f.value.join(" ") : f.value ?? "")).join(" ").toLowerCase();
  const brand = await store.getBrand();
  const safeNames = new Set([
    ...brand.departments.map((d) => d.toLowerCase()),
    brand.shortName.toLowerCase(),
    brand.collegeName.toLowerCase().split(" "),
    "bvcits", "amalapuram", "bvts", "autonomous", "naac", "nba", "aicte", "jntuk", "konaseema",
  ]);

  for (const cv of content) {
    const words = cv.body.replace(/\n/g, " ").split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (!/[A-Z]/.test(w)) continue;
      const clean = w.replace(/[^A-Za-z&.'-]/g, "");
      if (clean.length < 3) continue;
      const lower = clean.toLowerCase();
      if (safeNames.has(lower)) continue;
      if (lower === "team" || lower === "dr" || lower === "mr" || lower === "mrs" || lower === "prof" || lower === "the" || lower === "and" || lower === "at" || lower === "of") continue;
      const prev = words[i - 1]?.toLowerCase();
      if (prev === "dr" || prev === "mr" || prev === "mrs" || prev === "prof") {
        if (!factText.includes(clean.toLowerCase())) {
          issues.push({ severity: "critical", message: `${cv.platform}: name "${w}" not found in the fact base.` });
        }
        continue;
      }
      if (/^(dr|mr|mrs|prof)\.?$/i.test(clean)) continue;
      if (!factText.includes(lower)) {
        issues.push({ severity: "warning", message: `${cv.platform}: capitalized term "${w}" not found in the fact base — verify it is not invented.` });
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
  const overall = Math.max(0, 100 - criticals * 22 - warnings * 4);

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
    verdict: criticals > 0 ? "needs_correction" : "pass",
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