import { describe, it, expect } from "vitest";
import { runQualityCheck, verdictSummary } from "./quality-agent";
import type { CampaignFact, ContentVersion, FactValue, Platform } from "../domain";

const store = {
  getBrand: async () => ({
    shortName: "BVCITS",
    collegeName: "Bonam Venkata Chalamayya Institute of Technology & Science",
    departments: ["CSE", "ECE", "EEE", "MECH", "CIVIL", "MBA", "Science & Humanities"],
    contact: { phone: "+91 99854 22678", email: "principal@bvcits.edu.in" },
  }),
  getQuality: async () => null,
} as unknown as import("../storage").StorageProvider;

const fact = (field: string, value: FactValue): CampaignFact => ({ field, value, source: "admin", confidence: 1, verified: true });

const version = (platform: Platform, body: string): ContentVersion => ({
  id: `cv-${platform}`,
  campaignId: "camp_test",
  platform,
  version: 1,
  contentType: "post",
  body,
  claims: [],
  status: "draft",
  createdBy: "writing-agent",
  createdAt: new Date().toISOString(),
});

describe("quality agent", () => {
  it("passes when required facts exist and content is clean", async () => {
    const facts = [fact("title", "National Hackathon 2026"), fact("date", "2026-08-12"), fact("winners", ["Team Alpha"])];
    const content = [
      version("instagram", "National Hackathon 2026 at BVCITS #BVCITS #Hackathon"),
      version("website", "BVCITS hosted National Hackathon 2026."),
    ];
    const score = await runQualityCheck("camp_test", 1, facts, content, store, "hackathon");
    expect(score.verdict).toBe("pass");
    expect(score.overall).toBeGreaterThan(0);
  });

  it("fails when a required fact is missing", async () => {
    const facts = [fact("title", "National Hackathon 2026"), fact("date", "2026-08-12")];
    const content = [version("website", "BVCITS hosted National Hackathon 2026.")];
    const score = await runQualityCheck("camp_test", 1, facts, content, store, "hackathon");
    expect(score.verdict).toBe("needs_correction");
    expect(score.issues.some((i) => i.severity === "critical" && i.message.includes("winners"))).toBe(true);
  });

  it("fails on contradictory facts", async () => {
    const facts = [fact("date", "2026-08-12"), fact("date", "2026-09-01")];
    const content = [version("website", "BVCITS hosted an event.")];
    const score = await runQualityCheck("camp_test", 1, facts, content, store, "award");
    expect(score.verdict).toBe("needs_correction");
    expect(score.issues.some((i) => i.message.includes("Contradictory"))).toBe(true);
  });

  it("flags over-limit instagram copy as critical", async () => {
    const facts = [fact("title", "T"), fact("date", "2026-08-12"), fact("winners", ["A"])];
    const long = "BVCITS hosted an event. " + "x".repeat(2250);
    const content = [version("instagram", long), version("website", "BVCITS hosted an event.")];
    const score = await runQualityCheck("camp_test", 1, facts, content, store, "hackathon");
    expect(score.verdict).toBe("needs_correction");
    expect(score.issues.some((i) => i.message.includes("exceeds the 2200 limit"))).toBe(true);
  });

  it("flags non-official phone numbers", async () => {
    const facts = [fact("title", "T"), fact("date", "2026-08-12"), fact("winners", ["A"])];
    const content = [version("website", "BVCITS event — call 9876543210 for details.")];
    const score = await runQualityCheck("camp_test", 1, facts, content, store, "hackathon");
    expect(score.issues.some((i) => i.message.includes("not the official BVCITS contact"))).toBe(true);
  });

  it("verdictSummary explains corrections", async () => {
    const facts = [fact("title", "T")];
    const content = [version("website", "BVCITS hosted an event.")];
    const score = await runQualityCheck("camp_test", 1, facts, content, store, "hackathon");
    const summary = verdictSummary(score);
    expect(summary).toContain("requires correction");
    expect(summary).toContain("date");
  });

  const clean = [fact("title", "Dancing Event"), fact("date", "2026-08-16"), fact("winners", ["Team Alpha"])];

  // Regression: the grounding check flagged every word capitalised by grammar.
  // A real run produced 37 warnings for words like "This" and "August" and
  // floored an otherwise good campaign to 0/100.
  it("does not flag words capitalised by sentence position or heading", async () => {
    const body = [
      "# Dancing Event",
      "",
      "This was a celebration of talent. August was the month.",
      "- Excellence throughout the evening",
    ].join("\n");
    const score = await runQualityCheck("camp_test", 1, clean, [version("website", body)], store, "event");
    const flagged = score.issues.filter((i) => i.message.includes("capitalized term"));
    expect(flagged).toEqual([]);
  });

  // Regression: social copy opens lines with an emoji and bold markers, e.g.
  // "🎉 **Celebrating Talent at BVCITS!**". Those made the genuinely first word
  // look mid-sentence, so it was flagged as a possibly-invented name.
  it("ignores emoji and emphasis markers when judging sentence position", async () => {
    const body = "🎉 **Celebrating Talent and Energy at BVCITS!** 🎉\n\n[Visit our website](https://bvcits.edu.in)";
    const score = await runQualityCheck("camp_test", 1, clean, [version("facebook", body)], store, "event");
    const flagged = score.issues.filter((i) => i.message.includes("capitalized term"));
    expect(flagged).toEqual([]);
  });

  it("still flags an unexplained capitalised term mid-sentence", async () => {
    const score = await runQualityCheck(
      "camp_test",
      1,
      clean,
      [version("website", "The event was sponsored by Zephyrantes Industries.")],
      store,
      "event"
    );
    expect(score.issues.some((i) => i.message.includes("Zephyrantes"))).toBe(true);
  });

  it("treats an invented guest name after an honorific as critical", async () => {
    const score = await runQualityCheck(
      "camp_test",
      1,
      clean,
      [version("website", "The chief guest was Dr. Fabricated.")],
      store,
      "event"
    );
    expect(score.issues.some((i) => i.severity === "critical" && i.message.includes("Fabricated"))).toBe(true);
  });

  // Regression: warnings were uncapped while the verdict looked only at
  // criticals, so a campaign could report "passed (0/100)".
  it("never reports a passing verdict with a failing score", async () => {
    const noisy = Array.from({ length: 40 }, (_, i) => `Sponsor Zephyrantes${i} joined us here.`).join(" ");
    const score = await runQualityCheck("camp_test", 1, clean, [version("website", noisy)], store, "event");
    expect(score.overall).toBeGreaterThanOrEqual(0);
    if (score.verdict === "pass") expect(score.overall).toBeGreaterThanOrEqual(60);
    expect(verdictSummary(score)).not.toMatch(/passed \(0\/100\)/);
  });
});