// Creative Engine (spec Sections 12–15, 59): composes REAL uploaded photographs
// with the BVCITS brand system into platform-specific promotional graphics.
// Real photos are the source assets; AI is used for layout, crop, background
// treatment, typography and compositing — never to fabricate people or winners.

import { promises as fs } from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { DEFAULT_BRAND } from "../brand";
import type { CampaignAsset, CampaignFact } from "../domain";

export type CreativeVariant = "hero" | "collage" | "split";

export interface PlatformSpec {
  width: number;
  height: number;
  titleSize: number;
  label: string;
}

export const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  instagram: { width: 1080, height: 1350, titleSize: 64, label: "Instagram Portrait 1080 × 1350" },
  instagram_square: { width: 1080, height: 1080, titleSize: 56, label: "Instagram Square 1080 × 1080" },
  story: { width: 1080, height: 1920, titleSize: 76, label: "Story 1080 × 1920" },
  facebook: { width: 1200, height: 630, titleSize: 72, label: "Facebook 1200 × 630" },
  linkedin: { width: 1200, height: 627, titleSize: 72, label: "LinkedIn 1200 × 627" },
  website: { width: 1600, height: 900, titleSize: 88, label: "Website Hero 1600 × 900" },
  whatsapp: { width: 800, height: 800, titleSize: 44, label: "WhatsApp 800 × 800" },
};

export interface CreativeOptions {
  variant: CreativeVariant;
  title?: string;
  tagline?: string;
  style?: "dark" | "light";
  colors?: { black: string; gold: string; goldDark: string; ivory: string; white: string; charcoal: string; maroon: string };
  collegeName?: string;
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Greedy word wrap estimating glyph width ≈ 0.52 × font size. */
function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  const glyph = fontSize * 0.52;
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length * glyph > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/** Build the brand overlay SVG (gradient scrim + typography). No external fonts. */
export function buildOverlaySvg(opts: {
  width: number;
  height: number;
  titleSize: number;
  title: string;
  tagline: string;
  eyebrow: string;
  style: "dark" | "light";
  colors: CreativeOptions["colors"];
  collegeName: string;
}): string {
  const { width, height, titleSize, title, tagline, eyebrow, style } = opts;
  const colors = opts.colors ?? DEFAULT_BRAND.colors;
  const titleLines = wrapText(title, width * 0.86, titleSize);
  const lineHeight = Math.round(titleSize * 1.16);
  const taglineLines = wrapText(tagline, width * 0.82, Math.round(titleSize * 0.42));

  if (style === "light") {
    const top = height - Math.round(height * 0.34);
    return [
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`,
      `<rect width="${width}" height="${height}" fill="${colors.ivory}"/>`,
      `<rect x="0" y="${top}" width="6" height="${height - top}" fill="${colors.gold}"/>`,
      `<text x="${width * 0.07}" y="${top + 46}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(titleSize * 0.3)}" font-weight="bold" letter-spacing="4" fill="${colors.goldDark}">${escXml(eyebrow.toUpperCase())}</text>`,
      titleLines.map((l, i) => `<text x="${width * 0.07}" y="${top + 108 + i * lineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="800" fill="${colors.black}">${escXml(l)}</text>`).join(""),
      taglineLines.map((l, i) => `<text x="${width * 0.07}" y="${top + 128 + titleLines.length * lineHeight + i * Math.round(titleSize * 0.55)}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(titleSize * 0.42)}" fill="${colors.charcoal}">${escXml(l)}</text>`).join(""),
      `<text x="${width * 0.07}" y="${height - 40}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(titleSize * 0.26)}" font-weight="bold" fill="${colors.black}">${escXml(opts.collegeName.toUpperCase())}</text>`,
      `<circle cx="${width - 90}" cy="${height - 46}" r="7" fill="${colors.gold}"/>`,
      `</svg>`,
    ].join("");
  }

  // dark style — photo scrim at bottom, text on top
  const scrimTop = height - Math.round(height * 0.42);
  const textY = Math.round(scrimTop + 40);
  return [
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`,
    `<defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${colors.black}" stop-opacity="0"/>`,
    `<stop offset="0.55" stop-color="${colors.black}" stop-opacity="0.55"/>`,
    `<stop offset="1" stop-color="${colors.black}" stop-opacity="0.96"/>`,
    `</linearGradient></defs>`,
    `<rect x="0" y="${scrimTop}" width="${width}" height="${height - scrimTop}" fill="url(#scrim)"/>`,
    `<rect x="0" y="${scrimTop}" width="6" height="10" fill="${colors.gold}"/>`,
    `<text x="${width * 0.06}" y="${textY}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(titleSize * 0.3)}" font-weight="bold" letter-spacing="4" fill="${colors.gold}">${escXml(eyebrow.toUpperCase())}</text>`,
    titleLines.map((l, i) => `<text x="${width * 0.06}" y="${textY + 62 + i * lineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="800" fill="${colors.white}">${escXml(l)}</text>`).join(""),
    taglineLines.map((l, i) => `<text x="${width * 0.06}" y="${textY + 84 + titleLines.length * lineHeight + i * Math.round(titleSize * 0.55)}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(titleSize * 0.42)}" fill="#E8E6DF">${escXml(l)}</text>`).join(""),
    `<text x="${width * 0.06}" y="${height - 36}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(titleSize * 0.26)}" font-weight="bold" letter-spacing="2" fill="${colors.gold}">${escXml(opts.collegeName.toUpperCase())}</text>`,
    `<text x="${width - width * 0.06}" y="${height - 36}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(titleSize * 0.24)}" fill="#C9C7C0">Counselling Code: BVTS</text>`,
    `</svg>`,
  ].join("");
}

interface Slot {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Layout plan per variant. */
function planSlots(w: number, h: number, variant: CreativeVariant, photoCount: number): Slot[] {
  if (variant === "collage" && photoCount >= 3) {
    const pad = Math.round(w * 0.02);
    const midY = Math.round(h * 0.5);
    const topH = midY - pad / 2;
    const botH = h - midY - pad / 2;
    return [
      { left: 0, top: 0, width: w, height: topH },
      { left: 0, top: midY + pad / 2, width: Math.round(w / 2 - pad / 2), height: botH },
      { left: Math.round(w / 2 + pad / 2), top: midY + pad / 2, width: Math.round(w / 2 - pad / 2), height: botH },
    ];
  }
  if (variant === "split" && photoCount >= 1) {
    const photoW = Math.round(w * 0.55);
    return [{ left: 0, top: 0, width: photoW, height: h }];
  }
  return [{ left: 0, top: 0, width: w, height: h }];
}

/** Pick the best source photos (admin-tagged group/winners/trophy photos first). */
export function pickPhotos(assets: CampaignAsset[], count: number): CampaignAsset[] {
  const score = (a: CampaignAsset): number => {
    const tags = (a.metadata?.adminTags as string[] | undefined) ?? [];
    const obs = a.observations ?? [];
    const text = [...tags, ...obs].join(" ").toLowerCase();
    let s = 0;
    if (text.includes("winner") || text.includes("trophy") || text.includes("prize")) s += 5;
    if (text.includes("group") || text.includes("team")) s += 3;
    if (text.includes("banner") || text.includes("stage")) s += 2;
    return s;
  };
  return [...assets].sort((a, b) => score(b) - score(a)).slice(0, count);
}

/**
 * Compose one creative. Returns the output file path.
 */
export async function composeCreative(
  campaignId: string,
  platform: string,
  assets: CampaignAsset[],
  facts: CampaignFact[],
  opts: CreativeOptions,
  outDir: string
): Promise<{ file: string; width: number; height: number }> {
  const spec = PLATFORM_SPECS[platform];
  if (!spec) throw new Error(`Unknown platform spec: ${platform}`);
  const colors = opts.colors ?? DEFAULT_BRAND.colors;
  const collegeName = opts.collegeName ?? DEFAULT_BRAND.collegeName;
  const factMap = new Map(facts.map((f) => [f.field, f.value]));

  const title = opts.title ?? String(factMap.get("title") ?? "BVCITS Event");
  const date = String(factMap.get("date") ?? "");
  const venue = String(factMap.get("venue") ?? "");
  const type = String(factMap.get("type") ?? "event").replace(/_/g, " ");
  const tagline = opts.tagline ?? [date ? new Date(date).toDateString() : "", venue ? `Venue: ${venue}` : ""].filter(Boolean).join(" · ");

  const photos = pickPhotos(assets, opts.variant === "collage" ? 3 : 1);
  const slots = planSlots(spec.width, spec.height, opts.variant, photos.length);

  await fs.mkdir(path.dirname(outDir), { recursive: true });

  // 1. Base canvas
  const base = sharp({
    create: { width: spec.width, height: spec.height, channels: 3, background: opts.style === "light" ? colors.ivory : colors.black },
  });

  // 2. Compose photos
  const composites: OverlayOptions[] = [];
  for (let i = 0; i < photos.length && i < slots.length; i++) {
    const slot = slots[i];
    const photo = photos[i];
    const resized = await sharp(photo.originalFile)
      .rotate()
      .resize(slot.width, slot.height, { fit: "cover", position: "centre" })
      .jpeg({ quality: 88 })
      .toBuffer();
    composites.push({ input: resized, left: slot.left, top: slot.top });
  }

  // 3. Brand overlay
  const eyebrow = opts.style === "light" ? `${type} · ${collegeName.split(" ").slice(-2).join(" ")}` : type;
  const overlaySvg = buildOverlaySvg({
    width: spec.width,
    height: spec.height,
    titleSize: spec.titleSize,
    title,
    tagline: tagline || "BVC Institute of Technology & Science, Amalapuram",
    eyebrow,
    style: opts.style ?? "dark",
    colors,
    collegeName,
  });
  composites.push({ input: Buffer.from(overlaySvg), left: 0, top: 0 });

  await base
    .composite(composites)
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outDir);

  return { file: outDir, width: spec.width, height: spec.height };
}