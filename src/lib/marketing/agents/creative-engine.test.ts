import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { DEFAULT_BRAND } from "../brand";
import { buildOverlaySvg, composeCreative } from "./creative-engine";

describe("creative engine", () => {
  it("composes a dark hero creative from a real photo with brand overlay text", async () => {
    const dir = path.join(process.cwd(), ".data", "marketing", "media", "test-campaign");
    await fs.mkdir(dir, { recursive: true });
    const photo = path.join(dir, "photo.jpg");
    await sharp({
      create: { width: 1280, height: 960, channels: 3, background: { r: 90, g: 120, b: 150 } },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="1280" height="960" xmlns="http://www.w3.org/2000/svg"><rect x="120" y="200" width="500" height="140" rx="12" fill="#1E293B"/><text x="370" y="310" text-anchor="middle" font-family="Arial" font-size="72" fill="#FFFFFF">HACKATHON</text><rect x="660" y="480" width="420" height="120" rx="12" fill="#7A1717"/><text x="870" y="570" text-anchor="middle" font-family="Arial" font-size="56" fill="#FFFFFF">WINNERS</text></svg>'
          ),
          left: 0,
          top: 0,
        },
      ])
      .jpeg({ quality: 85 })
      .toFile(photo);

    const facts = [
      { field: "title", value: "National-Level Hackathon 2026" },
      { field: "type", value: "hackathon" },
      { field: "date", value: "2026-09-14" },
      { field: "venue", value: "BVCITS Seminar Hall" },
    ];
    const assets = [{ id: "as_1", originalFile: photo, metadata: { adminTags: ["winners"] } }];
    const out = path.join(dir, "instagram-hero-dark.jpg");

    const result = await composeCreative(
      "test-campaign",
      "instagram",
      assets as never,
      facts as never,
      { variant: "hero", style: "dark", colors: DEFAULT_BRAND.colors, collegeName: DEFAULT_BRAND.collegeName },
      out
    );

    const meta = await sharp(result.file).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
    const buf = await sharp(result.file).toBuffer();
    expect(buf.length).toBeGreaterThan(20_000);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("builds a dark overlay SVG with wrapped title and gold eyebrow", () => {
    const svg = buildOverlaySvg({
      width: 1080,
      height: 1350,
      titleSize: 64,
      title: "National-Level Hackathon 2026 Amalapuram",
      tagline: "Sep 14 · Venue: BVCITS Seminar Hall",
      eyebrow: "hackathon",
      style: "dark",
      colors: DEFAULT_BRAND.colors,
      collegeName: DEFAULT_BRAND.collegeName,
    });
    expect(svg).toContain("<text");
    expect(svg).toContain("#F5B800");
    expect(svg).toContain("BONAM VENKATA CHALAMAYYA INSTITUTE OF TECHNOLOGY &amp; SCIENCE");
    expect(svg).toContain("Counselling Code: BVTS");
  });
});