import { describe, it, expect } from "vitest";
import { parseLlmJson, deepFind, asStringList, asStringMap, asBoolean } from "./llm-json";
import { normalizeStrategy, fallbackStrategy } from "../agents/strategy-agent";

describe("parseLlmJson", () => {
  it("parses a plain object", () => {
    expect(parseLlmJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("unwraps a markdown code fence", () => {
    expect(parseLlmJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseLlmJson("```\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });

  it("recovers an object buried after explanatory prose", () => {
    expect(parseLlmJson('Sure! Here is the JSON:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 });
  });

  it("returns null for output with no object in it", () => {
    expect(parseLlmJson("I cannot help with that.")).toBeNull();
    expect(parseLlmJson("")).toBeNull();
  });
});

describe("deepFind", () => {
  it("finds a key nested under a wrapper", () => {
    expect(deepFind({ campaign_strategy: { objective: "Grow" } }, ["objective"])).toBe("Grow");
  });

  it("matches across naming conventions", () => {
    expect(deepFind({ platform_strategy: { instagram: "x" } }, ["platformStrategy"])).toEqual({ instagram: "x" });
  });

  it("prefers a top-level match over a deeper one", () => {
    const found = deepFind({ tone: "top", nested: { tone: "deep" } }, ["tone"]);
    expect(found).toBe("top");
  });

  it("survives a circular object", () => {
    const a: Record<string, unknown> = { name: "x" };
    a.self = a;
    expect(() => deepFind(a, ["missing"])).not.toThrow();
  });
});

describe("coercion helpers", () => {
  it("wraps a lone string into a list", () => {
    expect(asStringList("just one")).toEqual(["just one"]);
  });

  it("rejects an empty list rather than accepting it", () => {
    expect(asStringList([])).toBeUndefined();
    expect(asStringMap({})).toBeUndefined();
  });

  it("reads booleans written as words", () => {
    expect(asBoolean("yes")).toBe(true);
    expect(asBoolean("false")).toBe(false);
    expect(asBoolean("maybe")).toBeUndefined();
  });
});

describe("strategy normalisation", () => {
  const fallback = fallbackStrategy({ title: "Dancing Event" }, "event");

  // This is the actual response shape Gemini returned for camp_msv9ao5t_93ysw5.
  // It parsed cleanly as JSON, so the old `as StrategyOutput` cast let it through
  // and the writing agent died on `strategy.platformStrategy["instagram"]`.
  const geminiShape = {
    campaign_strategy: {
      objective: "Showcase student talent, creativity, and confidence through a departmental dance event.",
      campaign_id: "camp_msv9ao5t_93ysw5",
      event_details: { date: "2026-08-16", title: "Dancing Event", venue: "CSE block, BVCITS" },
      key_messaging: { recognition: "Team Alpha was awarded the 1st prize." },
    },
  };

  it("recovers the objective from a wrapper key", () => {
    const { strategy } = normalizeStrategy(geminiShape, fallback);
    expect(strategy.objective).toContain("Showcase student talent");
  });

  it("always produces a usable platformStrategy, even when the model omits it", () => {
    const { strategy } = normalizeStrategy(geminiShape, fallback);
    expect(strategy.platformStrategy).toBeTruthy();
    // The exact expression that used to throw.
    expect(typeof strategy.platformStrategy["instagram"]).toBe("string");
  });

  it("reports the fields it had to repair", () => {
    const { repaired } = normalizeStrategy(geminiShape, fallback);
    expect(repaired).toContain("platformStrategy");
    expect(repaired).not.toContain("objective");
  });

  it("passes a well-formed response through untouched", () => {
    const clean = {
      objective: "Fill seats",
      audience: ["Parents"],
      primaryMessage: "Apply now",
      secondaryMessage: "Great outcomes",
      cta: "Apply",
      tone: "warm",
      contentTypes: ["post"],
      platformStrategy: { instagram: "visual" },
      recommendedTimes: { instagram: "19:00" },
      recommendBlog: false,
      recommendCarousel: true,
      multiplePosts: false,
    };
    const { strategy, repaired } = normalizeStrategy(clean, fallback);
    expect(repaired).toEqual([]);
    expect(strategy.objective).toBe("Fill seats");
    expect(strategy.recommendBlog).toBe(false);
  });

  it("falls back completely when the model returns nothing usable", () => {
    const { strategy, repaired } = normalizeStrategy({}, fallback);
    expect(repaired.length).toBeGreaterThan(5);
    expect(strategy.platformStrategy["instagram"]).toBeTruthy();
    expect(strategy.objective).toBe(fallback.objective);
  });
});
