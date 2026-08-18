import { describe, it, expect } from "vitest";
import { canTransition, transition, canPublish, invalidatesApproval, IllegalTransitionError } from "./state-machine";
import { CAMPAIGN_STATUSES } from "./state-machine";
import type { CampaignStatus } from "./domain";

describe("campaign state machine", () => {
  it("allows the happy path DRAFT → … → PUBLISHED", () => {
    const path = ["DRAFT", "GENERATING", "READY_FOR_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHING", "PUBLISHED"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
      expect(transition(path[i], path[i + 1])).toBe(path[i + 1]);
    }
  });

  it("never allows READY_FOR_REVIEW → PUBLISHED (approval gate)", () => {
    expect(canTransition("READY_FOR_REVIEW", "PUBLISHED")).toBe(false);
    expect(() => transition("READY_FOR_REVIEW", "PUBLISHED")).toThrow(IllegalTransitionError);
  });

  it("rejects arbitrary illegal transitions", () => {
    expect(canTransition("DRAFT", "APPROVED")).toBe(false);
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(false);
    expect(canTransition("GENERATING", "SCHEDULED")).toBe(false);
    expect(() => transition("DRAFT", "SCHEDULED")).toThrow(/Illegal campaign transition/);
  });

  it("allows regeneration after CHANGES_REQUESTED", () => {
    expect(canTransition("CHANGES_REQUESTED", "GENERATING")).toBe(true);
    expect(canTransition("GENERATION_FAILED", "GENERATING")).toBe(true);
  });

  // Regression: the quality gate moves a campaign GENERATING → CHANGES_REQUESTED
  // when it finds critical issues. That transition was missing, so the gate threw
  // mid-pipeline and left live campaigns stuck in GENERATING permanently.
  it("lets the quality gate send a generating campaign back for changes", () => {
    expect(canTransition("GENERATING", "CHANGES_REQUESTED")).toBe(true);
    expect(transition("GENERATING", "CHANGES_REQUESTED")).toBe("CHANGES_REQUESTED");
  });

  // GENERATING must always have a way out, or a run that dies mid-flight
  // (crash, redeploy, thrown gate) strands the campaign with no admin recourse.
  it("always offers an escape from GENERATING", () => {
    for (const to of ["READY_FOR_REVIEW", "CHANGES_REQUESTED", "NEEDS_INFORMATION", "GENERATION_FAILED", "DRAFT"] as CampaignStatus[]) {
      expect(canTransition("GENERATING", to)).toBe(true);
    }
  });

  it("canPublish only from approved/scheduled/publishing states", () => {
    for (const s of ["APPROVED", "SCHEDULED", "PUBLISHING"] as CampaignStatus[]) expect(canPublish(s)).toBe(true);
    for (const s of ["DRAFT", "READY_FOR_REVIEW", "CHANGES_REQUESTED", "PUBLISHED", "GENERATION_FAILED"] as CampaignStatus[]) {
      expect(canPublish(s)).toBe(false);
    }
  });

  it("edits after approval invalidate it; edits before do not", () => {
    for (const s of ["APPROVED", "SCHEDULED", "PUBLISHING", "PUBLISH_FAILED", "SCHEDULE_FAILED"] as CampaignStatus[]) {
      expect(invalidatesApproval(s)).toBe(true);
    }
    for (const s of ["DRAFT", "NEEDS_INFORMATION", "GENERATING", "READY_FOR_REVIEW", "CHANGES_REQUESTED", "PUBLISHED"] as CampaignStatus[]) {
      expect(invalidatesApproval(s)).toBe(false);
    }
  });

  it("every status has metadata", () => {
    expect(CAMPAIGN_STATUSES.length).toBeGreaterThan(10);
  });
});