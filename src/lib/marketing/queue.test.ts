import { describe, it, expect } from "vitest";
import { backoff, jobIdempotencyKey } from "./queue";

describe("publish queue backoff", () => {
  it("doubles from 30s per retry", () => {
    expect(backoff(0)).toBe(30_000);
    expect(backoff(1)).toBe(60_000);
    expect(backoff(2)).toBe(120_000);
    expect(backoff(3)).toBe(240_000);
  });

  it("caps at 1 hour", () => {
    expect(backoff(7)).toBe(3_600_000);
    expect(backoff(10)).toBe(3_600_000);
  });

  it("idempotency keys are unique per campaign/platform/version", () => {
    const a = jobIdempotencyKey("c1", "instagram", 1);
    const b = jobIdempotencyKey("c1", "instagram", 2);
    const c = jobIdempotencyKey("c1", "facebook", 1);
    const d = jobIdempotencyKey("c2", "instagram", 1);
    expect(new Set([a, b, c, d]).size).toBe(4);
    expect(jobIdempotencyKey("c1", "instagram", 1)).toBe(a);
  });
});