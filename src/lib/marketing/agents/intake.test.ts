import { describe, it, expect } from "vitest";
import {
  INTAKE_BRIEF_KEY,
  SKIPPED_FIELDS_KEY,
  buildIntakeScript,
  intakeState,
  photosRequired,
} from "./intake";
import type { CampaignFact } from "../domain";

const f = (field: string, value: CampaignFact["value"]): CampaignFact => ({
  field,
  value,
  source: "admin",
  confidence: 1,
  verified: true,
});

const daysFromNow = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const brief = f(INTAKE_BRIEF_KEY, "We ran a hackathon in CSE with 50 students.");

describe("intake phases", () => {
  it("opens on the describe phase before any brief is given", () => {
    const state = intakeState([], "event");
    expect(state.phase).toBe("describe");
  });

  it("moves to gap-filling once a brief exists", () => {
    const state = intakeState([brief, f("title", "Innovate 2026")], "event");
    expect(state.phase).toBe("gaps");
    // date is the outstanding required field for an event
    expect(state.step?.field).toBe("date");
    expect(state.missingRequired).toContain("date");
  });

  it("asks only about what the brief did not already answer", () => {
    const answered = [brief, f("title", "Innovate 2026"), f("date", daysFromNow(-3))];
    const state = intakeState(answered, "event");
    // title and date are satisfied, so neither may be re-asked
    expect(state.missingRequired).toEqual([]);
    expect(state.step?.field).not.toBe("title");
    expect(state.step?.field).not.toBe("date");
  });

  it("reaches the confirm phase when every question is answered or skipped", () => {
    const script = buildIntakeScript("event", []);
    const facts = [
      brief,
      ...script.filter((s) => s.field !== "photos").map((s) => f(s.field, "provided")),
      f("date", daysFromNow(-3)),
    ];
    const state = intakeState(facts, "event", 2);
    expect(state.step).toBeNull();
    expect(state.phase).toBe("confirm");
    expect(state.canGenerate).toBe(true);
  });
});

describe("photo gate", () => {
  it("requires photos for an event that has already happened", () => {
    const facts = [brief, f("title", "Innovate 2026"), f("date", daysFromNow(-3))];
    expect(photosRequired("event", facts)).toBe(true);

    const state = intakeState(facts, "event", 0);
    expect(state.photosRequired).toBe(true);
    expect(state.canGenerate).toBe(false);
  });

  it("unblocks generation once a photograph is uploaded", () => {
    const facts = [brief, f("title", "Innovate 2026"), f("date", daysFromNow(-3))];
    expect(intakeState(facts, "event", 1).canGenerate).toBe(true);
  });

  it("waives photos for an event still in the future", () => {
    const facts = [brief, f("title", "Innovate 2026"), f("date", daysFromNow(30))];
    expect(photosRequired("event", facts)).toBe(false);
    expect(intakeState(facts, "event", 0).canGenerate).toBe(true);
  });

  it("waives photos for announcement types that cannot have any", () => {
    const facts = [brief, f("title", "Admissions Open 2026-27")];
    expect(photosRequired("admission_announcement", facts)).toBe(false);
    expect(intakeState(facts, "admission_announcement", 0).canGenerate).toBe(true);
  });

  // Skipping is how an admin dismisses an optional question. It must not be a
  // way around a hard gate, or the gate is decorative.
  it("does not let a skip bypass a required photo gate", () => {
    const facts = [
      brief,
      f("title", "Innovate 2026"),
      f("date", daysFromNow(-3)),
      f(SKIPPED_FIELDS_KEY, ["photos"]),
    ];
    expect(intakeState(facts, "event", 0).canGenerate).toBe(false);
  });
});

describe("intake script shape", () => {
  it("asks competitive campaign types about the prize breakdown", () => {
    const fields = buildIntakeScript("hackathon", []).map((s) => s.field);
    expect(fields).toContain("prizes");
    expect(fields.indexOf("prizes")).toBeGreaterThan(fields.indexOf("winners"));
  });

  it("does not ask a workshop about prizes", () => {
    expect(buildIntakeScript("workshop", []).map((s) => s.field)).not.toContain("prizes");
  });

  it("always ends on the photo step", () => {
    const fields = buildIntakeScript("event", []).map((s) => s.field);
    expect(fields[fields.length - 1]).toBe("photos");
  });
});
