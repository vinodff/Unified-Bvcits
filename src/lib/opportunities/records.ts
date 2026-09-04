// Row → domain mapping.
//
// Kept out of the page component so the shape the UI consumes is defined once,
// and so a row that the database somehow holds in a state the app does not
// understand (an enum value added by a later migration, say) is dropped rather
// than rendered as `undefined`.

import { isOpportunityKind, SOURCE_TIERS, WORK_MODES } from "./types";
import type { OpportunityRecord, SourceTier, WorkMode } from "./types";

/** The column list the portal selects. Exported so the query cannot drift. */
export const OPPORTUNITY_COLUMNS =
  "id, title, organization, kind, apply_url, source_url, location, work_mode, eligibility, skills, description, deadline, posted_at, status, source_tier, signals, discovered_at, corroborations, last_checked_at";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asWorkMode(value: unknown): WorkMode | null {
  return typeof value === "string" && (WORK_MODES as readonly string[]).includes(value)
    ? (value as WorkMode)
    : null;
}

function asSourceTier(value: unknown): SourceTier {
  return typeof value === "string" && (SOURCE_TIERS as readonly string[]).includes(value)
    ? (value as SourceTier)
    : "unknown";
}

/** Returns null for a row the app cannot safely display. */
export function fromRow(row: Record<string, unknown>): OpportunityRecord | null {
  if (typeof row.id !== "string") return null;
  if (typeof row.title !== "string" || typeof row.organization !== "string") return null;
  if (!isOpportunityKind(row.kind)) return null;
  if (typeof row.apply_url !== "string") return null;

  return {
    id: row.id,
    title: row.title,
    organization: row.organization,
    kind: row.kind,
    applyUrl: row.apply_url,
    sourceUrl: typeof row.source_url === "string" ? row.source_url : null,
    location: typeof row.location === "string" ? row.location : null,
    workMode: asWorkMode(row.work_mode),
    eligibility: typeof row.eligibility === "string" ? row.eligibility : null,
    skills: asStringArray(row.skills),
    description: typeof row.description === "string" ? row.description : null,
    deadline: typeof row.deadline === "string" ? row.deadline : null,
    postedAt: typeof row.posted_at === "string" ? row.posted_at : null,
    status: row.status === "verified" || row.status === "rejected" ? row.status : "pending",
    sourceTier: asSourceTier(row.source_tier),
    signals: asStringArray(row.signals),
    discoveredAt: typeof row.discovered_at === "string" ? row.discovered_at : new Date().toISOString(),
    corroborations: typeof row.corroborations === "number" ? row.corroborations : 1,
    lastCheckedAt: typeof row.last_checked_at === "string" ? row.last_checked_at : null,
  };
}
