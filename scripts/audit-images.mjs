// Audit local image dimensions vs. how they are rendered -> find blurry/undersized assets.
import fs from "node:fs";
import path from "node:path";

function pngSize(b) {
  if (b.length > 24 && b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG")
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  return null;
}
function jpgSize(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}
function webpSize(b) {
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const fmt = b.toString("ascii", 12, 16);
  if (fmt === "VP8X") return { w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1 };
  if (fmt === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (fmt === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}
export function imageSize(p) {
  try {
    const b = fs.readFileSync(p);
    return pngSize(b) || jpgSize(b) || webpSize(b);
  } catch { return null; }
}

// Rendered slots on the homepage (what the design actually needs).
// Badge logos (aicte/jntuk) are genuinely low-res at the source — Phase 3 renders
// them at 56px in a white plate specifically because they can't go bigger; the
// 180px bar below is aspirational, not a hard gate for those two.
const NEEDS = {
  "logos/cropped-logo.png": { slot: "header crest 48px @2x", minW: 96 },
  "logos/aicte_logo.png": { slot: "badge 56px @2x (source-limited)", minW: 180, soft: true },
  "logos/NAAC_LOGO.png": { slot: "badge 56px @2x", minW: 180 },
  "logos/jntuk.png": { slot: "badge 56px @2x (source-limited)", minW: 180, soft: true },
  "images/images.png": { slot: "NBA badge 56px @2x", minW: 180 },
  "images/l1-scaled.jpg": { slot: "HERO full-bleed", minW: 1600 },
  "images/DSC06792-scaled.jpg": { slot: "about 4:3 half-width", minW: 1200 },
  "images/38lpa-bvcits.png": { slot: "topper 96px", minW: 300 },
  "images/girl-1.png": { slot: "topper 96px", minW: 300 },
};

const GALLERY_MIN = 900;

console.log("=== HOMEPAGE IMAGE AUDIT ===\n");
console.log("  DIMENSIONS      SIZE   VERDICT   SLOT / FILE");
let bad = 0;
for (const [rel, need] of Object.entries(NEEDS)) {
  const p = path.join("public/assets", rel);
  const d = imageSize(p);
  const kb = fs.existsSync(p) ? (fs.statSync(p).size / 1024).toFixed(0) : "?";
  const ok = d && d.w >= need.minW;
  if (!ok) bad++;
  const dims = d ? `${d.w}x${d.h}` : "unknown";
  console.log(`  ${dims.padEnd(14)} ${(kb + "KB").padStart(7)}  ${(ok ? "OK" : "TOO SMALL").padEnd(9)} ${need.slot}  (needs ≥${need.minW}px)  ${rel}`);
}

console.log("\n=== GALLERY ===");
const gallery = [
  "DSC06792-scaled.jpg", "l10-1024x683.jpg", "DSC07406-scaled.jpg", "h4-scaled.jpg",
  "s7-scaled.jpg", "UKS_5811-scaled.jpg", "h2-scaled.jpg", "s1-scaled.jpg",
  "s10-min-scaled.jpg", "l4-scaled.jpg", "l1-scaled.jpg",
];
for (const g of gallery) {
  const p = path.join("public/assets/images", g);
  const d = imageSize(p);
  const kb = fs.existsSync(p) ? (fs.statSync(p).size / 1024).toFixed(0) : "?";
  const ok = d && d.w >= GALLERY_MIN;
  if (!ok) bad++;
  console.log(`  ${(d ? `${d.w}x${d.h}` : "unknown").padEnd(14)} ${(kb + "KB").padStart(7)}  ${(ok ? "OK" : "TOO SMALL").padEnd(9)} ${g}`);
}
console.log(`\nUndersized assets: ${bad}`);
