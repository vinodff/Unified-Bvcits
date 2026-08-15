// Images-first media grabber. Reads the 300 already-downloaded raw HTML pages,
// extracts every image/logo/icon/font/pdf URL (incl. WordPress lazy attrs + srcset),
// dedupes to ONE best variant per original image, and downloads.
// Usage: node scripts/grab-media.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const HOST = "bvcits.edu.in";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const RAW = path.join(ROOT, "scrape/raw");

const DIRS = {
  images: "public/assets/images",
  logos: "public/assets/logos",
  icons: "public/assets/icons",
  fonts: "public/assets/fonts",
  documents: "public/documents",
};
for (const d of Object.values(DIRS)) fs.mkdirSync(path.join(ROOT, d), { recursive: true });

const IMG = ["png", "jpg", "jpeg", "webp", "gif", "avif"];
const ICON = ["svg", "ico"];
const FONT = ["woff2", "woff", "ttf", "otf"];
const DOC = ["pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt"];

const extOf = (u) => (u.split("?")[0].split("#")[0].match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();

function bucket(url) {
  const e = extOf(url);
  if (IMG.includes(e)) return /logo|naac|nba|aicte|jntuk|iso|cisco|pearson/i.test(url) ? "logos" : "images";
  if (ICON.includes(e)) return /logo/i.test(url) ? "logos" : "icons";
  if (FONT.includes(e)) return "fonts";
  if (DOC.includes(e)) return "documents";
  return null;
}

// WordPress makes foo-300x200.jpg variants of foo.jpg. Group by base, keep the
// largest declared variant (or the original, which is usually full-size).
function baseKey(url) {
  return url.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1");
}
function variantArea(url) {
  const m = url.match(/-(\d+)x(\d+)\.[a-z0-9]+$/i);
  return m ? parseInt(m[1]) * parseInt(m[2]) : Number.MAX_SAFE_INTEGER; // original = biggest
}

// ---- collect URLs from raw HTML ----
const found = new Set();
const files = fs.readdirSync(RAW).filter((f) => f.endsWith(".html"));
for (const f of files) {
  const html = fs.readFileSync(path.join(RAW, f), "utf8");
  const attrRe = /\b(?:src|data-src|data-lazy-src|data-large_image|href|content|poster)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = attrRe.exec(html))) {
    let u = m[1].trim();
    if (u.startsWith("//")) u = "https:" + u;
    if (!u.startsWith("http")) continue;
    if (!u.includes(HOST)) continue;
    if (bucket(u)) found.add(u.split("#")[0]);
  }
  const ssRe = /\b(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/gi;
  while ((m = ssRe.exec(html))) {
    for (const part of m[1].split(",")) {
      let u = part.trim().split(/\s+/)[0];
      if (u.startsWith("//")) u = "https:" + u;
      if (u.startsWith("http") && u.includes(HOST) && bucket(u)) found.add(u.split("#")[0]);
    }
  }
  const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  while ((m = urlRe.exec(html))) {
    let u = m[1].trim();
    if (u.startsWith("//")) u = "https:" + u;
    if (u.startsWith("http") && u.includes(HOST) && bucket(u)) found.add(u.split("#")[0]);
  }
}

// also mine the downloaded CSS for font + background-image urls
const cssDir = path.join(ROOT, "public/assets/css");
if (fs.existsSync(cssDir)) {
  for (const f of fs.readdirSync(cssDir).slice(0, 400)) {
    const css = fs.readFileSync(path.join(cssDir, f), "utf8");
    const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    let m;
    while ((m = urlRe.exec(css))) {
      let u = m[1].trim();
      if (u.startsWith("data:")) continue;
      if (u.startsWith("//")) u = "https:" + u;
      if (u.startsWith("http") && u.includes(HOST) && bucket(u)) found.add(u.split("#")[0]);
    }
  }
}

// ---- dedupe image size-variants ----
const groups = new Map();
for (const u of found) {
  const b = bucket(u);
  const key = b === "images" || b === "logos" ? baseKey(u) : u;
  const prev = groups.get(key);
  if (!prev || variantArea(u) > variantArea(prev)) groups.set(key, u);
}
const targets = [...groups.values()];
const counts = targets.reduce((a, u) => ((a[bucket(u)] = (a[bucket(u)] || 0) + 1), a), {});
console.log(`Discovered ${found.size} media URLs -> ${targets.length} after variant-dedupe:`, counts);

// ---- download ----
const manifest = {};
const used = new Set();
let ok = 0, fail = 0, bytes = 0;

async function grab(url) {
  const b = bucket(url);
  const folder = DIRS[b];
  let name = decodeURIComponent(url.split("/").pop().split("?")[0]).replace(/[^a-z0-9._-]+/gi, "-");
  if (!name || name.length > 90) name = crypto.createHash("md5").update(url).digest("hex").slice(0, 10) + "." + extOf(url);
  let local = path.join(folder, name);
  if (used.has(local)) local = path.join(folder, crypto.createHash("md5").update(url).digest("hex").slice(0, 6) + "-" + name);
  used.add(local);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000), redirect: "follow" });
    if (!res.ok) { manifest[url] = { status: "failed:" + res.status, type: b }; fail++; return; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 25 * 1024 * 1024) { manifest[url] = { status: "skipped:too-large", type: b, bytes: buf.length }; return; }
    fs.writeFileSync(path.join(ROOT, local), buf);
    manifest[url] = { status: "ok", type: b, localPath: local.replace(/\\/g, "/"), bytes: buf.length };
    ok++; bytes += buf.length;
    if (ok % 50 === 0) process.stdout.write(`\r  downloaded ${ok}/${targets.length} (${(bytes / 1048576).toFixed(0)} MB)`);
  } catch (e) {
    manifest[url] = { status: "failed:" + (e.name || "err"), type: b }; fail++;
  }
}

let i = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (i < targets.length) await grab(targets[i++]);
}));

// merge with any existing manifest (CSS entries from the earlier pass)
const mfPath = path.join(ROOT, "scrape/manifest.json");
let existing = {};
try { existing = JSON.parse(fs.readFileSync(mfPath, "utf8")); } catch {}
// record the CSS files already on disk
const cssFiles = fs.existsSync(cssDir) ? fs.readdirSync(cssDir) : [];
fs.writeFileSync(mfPath, JSON.stringify({ ...existing, ...manifest }, null, 2));

console.log(`\n\n===== MEDIA HARVEST =====`);
console.log(`ok: ${ok}   failed: ${fail}   size: ${(bytes / 1048576).toFixed(1)} MB`);
for (const [t, d] of Object.entries(DIRS)) {
  const n = fs.readdirSync(path.join(ROOT, d)).length;
  console.log(`  ${t.padEnd(10)} ${n} files`);
}
console.log(`  css        ${cssFiles.length} files (from earlier pass)`);
