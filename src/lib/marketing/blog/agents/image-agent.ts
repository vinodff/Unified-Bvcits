// Blog Image Agent — produces the hero and in-body section graphics.
//
// EVERY article gets at least one image, and every image carries the college
// crest. Both are guarantees, not best effort: the hero has a photo-then-brand-
// card fallback chain here, and the quality gate refuses to publish a post
// without one (`missing_hero_image`).
//
// Source material is REAL BVCITS photography from public/assets/images (the
// scraped campus library), composed with the brand system by the same sharp
// pipeline the campaign creatives use. Nothing here generates a synthetic
// photograph: an AI-imagined "students in a lab" picture presented on a college
// blog is a fabricated depiction of a real place, and the project already
// treats that class of invention as a correctness bug (see the fabricated-HOD
// incident in docs).
//
// When no suitable photograph is available the fallback is a brand card —
// crest, wordmark and typography on brand black, plainly a graphic and claiming
// nothing about what it depicts.
//
// Output lands wherever it can actually be served from: Supabase Storage in
// production (the filesystem is read-only there), public/blog-media locally.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
// sharp ships as `export =` with a merged namespace, so the default import is
// a value binding only — `sharp.OverlayOptions` does not resolve as a type.
// The member types have to be imported by name.
import type { OverlayOptions } from "sharp";
import { getAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/client";
import { DEFAULT_BRAND } from "../../brand";
import type { BlogImage, BlogOutline, BlogTopic } from "../domain";
import { newId, nowIso } from "../domain";

const PHOTO_DIR = path.join(process.cwd(), "public", "assets", "images");
const LOCAL_OUT_DIR = path.join(process.cwd(), "public", "blog-media");
const BUCKET = "blog-media";

export const HERO_SPEC = { width: 1600, height: 900, titleSize: 74 };
export const SECTION_SPEC = { width: 1200, height: 675, titleSize: 52 };

/** Landscape, large enough not to look upscaled on a 1600px hero. */
const MIN_PHOTO_WIDTH = 900;
const MIN_ASPECT = 1.1;

interface Candidate {
  file: string;
  width: number;
  height: number;
}

let photoCache: Candidate[] | null = null;

/** Analysis grid for the collage detector — small enough to be effectively free. */
export const PROBE = 64;

/**
 * True when the image looks like a composite report sheet rather than a
 * photograph.
 *
 * The campus library is mixed: alongside real photographs it holds "activity
 * report" sheets — three or four phone snaps tiled under a printed banner, with
 * white gutters between them. One of those was picked as a section image on the
 * first illustrated run and rendered as a document scan with three GPS stamps
 * showing.
 *
 * A tiled sheet always has at least one full-width (or full-height) band of
 * near-uniform near-white pixels where the gutter runs. A photograph
 * essentially never does: even a blown-out sky varies across a row. So: shrink
 * to a 64×64 greyscale probe, and reject if any interior row or column is both
 * very bright and very flat.
 */
export function hasUniformGutter(grey: Buffer | Uint8Array): boolean {
  const flat = (values: number[]): boolean => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean < 205) return false; // gutters are white/very light
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance) < 7;
  };

  // Skip the outer 12%: a legitimate photo can have a bright band at the very
  // top (sky) or bottom (paving, sand) without being a collage.
  const from = Math.round(PROBE * 0.12);
  const to = PROBE - from;

  for (let y = from; y < to; y++) {
    const row: number[] = [];
    for (let x = 0; x < PROBE; x++) row.push(grey[y * PROBE + x]);
    if (flat(row)) return true;
  }
  for (let x = from; x < to; x++) {
    const col: number[] = [];
    for (let y = 0; y < PROBE; y++) col.push(grey[y * PROBE + x]);
    if (flat(col)) return true;
  }
  return false;
}

/**
 * The usable photo pool, scanned once per process.
 *
 * Metadata is read for every file, which is why the result is cached — the
 * library is ~1000 images and a per-post rescan would dominate the pipeline's
 * run time.
 */
export async function photoPool(): Promise<Candidate[]> {
  if (photoCache) return photoCache;
  const out: Candidate[] = [];
  let names: string[] = [];
  try {
    names = await fs.readdir(PHOTO_DIR);
  } catch {
    photoCache = [];
    return photoCache;
  }

  for (const name of names) {
    if (!/\.(jpe?g|png|webp)$/i.test(name)) continue;
    // Certificates, timetables and syllabus scans are in the same folder and
    // are useless as editorial imagery.
    if (/certificate|syllabus|timetable|sem|notice|circular|result|logo|icon|banner-?\d/i.test(name)) continue;
    const file = path.join(PHOTO_DIR, name);
    try {
      const meta = await sharp(file).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      if (width < MIN_PHOTO_WIDTH || height <= 0 || width / height < MIN_ASPECT) continue;

      // Cheap only because it runs on the ~300 files that already passed the
      // dimension filter, and only once per process.
      const { data } = await sharp(file)
        .resize(PROBE, PROBE, { fit: "fill" })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (hasUniformGutter(data)) continue;

      out.push({ file, width, height });
    } catch {
      // A corrupt or unsupported file is skipped rather than failing the run.
    }
  }
  photoCache = out;
  return out;
}

/**
 * Deterministic pick.
 *
 * Seeding from the slug means regenerating a post produces the same imagery,
 * so an admin re-running the pipeline does not get a different-looking article,
 * while different posts still get visibly different photographs.
 */
export function pickPhoto(pool: Candidate[], seed: string, offset = 0): Candidate | null {
  if (!pool.length) return null;
  const hash = createHash("sha1").update(seed).digest();
  const index = (hash.readUInt32BE(0) + offset * 7919) % pool.length;
  return pool[index];
}

async function ensureBucket(): Promise<void> {
  const client = getAdminClient();
  const { data } = await client.storage.getBucket(BUCKET);
  if (data) return;
  // Public bucket: these are marketing images on a public blog, and a signed
  // URL per image would expire out from under a cached page.
  const { error } = await client.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "8MB",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  // A concurrent run may have created it between the check and the create.
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Could not create the ${BUCKET} storage bucket: ${error.message}`);
  }
}

/**
 * Store the composed bytes somewhere the public site can actually load them.
 *
 * `relPath` MUST use forward slashes. Building it with path.join on Windows
 * produced object keys containing a literal backslash, which Supabase escaped
 * into "%5C" in the public URL — the first real article shipped with three
 * images at addresses like ".../slug%5Chero.jpg". Normalising here rather than
 * trusting every caller is what makes that unrepeatable.
 */
export async function storeImage(relPath: string, bytes: Buffer): Promise<string> {
  const key = relPath.split(/[\\/]+/).filter(Boolean).join("/");

  // Always write locally to public/blog-media so the site can serve it directly
  const abs = path.join(LOCAL_OUT_DIR, ...key.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes);

  if (isSupabaseAdminConfigured()) {
    try {
      await ensureBucket();
      const client = getAdminClient();
      const { error } = await client.storage.from(BUCKET).upload(key, bytes, {
        contentType: "image/jpeg",
        upsert: true,
        cacheControl: "31536000",
      });
      if (!error) {
        const { data } = client.storage.from(BUCKET).getPublicUrl(key);
        if (data.publicUrl) return data.publicUrl;
      }
    } catch {
      // Fallback to local path on any storage error
    }
  }

  return `/blog-media/${key}`;
}

// --- brand lockup -----------------------------------------------------------

const LOGO_FILE = path.join(process.cwd(), "public", "assets", "logos", "cropped-logo.png");

/** Logo height as a fraction of the image height, and its inset from the edge. */
const LOGO_SCALE = 0.155;
const LOGO_INSET = 0.045;
/** Padding between the logo artwork and the edge of the plate behind it. */
const PLATE_PAD = 0.018;

interface LogoLockup {
  buffer: Buffer;
  size: number;
  left: number;
  top: number;
  plate: { x: number; y: number; size: number; radius: number };
}

/**
 * The BVCITS crest, sized and positioned for one image.
 *
 * The crest is black line-art on a yellow field with a transparent surround, so
 * it disappears against a dark photograph or a black card. It is therefore
 * always placed on a light rounded plate — the plate geometry is returned here
 * and drawn by the SVG overlay, so the two can never drift out of alignment.
 *
 * Returns null only when the file is unreadable, which downgrades the image to
 * typography rather than failing it.
 */
async function logoLockup(spec: { width: number; height: number }): Promise<LogoLockup | null> {
  const size = Math.round(spec.height * LOGO_SCALE);
  const inset = Math.round(spec.height * LOGO_INSET);
  const pad = Math.round(spec.height * PLATE_PAD);

  try {
    const buffer = await sharp(LOGO_FILE)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    return {
      buffer,
      size,
      left: inset + pad,
      top: inset + pad,
      plate: { x: inset, y: inset, size: size + pad * 2, radius: Math.round(size * 0.14) },
    };
  } catch {
    // Unreadable crest downgrades the image to typography rather than failing
    // it. The caller reports hasLogo:false into the run notes, so it is visible
    // rather than silent.
    return null;
  }
}

/** Greedy word wrap, estimating glyph width at ~0.52 × font size. */
function wrapText(text: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
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
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[,;:]$/, "")}…`;
    return kept;
  }
  return lines;
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface OverlayInput {
  width: number;
  height: number;
  titleSize: number;
  title: string;
  tagline: string;
  eyebrow: string;
  hasPhoto: boolean;
  plate: LogoLockup["plate"] | null;
}

/**
 * The blog image overlay.
 */
function buildBlogOverlaySvg(o: OverlayInput): string {
  const c = DEFAULT_BRAND.colors;
  const { width: w, height: h, titleSize, hasPhoto } = o;

  const titleLines = wrapText(o.title, w * 0.84, titleSize, 3);
  const lineHeight = Math.round(titleSize * 1.16);
  const taglineSize = Math.round(titleSize * 0.36);
  const eyebrowSize = Math.round(titleSize * 0.3);

  const footerY = h - Math.round(h * 0.06);
  const taglineY = footerY - Math.round(h * 0.08);
  const titleBottom = taglineY - Math.round(taglineSize * 1.6);
  const titleTop = titleBottom - (titleLines.length - 1) * lineHeight;
  const eyebrowY = titleTop - Math.round(titleSize * 0.8);
  const left = Math.round(w * 0.06);

  const plate = o.plate
    ? `<rect x="${o.plate.x}" y="${o.plate.y}" width="${o.plate.size}" height="${o.plate.size}" rx="${o.plate.radius}" fill="${c.white}" fill-opacity="0.96"/>` +
      `<rect x="${o.plate.x}" y="${o.plate.y}" width="${o.plate.size}" height="${o.plate.size}" rx="${o.plate.radius}" fill="none" stroke="${c.gold}" stroke-opacity="0.8" stroke-width="${Math.max(2, Math.round(h * 0.003))}"/>`
    : "";

  const markX = o.plate ? o.plate.x + o.plate.size + Math.round(w * 0.016) : left;
  const markSize = Math.round(titleSize * 0.34);
  const markY = o.plate ? o.plate.y + Math.round(o.plate.size * 0.44) : 0;
  const wordmark = o.plate
    ? `<text x="${markX}" y="${markY}" font-family="Arial, Helvetica, sans-serif" font-size="${markSize}" font-weight="900" letter-spacing="2" fill="${c.white}">${escXml(DEFAULT_BRAND.shortName)}</text>` +
      `<text x="${markX}" y="${markY + Math.round(markSize * 1.25)}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(markSize * 0.62)}" font-weight="bold" letter-spacing="1" fill="${c.gold}">AMALAPURAM · AUTONOMOUS</text>`
    : "";

  const backgroundElements = hasPhoto
    ? [
        `<defs>`,
        `<linearGradient id="bottomScrim" x1="0" y1="0" x2="0" y2="1">`,
        `<stop offset="0" stop-color="#040914" stop-opacity="0"/>`,
        `<stop offset="0.35" stop-color="#040914" stop-opacity="0.75"/>`,
        `<stop offset="1" stop-color="#040914" stop-opacity="0.96"/>`,
        `</linearGradient>`,
        `<linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="1">`,
        `<stop offset="0" stop-color="#040914" stop-opacity="0.85"/>`,
        `<stop offset="1" stop-color="#040914" stop-opacity="0"/>`,
        `</linearGradient>`,
        `<linearGradient id="goldBeam" x1="0" y1="0" x2="1" y2="0">`,
        `<stop offset="0" stop-color="${c.gold}" stop-opacity="0.9"/>`,
        `<stop offset="0.7" stop-color="${c.gold}" stop-opacity="0.3"/>`,
        `<stop offset="1" stop-color="${c.gold}" stop-opacity="0"/>`,
        `</linearGradient>`,
        `</defs>`,
        `<rect x="0" y="0" width="${w}" height="${Math.round(h * 0.32)}" fill="url(#topScrim)"/>`,
        `<rect x="0" y="${Math.round(h * 0.38)}" width="${w}" height="${Math.round(h * 0.62)}" fill="url(#bottomScrim)"/>`,
      ]
    : [
        `<defs>`,
        `<linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">`,
        `<stop offset="0" stop-color="#08142c"/>`,
        `<stop offset="0.45" stop-color="#0f2142"/>`,
        `<stop offset="0.85" stop-color="#2a0d18"/>`,
        `<stop offset="1" stop-color="#120409"/>`,
        `</linearGradient>`,
        `<linearGradient id="goldBeam" x1="0" y1="0" x2="1" y2="0">`,
        `<stop offset="0" stop-color="${c.gold}" stop-opacity="0.9"/>`,
        `<stop offset="0.7" stop-color="${c.gold}" stop-opacity="0.3"/>`,
        `<stop offset="1" stop-color="${c.gold}" stop-opacity="0"/>`,
        `</linearGradient>`,
        `<radialGradient id="ambientGlow" cx="0.85" cy="0.15" r="0.6">`,
        `<stop offset="0" stop-color="#F5B800" stop-opacity="0.18"/>`,
        `<stop offset="0.5" stop-color="#8B1D24" stop-opacity="0.12"/>`,
        `<stop offset="1" stop-color="#000000" stop-opacity="0"/>`,
        `</radialGradient>`,
        `<radialGradient id="meshGlow" cx="0.15" cy="0.85" r="0.7">`,
        `<stop offset="0" stop-color="#8B1D24" stop-opacity="0.25"/>`,
        `<stop offset="0.6" stop-color="#08142c" stop-opacity="0"/>`,
        `</radialGradient>`,
        `</defs>`,
        `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#bgGrad)"/>`,
        `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#ambientGlow)"/>`,
        `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#meshGlow)"/>`,
        `<circle cx="${Math.round(w * 0.88)}" cy="${Math.round(h * 0.22)}" r="${Math.round(w * 0.18)}" fill="none" stroke="${c.gold}" stroke-opacity="0.12" stroke-width="2"/>`,
        `<circle cx="${Math.round(w * 0.88)}" cy="${Math.round(h * 0.22)}" r="${Math.round(w * 0.28)}" fill="none" stroke="${c.gold}" stroke-opacity="0.06" stroke-dasharray="8 8" stroke-width="1.5"/>`,
      ];

  return [
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`,
    ...backgroundElements,
    // Footer separator line
    `<rect x="0" y="${h - Math.round(h * 0.11)}" width="${w}" height="${Math.round(h * 0.11)}" fill="#060e1f" fill-opacity="0.95"/>`,
    `<rect x="0" y="${h - Math.round(h * 0.11)}" width="${w}" height="2" fill="url(#goldBeam)"/>`,
    plate,
    wordmark,
    // Category badge
    `<rect x="${left}" y="${eyebrowY - eyebrowSize * 1.15}" width="${Math.round(eyebrowSize * (o.eyebrow.length * 0.65 + 2.5))}" height="${Math.round(eyebrowSize * 1.7)}" rx="${Math.round(eyebrowSize * 0.4)}" fill="${c.gold}" fill-opacity="0.25" stroke="${c.gold}" stroke-opacity="0.75" stroke-width="1.5"/>`,
    `<text x="${left + Math.round(eyebrowSize * 0.9)}" y="${eyebrowY}" font-family="Arial, Helvetica, sans-serif" font-size="${eyebrowSize}" font-weight="bold" letter-spacing="3" fill="${c.gold}">${escXml(o.eyebrow.toUpperCase())}</text>`,
    // Title
    titleLines
      .map(
        (l, i) =>
          `<text x="${left}" y="${titleTop + i * lineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="900" fill="${c.white}">${escXml(l)}</text>`
      )
      .join(""),
    // Tagline & Footers
    `<text x="${left}" y="${taglineY}" font-family="Arial, Helvetica, sans-serif" font-size="${taglineSize}" font-weight="500" fill="#e5e7eb">${escXml(o.tagline)}</text>`,
    `<text x="${left}" y="${footerY}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(titleSize * 0.26)}" font-weight="bold" letter-spacing="2" fill="${c.gold}">${escXml(DEFAULT_BRAND.collegeName.toUpperCase())}</text>`,
    `<text x="${w - left}" y="${footerY}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(titleSize * 0.24)}" font-weight="bold" fill="#e5e7eb">Counselling Code: <tspan fill="${c.gold}">${escXml(DEFAULT_BRAND.counsellingCode)}</tspan></text>`,
    `</svg>`,
  ].join("");
}

interface ComposeInput {
  spec: { width: number; height: number; titleSize: number };
  backgroundImage?: Buffer | null;
  photo?: Candidate | null;
  title: string;
  tagline: string;
  eyebrow: string;
}

export interface ComposeResult {
  bytes: Buffer;
  /** False when the crest could not be read — surfaced so it is never silent. */
  hasLogo: boolean;
}

export async function composeBlogImage(input: ComposeInput): Promise<ComposeResult> {
  const { spec, backgroundImage, photo, title, tagline, eyebrow } = input;

  const logo = await logoLockup(spec);
  const hasPhoto = Boolean(backgroundImage || photo);

  const svg = buildBlogOverlaySvg({
    width: spec.width,
    height: spec.height,
    titleSize: spec.titleSize,
    title,
    tagline,
    eyebrow,
    hasPhoto,
    plate: logo?.plate ?? null,
  });

  const base = backgroundImage
    ? sharp(backgroundImage).resize(spec.width, spec.height, { fit: "cover" })
    : photo
      ? sharp(photo.file).resize(spec.width, spec.height, { fit: "cover" })
      : sharp(Buffer.from(svg));

  const composites: OverlayOptions[] = [];
  if (backgroundImage || photo) {
    composites.push({ input: Buffer.from(svg), left: 0, top: 0 });
  }

  if (logo) {
    composites.push({ input: logo.buffer, left: logo.left, top: logo.top });
  }

  const bytes = await base.composite(composites).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  return { bytes, hasLogo: Boolean(logo) };
}

// --- AI Image Prompt & Imagen Generation -------------------------------------

/**
 * Ask Gemini to construct an ultra-detailed, photorealistic, cinematic image prompt.
 */
export async function generateImagePrompt(topic: BlogTopic, outline?: BlogOutline): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return `A premium, hyper-realistic, highly clickable 16:9 technology editorial visual for '${topic.title}'. Modern cinematic lighting, sharp focus, 8k resolution, vibrant tech accents, professional atmosphere.`;
  }

  const promptModels = ["gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-3-flash-preview"];

  for (const model of promptModels) {
    try {
      const promptReq = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `You are an elite creative director crafting prompts for a photorealistic AI image generator.
Create an ultra-detailed, cinematic 16:9 thumbnail/hero image prompt for an engineering blog article.

Article Title: "${topic.title}"
Category: "${topic.category}"
Target Audience: "${topic.audience}"
Angle / Summary: "${topic.angle}"
Key Topics / Outlines: ${outline ? outline.sections.map((s) => s.heading).join(", ") : topic.rationale}

Guidelines for the prompt:
- Layout: 16:9 aspect ratio, single focal composition, high contrast, dramatic cinematic lighting.
- Realistic & Human: Include a confident young Indian engineering student or professional where relevant, in modern attire, in a high-tech or academic lab environment.
- Visual elements: Glowing technology nodes, code interfaces, analytics charts, or relevant engineering hardware depending on the topic.
- Style: Hyper-realistic, 8k, Unreal Engine 5 render style, sharp details, subtle depth of field.
- No tiny unreadable text or cluttered watermarks.

Output ONLY the prompt text (1 to 2 dense descriptive paragraphs), nothing else.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 350,
        },
      };

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promptReq),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const generated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (generated && generated.length > 20) return generated;
      }
    } catch {
      // Try next model in chain
    }
  }

  return `Create a premium, hyper-realistic 16:9 editorial visual for '${topic.title}'. Cinematic lighting, modern tech elements, confident young Indian engineering student, 8k resolution, vibrant accents.`;
}

/**
 * Call native Gemini Image Generation models to generate a high-definition image.
 */
export async function generateImagenImage(prompt: string): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const imageModels = [
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image",
    "gemini-3.1-flash-lite-image",
    "gemini-3-pro-image",
    "nano-banana-pro-preview",
  ];

  for (const model of imageModels) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: `Generate a 16:9 high-resolution photorealistic image based on this prompt: ${prompt}` }],
              },
            ],
          }),
        }
      );

      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: {
            content?: {
              parts?: {
                inlineData?: {
                  mimeType?: string;
                  data?: string;
                };
              }[];
            };
          }[];
        };

        const parts = data.candidates?.[0]?.content?.parts;
        if (parts && parts.length > 0) {
          for (const part of parts) {
            if (part.inlineData?.data) {
              return Buffer.from(part.inlineData.data, "base64");
            }
          }
        }
      }
    } catch {
      // Failover to next image model in chain
    }
  }

  return null;
}

export interface GeneratedImages {
  /** Never null on success — see the guarantee below. */
  hero: BlogImage;
  sections: BlogImage[];
  notes: string[];
}

export async function generateBlogImages(
  postId: string,
  slug: string,
  topic: BlogTopic,
  outline: BlogOutline
): Promise<GeneratedImages> {
  const notes: string[] = [];
  const eyebrow = topic.category;
  const tagline = `${DEFAULT_BRAND.shortName} · Amalapuram, Konaseema`;

  // 1. Generate customized AI prompt
  const aiPrompt = await generateImagePrompt(topic, outline);
  notes.push(`Synthesized AI Image Prompt: "${aiPrompt.slice(0, 100)}..."`);

  // 2. Attempt Google Gemini Image generation
  const rawAiBytes = await generateImagenImage(aiPrompt);
  const photoBacked = Boolean(rawAiBytes);

  // 3. Compose BVCITS crest, title typography, category badge, and scrim onto the image
  const composed = await composeBlogImage({
    spec: HERO_SPEC,
    backgroundImage: rawAiBytes ?? null,
    photo: null,
    title: topic.title,
    tagline,
    eyebrow,
  });

  const heroBytes = composed.bytes;
  if (!composed.hasLogo) {
    notes.push(`Hero image was composed without the crest — ${LOGO_FILE} could not be read.`);
  }

  const rel = `${slug}/hero.jpg`;
  const heroUrl = await storeImage(rel, heroBytes);

  const hero: BlogImage = {
    id: newId("bimg"),
    postId,
    url: heroUrl,
    alt: `${topic.title} — ${DEFAULT_BRAND.shortName}, Amalapuram`,
    caption: null,
    placement: "hero",
    sectionIndex: null,
    width: HERO_SPEC.width,
    height: HERO_SPEC.height,
    photoBacked,
    sourceNote: photoBacked
      ? "Photorealistic AI Image with Institutional BVCITS Crest & Title Lockup"
      : "AI Brand Creative Card with institutional crest and typography.",
    createdAt: nowIso(),
  };

  return { hero, sections: [], notes };
}

/**
 * Splice section images into the markdown after their heading.
 *
 * Done here rather than asking the writer to emit image markdown, because the
 * writer does not know the final URLs and a model asked to leave placeholders
 * reliably invents its own.
 */
export function insertSectionImages(bodyMd: string, outline: BlogOutline, images: BlogImage[]): string {
  if (!images.length) return bodyMd;
  const byIndex = new Map(images.map((i) => [i.sectionIndex ?? -1, i]));
  const lines = bodyMd.split("\n");
  const out: string[] = [];
  let h2Seen = -1;

  /*
   * Idempotency check against the WHOLE input, not against the output built so
   * far. This function runs twice — once after writing, once after the revision
   * pass returns a body that already carries the image markdown — and the
   * output-only check could not see an image that sits below the heading it was
   * about to insert at. Every revised article shipped its section images twice.
   */
  const alreadyPresent = (url: string) => bodyMd.includes(url);

  for (const line of lines) {
    out.push(line);
    if (!/^##\s+/.test(line)) continue;
    h2Seen++;
    const heading = line.replace(/^##\s+/, "").trim().toLowerCase();
    // Match on the outline position first; fall back to heading text, because
    // the writer occasionally reorders or renames a section.
    const planned = outline.sections.findIndex((s) => s.heading.trim().toLowerCase() === heading);
    const img = byIndex.get(planned) ?? byIndex.get(h2Seen);
    if (img && !alreadyPresent(img.url) && !out.some((l) => l.includes(img.url))) {
      out.push("", `![${img.alt}](${img.url})`, "");
    }
  }
  return out.join("\n");
}
