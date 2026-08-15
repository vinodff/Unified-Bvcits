/**
 * Pre-renders the scroll frame sequences.
 *
 *   node scripts/render-frames.mjs core
 *   node scripts/render-frames.mjs corridor
 *   node scripts/render-frames.mjs all --width=1600 --height=900 --quality=72
 *
 * Output lands in public/frames/ and public/tunnel-frames/ using the
 * frame_0001.jpg naming convention the canvas engine expects.
 */

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { createFramebuffer, toneMap } from "./lib/render3d.mjs";
import {
  createCoreScene, createCorridorScene, renderCoreFrame, renderCorridorFrame,
} from "./lib/scenes.mjs";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");

const SEQUENCES = {
  core: {
    outDir: path.join(PUBLIC_DIR, "frames"),
    publicPath: "/frames",
    frameCount: 80,
    build: createCoreScene,
    render: renderCoreFrame,
    tone: { exposure: 1.5, gamma: 2.2, bloomStrength: 0.6, bloomThreshold: 0.32 },
  },
  corridor: {
    outDir: path.join(PUBLIC_DIR, "tunnel-frames"),
    publicPath: "/tunnel-frames",
    frameCount: 64,
    build: createCorridorScene,
    render: renderCorridorFrame,
    tone: { exposure: 1.65, gamma: 2.2, bloomStrength: 0.7, bloomThreshold: 0.28 },
  },
};

// 1280x720 keeps the whole preload near 5 MB. The scenes are glow-on-dark, so
// upscaling to a 1440p viewport costs almost nothing visually.
const DEFAULTS = { width: 1280, height: 720, quality: 66 };

const MANIFEST_PATH = path.resolve(process.cwd(), "src", "lib", "frame-manifest.ts");

function parseArgs(argv) {
  const positional = [];
  const flags = { ...DEFAULTS };

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [key, rawValue] = arg.slice(2).split("=");
    if (rawValue === undefined) {
      flags[key] = true;
      continue;
    }
    const numeric = Number(rawValue);
    flags[key] = Number.isFinite(numeric) ? numeric : rawValue;
  }

  const requested = positional[0] ?? "all";
  const names = requested === "all" ? Object.keys(SEQUENCES) : [requested];

  for (const name of names) {
    if (!SEQUENCES[name]) {
      throw new Error(`Unknown sequence "${name}". Expected one of: ${Object.keys(SEQUENCES).join(", ")}, all`);
    }
  }
  return { names, flags };
}

async function emptyDir(dir) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
    return;
  }
  const entries = await readdir(dir);
  await Promise.all(
    entries
      .filter((name) => name.endsWith(".jpg"))
      .map((name) => rm(path.join(dir, name), { force: true })),
  );
}

async function renderSequence(name, flags) {
  const config = SEQUENCES[name];
  const frameCount = Number(flags.frames) > 0 ? Number(flags.frames) : config.frameCount;
  const width = Number(flags.width);
  const height = Number(flags.height);
  const quality = Number(flags.quality);

  await emptyDir(config.outDir);

  const framebuffer = createFramebuffer(width, height);
  const scene = config.build();
  const startedAt = Date.now();
  let totalBytes = 0;

  for (let index = 0; index < frameCount; index++) {
    // Last frame must land exactly on progress 1.
    const progress = frameCount === 1 ? 0 : index / (frameCount - 1);
    config.render(framebuffer, scene, progress);
    const rgb = toneMap(framebuffer, config.tone);

    const encoded = await sharp(rgb, { raw: { width, height, channels: 3 } })
      .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer();

    const fileName = `frame_${String(index + 1).padStart(4, "0")}.jpg`;
    await writeFile(path.join(config.outDir, fileName), encoded);
    totalBytes += encoded.length;

    if ((index + 1) % 12 === 0 || index === frameCount - 1) {
      process.stdout.write(`  ${name}: ${index + 1}/${frameCount} frames\n`);
    }
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const megabytes = (totalBytes / 1024 / 1024).toFixed(2);
  const averageKb = (totalBytes / frameCount / 1024).toFixed(1);
  process.stdout.write(
    `  ${name}: done in ${seconds}s — ${frameCount} frames, ${megabytes} MB total, ${averageKb} KB avg\n` +
    `  ${name}: ${path.relative(process.cwd(), config.outDir)}\n\n`,
  );

  return { name, frameCount, totalBytes };
}

/**
 * Writes the frame counts the canvas engine preloads against, derived from
 * what is actually on disk. Generating this rather than hand-syncing a constant
 * is what stops FRAME_COUNT drifting from the rendered sequence — the classic
 * cause of a blank last frame.
 */
async function writeManifest() {
  const entries = [];
  for (const [name, config] of Object.entries(SEQUENCES)) {
    const files = existsSync(config.outDir) ? await readdir(config.outDir) : [];
    const frameCount = files.filter((file) => /^frame_\d+\.jpg$/.test(file)).length;
    entries.push({ name, publicPath: config.publicPath, frameCount });
  }

  const body = entries
    .map(
      ({ name, publicPath, frameCount }) =>
        `  ${name}: { path: "${publicPath}", frameCount: ${frameCount} },`,
    )
    .join("\n");

  const contents =
    `// GENERATED by scripts/render-frames.mjs — do not edit by hand.\n` +
    `// Re-run \`npm run frames\` after changing any sequence.\n\n` +
    `export const frameSequences = {\n${body}\n} as const;\n\n` +
    `export type FrameSequence = (typeof frameSequences)[keyof typeof frameSequences];\n`;

  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, contents, "utf8");
  process.stdout.write(`Manifest: ${path.relative(process.cwd(), MANIFEST_PATH)}\n`);
}

async function main() {
  const { names, flags } = parseArgs(process.argv.slice(2));
  process.stdout.write(
    `\nRendering at ${flags.width}x${flags.height}, JPEG q${flags.quality}\n\n`,
  );

  const results = [];
  for (const name of names) {
    results.push(await renderSequence(name, flags));
  }

  await writeManifest();

  const grandTotal = results.reduce((sum, r) => sum + r.totalBytes, 0);
  process.stdout.write(`Total payload: ${(grandTotal / 1024 / 1024).toFixed(2)} MB\n`);
}

main().catch((error) => {
  process.stderr.write(`Frame render failed: ${error.message}\n`);
  process.exitCode = 1;
});
