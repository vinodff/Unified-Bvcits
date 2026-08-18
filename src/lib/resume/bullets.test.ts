import { describe, expect, it } from "vitest";
import { reviewBullet, reviewBullets } from "./bullets";

describe("reviewBullet", () => {
  it("passes a bullet with a strong verb and a number", () => {
    expect(reviewBullet("Built a REST API that reduced response time by 40%").issues).toEqual([]);
  });

  it("flags a passive opener", () => {
    const result = reviewBullet("Responsible for maintaining the backend");
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining("passive phrase")]));
  });

  it("flags a missing action verb even without a passive opener", () => {
    const result = reviewBullet("Backend maintenance and bug fixes");
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining("action verb")]));
  });

  it("flags a bullet with no number", () => {
    const result = reviewBullet("Built a REST API for the internal team");
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining("no number")]));
  });

  it("skips an empty bullet without flagging it", () => {
    expect(reviewBullet("   ").issues).toEqual([]);
  });
});

describe("reviewBullets", () => {
  it("returns only bullets with issues", () => {
    const result = reviewBullets(["Built a REST API that reduced load time by 30%", "Worked on stuff"]);
    expect(result).toHaveLength(1);
    expect(result[0].bullet).toBe("Worked on stuff");
  });
});
