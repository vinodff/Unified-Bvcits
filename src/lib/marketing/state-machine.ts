// Campaign state machine — the approval gate is enforced here AND re-enforced
// server-side at publish time. The natural-language assistant can never bypass it.

import type { CampaignStatus } from "./domain";

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "DRAFT",
  "NEEDS_INFORMATION",
  "GENERATING",
  "READY_FOR_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "GENERATION_FAILED",
  "PUBLISH_FAILED",
  "SCHEDULE_FAILED",
];

/** Allowed transitions. READY_FOR_REVIEW → PUBLISHED is deliberately absent. */
const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["NEEDS_INFORMATION", "GENERATING", "GENERATION_FAILED"],
  NEEDS_INFORMATION: ["NEEDS_INFORMATION", "GENERATING", "GENERATION_FAILED", "DRAFT"],
  GENERATING: ["READY_FOR_REVIEW", "NEEDS_INFORMATION", "GENERATION_FAILED"],
  READY_FOR_REVIEW: ["CHANGES_REQUESTED", "APPROVED", "GENERATING", "GENERATION_FAILED"],
  CHANGES_REQUESTED: ["GENERATING", "READY_FOR_REVIEW", "APPROVED"],
  APPROVED: ["SCHEDULED", "PUBLISHING", "PUBLISHED", "READY_FOR_REVIEW", "PUBLISH_FAILED"],
  SCHEDULED: ["PUBLISHING", "PUBLISHED", "PUBLISH_FAILED", "SCHEDULE_FAILED", "READY_FOR_REVIEW"],
  PUBLISHING: ["PUBLISHED", "PUBLISH_FAILED", "SCHEDULE_FAILED"],
  PUBLISHED: ["PUBLISHED"],
  GENERATION_FAILED: ["GENERATING", "READY_FOR_REVIEW", "NEEDS_INFORMATION"],
  PUBLISH_FAILED: ["PUBLISHING", "SCHEDULED", "READY_FOR_REVIEW"],
  SCHEDULE_FAILED: ["SCHEDULED", "READY_FOR_REVIEW"],
};

export class IllegalTransitionError extends Error {
  constructor(from: CampaignStatus, to: CampaignStatus) {
    super(`Illegal campaign transition: ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Strict transition; throws on illegal moves (never READY_FOR_REVIEW → PUBLISHED). */
export function transition(from: CampaignStatus, to: CampaignStatus): CampaignStatus {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
  return to;
}

/** Direct publish is only possible after an approval exists (checked by caller). */
export function canPublish(status: CampaignStatus): boolean {
  return status === "APPROVED" || status === "SCHEDULED" || status === "PUBLISHING";
}

/** Any content edit after approval invalidates the approval (spec Section 25). */
export function invalidatesApproval(status: CampaignStatus): boolean {
  return (
    status === "APPROVED" ||
    status === "SCHEDULED" ||
    status === "PUBLISHING" ||
    status === "PUBLISH_FAILED" ||
    status === "SCHEDULE_FAILED"
  );
}

export const STATUS_META: Record<CampaignStatus, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  NEEDS_INFORMATION: { label: "Needs Information", tone: "warning" },
  GENERATING: { label: "Generating", tone: "info" },
  READY_FOR_REVIEW: { label: "Ready for Review", tone: "info" },
  CHANGES_REQUESTED: { label: "Changes Requested", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  PUBLISHING: { label: "Publishing", tone: "info" },
  PUBLISHED: { label: "Published", tone: "success" },
  GENERATION_FAILED: { label: "Generation Failed", tone: "danger" },
  PUBLISH_FAILED: { label: "Publish Failed", tone: "danger" },
  SCHEDULE_FAILED: { label: "Schedule Failed", tone: "danger" },
};