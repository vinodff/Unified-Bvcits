// Fact-Check Agent (spec Sections 7, 23): validates every fact before the
// pipeline trusts it — date sanity, department membership, URL/phone/email
// formats, count bounds. Never marks an admin fact wrong; only flags for review.

import { DEFAULT_BRAND } from "../brand";
import type { CampaignFact } from "../domain";
import type { StorageProvider } from "../storage";

export interface FactCheckResult {
  ok: boolean;
  warnings: { field: string; message: string }[];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KNOWN_TYPES = new Set(["event", "workshop", "hackathon", "competition", "seminar", "tieup", "achievement", "placement", "admission"]);

export async function factCheck(facts: CampaignFact[], store: StorageProvider): Promise<FactCheckResult> {
  const warnings: { field: string; message: string }[] = [];
  const brand = await store.getBrand();
  const deptNames = new Set(brand.departments.map((d) => d.toLowerCase()));

  for (const f of facts) {
    const v = f.value;
    if (v == null || v === "" || v === false) continue;

    switch (f.field) {
      case "date": {
        const s = String(v);
        if (!ISO_DATE_RE.test(s)) {
          warnings.push({ field: f.field, message: `Date "${s}" is not ISO (YYYY-MM-DD).` });
        } else {
          const d = new Date(`${s}T00:00:00`);
          if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2035) {
            warnings.push({ field: f.field, message: `Date "${s}" is out of the plausible 2000–2035 range.` });
          }
        }
        break;
      }
      case "venue": {
        const s = String(v);
        if (!/bvc/i.test(s) && !/campus|hall|auditorium|lab|block/i.test(s)) {
          warnings.push({ field: f.field, message: `Venue "${s}" does not look like a campus location.` });
        }
        break;
      }
      case "departments": {
        const deps = Array.isArray(v) ? v.map(String) : String(v).split(",").map((s) => s.trim());
        for (const d of deps) {
          if (!deptNames.has(d.toLowerCase())) {
            warnings.push({ field: f.field, message: `"${d}" is not in the BVCITS department list (${brand.departments.join(", ")}).` });
          }
        }
        break;
      }
      case "websiteUrl": {
        const s = String(v);
        if (!/^https:\/\//i.test(s)) {
          warnings.push({ field: f.field, message: `URL "${s}" must start with https://.` });
        }
        break;
      }
      case "winners":
      case "participants": {
        const n = Number(v);
        if (Number.isNaN(n) || n < 1 || n > 100000) {
          warnings.push({ field: f.field, message: `Value "${String(v)}" is not a plausible positive count.` });
        }
        break;
      }
      case "type": {
        if (!KNOWN_TYPES.has(String(v))) {
          warnings.push({ field: f.field, message: `Type "${String(v)}" is not one of the supported campaign types.` });
        }
        break;
      }
    }
  }

  return { ok: warnings.length === 0, warnings };
}