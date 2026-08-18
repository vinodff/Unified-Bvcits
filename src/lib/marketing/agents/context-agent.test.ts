import { describe, it, expect } from "vitest";
import { extractFactsFromMessage } from "./context-agent";
import type { CampaignFact } from "../domain";

const byField = (facts: CampaignFact[]) => Object.fromEntries(facts.map((f) => [f.field, f])) as Record<string, CampaignFact>;

describe("fact extraction", () => {
  it("extracts winners from 'Winners: Team A (CSE), Team B (ECE).'", () => {
    const { facts } = extractFactsFromMessage("Winners: Team Alpha (CSE), Team Beta (ECE).", []);
    const f = byField(facts).winners;
    expect(f).toBeTruthy();
    expect(f.value).toEqual(["Team Alpha (CSE)", "Team Beta (ECE)"]);
  });

  it("extracts winners from 'winners were ...'", () => {
    const { facts } = extractFactsFromMessage("The winners were Team Rocket and Team Sloth.", []);
    expect(byField(facts).winners.value).toContain("Team Rocket");
  });

  it("extracts winners from 'X won first place'", () => {
    const { facts } = extractFactsFromMessage("Team Electro won first place at the hackathon.", []);
    expect(byField(facts).winners.value).toEqual(["Team Electro"]);
  });

  it("extracts winners from 'winning team was X'", () => {
    const { facts } = extractFactsFromMessage("The winning team was Code Wizards.", []);
    expect(byField(facts).winners.value).toEqual(["Code Wizards"]);
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
    expect(byField(quoted.facts).title.value).toBe("National Hackathon 2026");
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
    expect(f.venue.value).toBe("Seminar Hall");
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
    expect(byField(facts).chiefGuest.value).toBe("Ramesh Kumar");
  });

  // Regression: extraction used to capture from a lowercased copy of the message,
  // so every proper noun it pulled out was published in lowercase. These values
  // go straight into marketing copy — "dr. ramesh kumar" is not shippable.
  it("preserves the original casing of extracted proper nouns", () => {
    const { facts } = extractFactsFromMessage(
      "The chief guest was Dr. Anitha Rao. Winners: Team NovaCore. Held at APJ Abdul Kalam Auditorium.",
      []
    );
    const f = byField(facts);
    expect(f.chiefGuest.value).toBe("Anitha Rao");
    expect(f.winners.value).toEqual(["Team NovaCore"]);
    expect(f.venue.value).toBe("APJ Abdul Kalam Auditorium");
  });

  it("extracts a prize breakdown by position", () => {
    const { facts } = extractFactsFromMessage(
      "First prize Team Alpha, second prize Team Beta, third prize Team Gamma.",
      []
    );
    expect(byField(facts).prizes.value).toEqual([
      "1st prize: Team Alpha",
      "2nd prize: Team Beta",
      "3rd prize: Team Gamma",
    ]);
  });

  it("extracts cash prize amounts", () => {
    const { facts } = extractFactsFromMessage("The first prize is Rs 50000 and second prize is Rs 25000.", []);
    const prizes = byField(facts).prizes.value as string[];
    expect(prizes[0]).toContain("50000");
    expect(prizes[1]).toContain("25000");
  });

  // Regression: one sentence was landing in both `statistics` and `description`,
  // so the same line was published twice in the generated copy.
  it("does not store the same sentence under two different facts", () => {
    const { facts } = extractFactsFromMessage(
      "Around 50 students joined and we invited some guests from outside.",
      []
    );
    const values = facts.map((f) => String(f.value));
    expect(new Set(values).size).toBe(values.length);
  });

  it("does not invent prizes when none are mentioned", () => {
    const { facts } = extractFactsFromMessage("A workshop on cloud computing was conducted.", []);
    expect(facts.find((f) => f.field === "prizes")).toBeUndefined();
  });
});
