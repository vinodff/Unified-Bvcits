import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  composeBlogImage,
  hasUniformGutter,
  HERO_SPEC,
  photoPool,
  pickPhoto,
  PROBE,
  SECTION_SPEC,
} from "./image-agent";

const LOGO_FILE = path.join(process.cwd(), "public", "assets", "logos", "cropped-logo.png");

const BASE = {
  title: "How to Prepare for Campus Placements Without Losing a Semester",
  tagline: "BVCITS · Amalapuram, Konaseema",
  eyebrow: "Career & Placements",
};

/**
 * Average brightness of a crop, 0–255. The crest sits on a near-white plate in
 * the top-left corner, so that corner is dramatically brighter than the same
 * corner of an image composed without it. That is the cheapest honest way to
 * assert "the logo is actually in the pixels" without pixel-perfect fixtures.
 */
async function cornerBrightness(bytes: Buffer, spec: { width: number; height: number }): Promise<number> {
  const size = Math.round(spec.height * 0.2);
  const { data } = await sharp(bytes)
    .extract({ left: 0, top: 0, width: size, height: size })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let total = 0;
  for (const v of data) total += v;
  return total / data.length;
}

describe("blog image composition", () => {
  it("has a readable college crest to composite", async () => {
    const meta = await sharp(await fs.readFile(LOGO_FILE)).metadata();
    expect((meta.width ?? 0)).toBeGreaterThan(64);
    expect(meta.hasAlpha).toBe(true);
  });

  it("produces a hero at the exact spec dimensions", async () => {
    const { bytes } = await composeBlogImage({ spec: HERO_SPEC, photo: null, ...BASE });
    const meta = await sharp(bytes).metadata();
    expect(meta.width).toBe(HERO_SPEC.width);
    expect(meta.height).toBe(HERO_SPEC.height);
    expect(meta.format).toBe("jpeg");
  });

  it("reports the crest as composited", async () => {
    const { hasLogo } = await composeBlogImage({ spec: HERO_SPEC, photo: null, ...BASE });
    expect(hasLogo).toBe(true);
  });

  it("puts the crest plate in the top-left corner", async () => {
    const { bytes } = await composeBlogImage({ spec: HERO_SPEC, photo: null, ...BASE });
    // Brand-card background is near-black; the plate is near-white.
    expect(await cornerBrightness(bytes, HERO_SPEC)).toBeGreaterThan(60);
  });

  it("composes a section image at its own smaller spec", async () => {
    const { bytes, hasLogo } = await composeBlogImage({ spec: SECTION_SPEC, photo: null, ...BASE });
    const meta = await sharp(bytes).metadata();
    expect(meta.width).toBe(SECTION_SPEC.width);
    expect(meta.height).toBe(SECTION_SPEC.height);
    expect(hasLogo).toBe(true);
  });

  it("still carries the crest when composed over a real campus photograph", async () => {
    const pool = await photoPool();
    // The repo ships the campus library, but skip rather than fail if a
    // checkout does not — the assertion above already covers the crest itself.
    if (!pool.length) return;
    const photo = pickPhoto(pool, "test-slug", 0);
    const { bytes, hasLogo } = await composeBlogImage({ spec: HERO_SPEC, photo, ...BASE });
    expect(hasLogo).toBe(true);
    expect(await cornerBrightness(bytes, HERO_SPEC)).toBeGreaterThan(60);
    expect((await sharp(bytes).metadata()).width).toBe(HERO_SPEC.width);
  }, 60_000);

  it("picks the same photo for the same seed and a different one for another", async () => {
    const pool = await photoPool();
    if (pool.length < 2) return;
    expect(pickPhoto(pool, "slug-a", 0)?.file).toBe(pickPhoto(pool, "slug-a", 0)?.file);
    const distinct = new Set([
      pickPhoto(pool, "slug-a", 0)?.file,
      pickPhoto(pool, "slug-a", 1)?.file,
      pickPhoto(pool, "slug-a", 2)?.file,
    ]);
    expect(distinct.size).toBeGreaterThan(1);
    // The pool scan reads and downsamples ~300 files on first call, so these
    // tests need well over vitest's 5s default.
  }, 60_000);
});

describe("collage detection", () => {
  /** Pseudo-photograph: varied everywhere, no flat band. */
  function noisy(): Uint8Array {
    const g = new Uint8Array(PROBE * PROBE);
    for (let i = 0; i < g.length; i++) g[i] = (i * 37 + ((i / PROBE) | 0) * 91) % 256;
    return g;
  }

  it("accepts an image with no flat band", () => {
    expect(hasUniformGutter(noisy())).toBe(false);
  });

  it("rejects a sheet with a white horizontal gutter", () => {
    const g = noisy();
    const row = Math.round(PROBE * 0.5);
    for (let x = 0; x < PROBE; x++) g[row * PROBE + x] = 250;
    expect(hasUniformGutter(g)).toBe(true);
  });

  it("rejects a sheet with a white vertical gutter", () => {
    const g = noisy();
    const col = Math.round(PROBE * 0.5);
    for (let y = 0; y < PROBE; y++) g[y * PROBE + col] = 246;
    expect(hasUniformGutter(g)).toBe(true);
  });

  it("ignores a bright band at the very top — that is a sky, not a gutter", () => {
    const g = noisy();
    for (let x = 0; x < PROBE; x++) g[2 * PROBE + x] = 252;
    expect(hasUniformGutter(g)).toBe(false);
  });

  it("does not treat a flat DARK band as a gutter", () => {
    const g = noisy();
    const row = Math.round(PROBE * 0.5);
    for (let x = 0; x < PROBE; x++) g[row * PROBE + x] = 20;
    expect(hasUniformGutter(g)).toBe(false);
  });

  it("keeps composite report sheets out of the live photo pool", async () => {
    const pool = await photoPool();
    if (!pool.length) return;
    // Every survivor must pass the same check the pool applied.
    for (const c of pool.slice(0, 25)) {
      const { data } = await sharp(c.file)
        .resize(PROBE, PROBE, { fit: "fill" })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(hasUniformGutter(data)).toBe(false);
    }
  }, 60_000);
});
