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

  if (isSupabaseAdminConfigured()) {
    await ensureBucket();
    const client = getAdminClient();
    const { error } = await client.storage.from(BUCKET).upload(key, bytes, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) throw new Error(`Blog image upload failed: ${error.message}`);
    const { data } = client.storage.from(BUCKET).getPublicUrl(key);
    return data.publicUrl;
  }

  const abs = path.join(LOCAL_OUT_DIR, ...key.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes);
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
 *
 * Written here rather than reusing creative-engine's buildOverlaySvg because it
 * needs two things that one does not have and that campaign creatives do not
 * want: a top scrim plus the logo plate, and a wordmark that sits beside the
 * crest rather than alone in the corner. Changing the shared function would
 * have altered every campaign graphic as a side effect.
 */
function buildBlogOverlaySvg(o: OverlayInput): string {
  const c = DEFAULT_BRAND.colors;
  const { width: w, height: h, titleSize } = o;

  const titleLines = wrapText(o.title, w * 0.84, titleSize, 3);
  const lineHeight = Math.round(titleSize * 1.14);
  const taglineSize = Math.round(titleSize * 0.36);
  const eyebrowSize = Math.round(titleSize * 0.3);

  // Text block is bottom-anchored so a one-line and a three-line title share
  // the same baseline distance from the foot of the image.
  const footerY = h - Math.round(h * 0.055);
  const taglineY = footerY - Math.round(h * 0.075);
  const titleBottom = taglineY - Math.round(taglineSize * 1.6);
  const titleTop = titleBottom - (titleLines.length - 1) * lineHeight;
  const eyebrowY = titleTop - Math.round(titleSize * 0.78);
  const left = Math.round(w * 0.055);

  const scrimTop = Math.round(eyebrowY - titleSize * 1.4);

  const plate = o.plate
    ? `<rect x="${o.plate.x}" y="${o.plate.y}" width="${o.plate.size}" height="${o.plate.size}" rx="${o.plate.radius}" fill="${c.white}" fill-opacity="0.96"/>` +
      `<rect x="${o.plate.x}" y="${o.plate.y}" width="${o.plate.size}" height="${o.plate.size}" rx="${o.plate.radius}" fill="none" stroke="${c.gold}" stroke-opacity="0.55" stroke-width="${Math.max(2, Math.round(h * 0.003))}"/>`
    : "";

  // Wordmark beside the crest, so the lockup reads as an institutional mark
  // even when the image is cropped to a small card.
  const markX = o.plate ? o.plate.x + o.plate.size + Math.round(w * 0.016) : left;
  const markSize = Math.round(titleSize * 0.34);
  const markY = o.plate ? o.plate.y + Math.round(o.plate.size * 0.44) : 0;
  const wordmark = o.plate
    ? `<text x="${markX}" y="${markY}" font-family="Arial, Helvetica, sans-serif" font-size="${markSize}" font-weight="800" letter-spacing="2" fill="${c.white}">${escXml(DEFAULT_BRAND.shortName)}</text>` +
      `<text x="${markX}" y="${markY + Math.round(markSize * 1.25)}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(markSize * 0.62)}" letter-spacing="1" fill="${c.gold}">AMALAPURAM · AUTONOMOUS</text>`
    : "";

  return [
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`,
    `<defs>`,
    // Weighted towards the top of the ramp so the FIRST title line is already
    // on a dark ground. A gentler curve looked fine on the brand card and left
    // the top line fighting a bright sky on a real photograph.
    `<linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${c.black}" stop-opacity="0"/>`,
    `<stop offset="0.28" stop-color="${c.black}" stop-opacity="0.55"/>`,
    `<stop offset="0.6" stop-color="${c.black}" stop-opacity="0.82"/>`,
    `<stop offset="1" stop-color="${c.black}" stop-opacity="0.96"/>`,
    `</linearGradient>`,
    // The top scrim is what makes the wordmark legible over a bright sky, which
    // a large share of the campus library is.
    `<linearGradient id="top" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${c.black}" stop-opacity="${o.hasPhoto ? 0.66 : 0}"/>`,
    `<stop offset="1" stop-color="${c.black}" stop-opacity="0"/>`,
    `</linearGradient>`,
    `</defs>`,
    `<rect x="0" y="0" width="${w}" height="${Math.round(h * 0.34)}" fill="url(#top)"/>`,
    `<rect x="0" y="${scrimTop}" width="${w}" height="${h - scrimTop}" fill="url(#bottom)"/>`,
    // Fully opaque footer band. The gradient bottoms out at 0.96, and 4% of a
    // bright burnt-in phone-camera GPS stamp is still legible over black — this
    // is what actually removes the last of it, and it gives the college name
    // and counselling code a consistent ground on every photograph.
    `<rect x="0" y="${h - Math.round(h * 0.1)}" width="${w}" height="${Math.round(h * 0.1)}" fill="${c.black}"/>`,
    `<rect x="0" y="${h - Math.round(h * 0.1)}" width="${w}" height="${Math.max(2, Math.round(h * 0.002))}" fill="${c.gold}" fill-opacity="0.35"/>`,
    plate,
    wordmark,
    // Sits a clear gap ABOVE the eyebrow. Level with the cap height it read as
    // a stray dash butting into the first letter, especially at hero scale.
    `<rect x="${left}" y="${eyebrowY - eyebrowSize - Math.round(h * 0.022)}" width="${Math.round(w * 0.035)}" height="${Math.max(3, Math.round(h * 0.005))}" fill="${c.gold}"/>`,
    `<text x="${left}" y="${eyebrowY}" font-family="Arial, Helvetica, sans-serif" font-size="${eyebrowSize}" font-weight="bold" letter-spacing="4" fill="${c.gold}">${escXml(o.eyebrow.toUpperCase())}</text>`,
    titleLines
      .map(
        (l, i) =>
          `<text x="${left}" y="${titleTop + i * lineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="800" fill="${c.white}">${escXml(l)}</text>`
      )
      .join(""),
    `<text x="${left}" y="${taglineY}" font-family="Arial, Helvetica, sans-serif" font-size="${taglineSize}" fill="#E8E6DF">${escXml(o.tagline)}</text>`,
    `<text x="${left}" y="${footerY}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(titleSize * 0.26)}" font-weight="bold" letter-spacing="2" fill="${c.gold}">${escXml(DEFAULT_BRAND.collegeName.toUpperCase())}</text>`,
    `<text x="${w - left}" y="${footerY}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(titleSize * 0.24)}" fill="#C9C7C0">Counselling Code: ${escXml(DEFAULT_BRAND.counsellingCode)}</text>`,
    `</svg>`,
  ].join("");
}

interface ComposeInput {
  spec: { width: number; height: number; titleSize: number };
  photo: Candidate | null;
  title: string;
  tagline: string;
  eyebrow: string;
}

export interface ComposeResult {
  bytes: Buffer;
  /** False when the crest could not be read — surfaced so it is never silent. */
  hasLogo: boolean;
}

/**
 * Compose one image: photo (or brand field) + scrims + logo lockup + typography.
 *
 * Exported so the crest lockup can be tested without touching storage — the
 * "every post has an image with the logo on it" guarantee is only worth as much
 * as the test that proves the bytes actually come out.
 */
export async function composeBlogImage(input: ComposeInput): Promise<ComposeResult> {
  const { spec, photo, title, tagline, eyebrow } = input;
  const colors = DEFAULT_BRAND.colors;

  const base = sharp({
    create: {
      width: spec.width,
      height: spec.height,
      channels: 3,
      // Always the brand black. The typography and the logo plate are designed
      // against it, so a photo-less card stays on-brand instead of switching to
      // a second, lighter treatment.
      background: colors.black,
    },
  });

  const composites: OverlayOptions[] = [];

  if (photo) {
    /*
     * The bottom slice of the source is discarded before the cover-crop.
     *
     * A good share of the campus library was shot on phones running "GPS Map
     * Camera", which burns a location/timestamp panel into the bottom of the
     * frame. Those panels survived the scrim and appeared as ghosted text
     * behind the tagline on the first live hero. Dropping the bottom fifth of
     * the source removes them in most cases, and it costs nothing compositionally
     * — the frame is being cropped to 16:9 anyway, and widening the aspect this
     * way usually lands closer to the target than the raw frame did.
     *
     * `rotate()` first so EXIF orientation is applied before the geometry is
     * measured, otherwise the crop lands on the wrong edge of a rotated photo.
     */
    const upright = sharp(photo.file).rotate();
    const meta = await upright.metadata();
    const srcH = meta.height ?? 0;
    const keep = Math.round(srcH * 0.8);

    const cropped =
      srcH > 400 && keep > 0
        ? upright.extract({ left: 0, top: 0, width: meta.width ?? 0, height: keep })
        : upright;

    const resized = await cropped
      .resize(spec.width, spec.height, { fit: "cover", position: "centre" })
      // A gentle desaturation keeps the gold typography legible over the very
      // mixed exposure of the scraped library without hiding the photo.
      .modulate({ saturation: 0.86, brightness: 0.94 })
      .jpeg({ quality: 90 })
      .toBuffer();
    composites.push({ input: resized, left: 0, top: 0 });
  }

  const logo = await logoLockup(spec);

  // Order matters: scrims and plate first, crest on top of its own plate.
  composites.push({
    input: Buffer.from(
      buildBlogOverlaySvg({
        width: spec.width,
        height: spec.height,
        titleSize: spec.titleSize,
        title,
        tagline,
        eyebrow,
        hasPhoto: Boolean(photo),
        plate: logo?.plate ?? null,
      })
    ),
    left: 0,
    top: 0,
  });

  if (logo) composites.push({ input: logo.buffer, left: logo.left, top: logo.top });

  const bytes = await base.composite(composites).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  return { bytes, hasLogo: Boolean(logo) };
}

export interface GeneratedImages {
  /** Never null on success — see the guarantee below. */
  hero: BlogImage;
  sections: BlogImage[];
  notes: string[];
}

/**
 * Generate the hero plus one image per section that asked for one.
 *
 * **The hero is a hard requirement.** Every article must carry at least one
 * image, so the hero has a two-step fallback rather than the best-effort
 * handling the section images get:
 *
 *   1. a real campus photograph with the brand lockup, then
 *   2. a pure brand card — no photo, no filesystem read beyond the crest.
 *
 * Step 2 depends on nothing but sharp itself, so the only way to reach the
 * throw is a broken image toolchain, which is a real failure worth surfacing
 * rather than papering over with an article that has no picture.
 *
 * Section images stay best-effort: losing one costs the article nothing that
 * the hero has not already supplied.
 */
export async function generateBlogImages(
  postId: string,
  slug: string,
  topic: BlogTopic,
  outline: BlogOutline
): Promise<GeneratedImages> {
  const pool = await photoPool();
  const notes: string[] = [];
  if (!pool.length) {
    notes.push("No usable photographs found in public/assets/images — images fall back to the brand card.");
  }

  const eyebrow = topic.category;
  const tagline = `${DEFAULT_BRAND.shortName} · Amalapuram, Konaseema`;

  const build = async (
    placement: "hero" | "section",
    spec: typeof HERO_SPEC,
    title: string,
    offset: number,
    sectionIndex: number | null,
    photo: Candidate | null
  ): Promise<BlogImage> => {
    const { bytes, hasLogo } = await composeBlogImage({ spec, photo, title, tagline, eyebrow });
    const rel = `${slug}/${placement}${sectionIndex === null ? "" : `-${sectionIndex}`}.jpg`;
    const url = await storeImage(rel, bytes);

    if (!hasLogo) notes.push(`${placement} image was composed without the crest — ${LOGO_FILE} could not be read.`);

    return {
      id: newId("bimg"),
      postId,
      url,
      // Alt text describes the composition honestly. Claiming the photo shows a
      // specific event would be a caption we cannot substantiate.
      alt: `${title} — ${DEFAULT_BRAND.shortName}, Amalapuram`,
      caption: placement === "hero" ? null : title,
      placement,
      sectionIndex,
      width: spec.width,
      height: spec.height,
      photoBacked: Boolean(photo),
      sourceNote: photo
        ? `Composed from ${path.basename(photo.file)} (BVCITS campus library) with the brand lockup${hasLogo ? " and college crest" : ""}.`
        : `Brand card with the college crest — no suitable photograph was available.`,
      createdAt: nowIso(),
    };
  };

  // ---- hero: guaranteed --------------------------------------------------
  let hero: BlogImage;
  const heroPhoto = pickPhoto(pool, `${slug}:0`, 0);
  try {
    hero = await build("hero", HERO_SPEC, topic.title, 0, null, heroPhoto);
  } catch (e) {
    notes.push(`Hero photo composition failed (${(e as Error).message}) — fell back to the brand card.`);
    // Retried WITHOUT the photograph: a single corrupt file in the library is
    // the overwhelmingly likely cause, and it must not cost the article its
    // only image.
    hero = await build("hero", HERO_SPEC, topic.title, 0, null, null);
  }

  // ---- sections: best effort --------------------------------------------
  const sections: BlogImage[] = [];
  let offset = 1;
  for (let i = 0; i < outline.sections.length; i++) {
    if (!outline.sections[i].wantsImage) continue;
    try {
      sections.push(
        await build("section", SECTION_SPEC, outline.sections[i].heading, offset, i, pickPhoto(pool, `${slug}:${offset}`, offset))
      );
    } catch (e) {
      notes.push(`Section image ${i} failed: ${(e as Error).message}`);
    }
    offset++;
  }

  return { hero, sections, notes };
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
