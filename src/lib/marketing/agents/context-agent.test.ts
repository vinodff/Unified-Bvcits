import { describe, it, expect } from "vitest";
import { extractFactsFromMessage } from "./context-agent";
import type { CampaignFact } from "../domain";

const byField = (facts: CampaignFact[]) => Object.fromEntries(facts.map((f) => [f.field, f])) as Record<string, CampaignFact>;

describe("fact extraction", () => {
  it("extracts winners from 'Winners: Team A (CSE), Team B (ECE).'", () => {
    const { facts } = extractFactsFromMessage("Winners: Team Alpha (CSE), Team Beta (ECE).", []);
    const f = byField(facts).winners;
    expect(f).toBeTruthy();
    expect(f.value).toEqual(["team alpha (cse)", "team beta (ece)"]);
  });

  it("extracts winners from 'winners were ...'", () => {
    const { facts } = extractFactsFromMessage("The winners were Team Rocket and Team Sloth.", []);
    expect(byField(facts).winners.value).toContain("team rocket");
  });

  it("extracts winners from 'X won first place'", () => {
    const { facts } = extractFactsFromMessage("Team Electro won first place at the hackathon.", []);
    expect(byField(facts).winners.value).toEqual(["team electro"]);
  });

  it("extracts winners from 'winning team was X'", () => {
    const { facts } = extractFactsFromMessage("The winning team was Code Wizards.", []);
    expect(byField(facts).winners.value).toEqual(["code wizards"]);
  });

  it("does not invent a winner when none is mentioned", () => {
    const { facts, answeredFields } = extractFactsFromMessage(
      "BVCITS conducted a technical fest last week with 200 participants.",
      []
    );
    expect(answeredFields).not.toContain("winners");
    expect(facts.find((f) => f.field === "winners")).toBeUndefined();
  });

  it("extracts title from quotes and 'called X'", () => {
    const quoted = extractFactsFromMessage('The event "National Hackathon 2026" starts tomorrow.', []);
    expect(byField(quoted.facts).title.value).toBe("national hackathon 2026");
    const called = extractFactsFromMessage("We hosted an event called Code Quest.", []);
    expect(byField(called.facts).title.value).toBe("Code Quest");
  });

  it("extracts date, venue, departments, participants", () => {
    const { facts } = extractFactsFromMessage(
      "The hackathon was held at the Seminar Hall on 12-08-2026, organized by CSE, with 250 participants.",
      []
    );
    const f = byField(facts);
    expect(f.date.value).toBe("2026-08-12");
    expect(f.venue.value).toBe("seminar hall");
    expect(f.departments.value).toContain("CSE");
    expect(f.participants.value).toMatch(/250/);
  });

  it("does not re-extract fields already present", () => {
    const existing: CampaignFact[] = [{ field: "winners", value: ["team alpha"], source: "admin", confidence: 1, verified: true }];
    const { facts, answeredFields } = extractFactsFromMessage("Winners: Team Gamma.", existing);
    expect(answeredFields).not.toContain("winners");
    expect(facts.find((f) => f.field === "winners")).toBeUndefined();
  });

  it("extracts chief guest with honorific", () => {
    const { facts } = extractFactsFromMessage("The chief guest was Dr. Ramesh Kumar.", []);
    expect(byField(facts).chiefGuest.value).toBe("ramesh kumar");
  });
});