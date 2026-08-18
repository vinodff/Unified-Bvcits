// Application tracker states.
//
// These live here rather than beside the server actions because a "use server"
// module may only export async functions — a plain `const` exported from one is
// a build error, and the client component that renders the status picker needs
// these values.
//
// Kept in step with the CHECK constraint on opportunity_saves.status in
// supabase/migrations/0006_opportunities.sql.

export const TRACKER_STATUSES = ["saved", "applied", "shortlisted", "rejected", "accepted"] as const;

export type TrackerStatus = (typeof TRACKER_STATUSES)[number];

export const TRACKER_LABELS: Record<TrackerStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  shortlisted: "Shortlisted",
  rejected: "Not selected",
  accepted: "Offer received",
};

export function isTrackerStatus(value: unknown): value is TrackerStatus {
  return typeof value === "string" && (TRACKER_STATUSES as readonly string[]).includes(value);
}
