// BVCITS asset & content harvester — dependency-free (Node 22 global fetch).
// See docs/SCRAPE-MISSION.md. Usage:
//   node scripts/scrape.mjs discover   # build scrape/urls.json from sitemap + seeds
//   node scripts/scrape.mjs crawl      # fetch pages, download assets, write manifest
//   node scripts/scrape.mjs verify     # retry failed assets, finalize report

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const BASE = "https://bvcits.edu.in";
const HOST = "bvcits.edu.in";
const ROOT = process.cwd();
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const DIRS = {
  raw: "scrape/raw",
  images: "public/assets/images",
  icons: "public/assets/icons",
  logos: "public/assets/logos",
  fonts: "public/assets/fonts",
  css: "public/assets/css",
  documents: "public/documents",
};
for (const d of Object.values(DIRS)) fs.mkdirSync(path.join(ROOT, d), { recursive: true });
fs.mkdirSync(path.join(ROOT, "scrape"), { recursive: true });

const CONCURRENCY = 5;
const REQ_TIMEOUT = 25000;
const MAX_PAGES = 300;
const MAX_ASSET_BYTES = 12 * 1024 * 1024;

const seedRoutes = [
  "/", "/home-page-v2/", "/about-us/", "/about-us/mous/", "/accreditations/",
  "/awards-recognition/", "/student-mentoring/", "/admissions/", "/departments/",
  "/departments/computer-science-engineering/", "/departments/ai-ds-new/",
  "/departments/cse-artificial-intelligence-machine-learning/",
  "/departments/electronics-communication-engineering/",
  "/departments/electrical-electronics-engineering/",
  "/departments/mechanical-engineering/", "/departments/civil-engineering/",
  "/departments/master-of-business-administration/",
  "/departments/masters-in-computer-application/", "/science-humanities/",
  "/examinations/autonomous/", "/examinations/jntuk/", "/placements-cell/",
  "/campus-life/", "/infrastructure/", "/library/", "/mandatory-disclosures/",
  "/iqac/naac-ssr/", "/nirf/", "/polytechnic/", "/contact-us/", "/events/",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRes(url, { asBuffer = false, retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "*/*" },
        signal: AbortSignal.timeout(REQ_TIMEOUT),
        redirect: "follow",
      });
      if (!res.ok) {
        if (attempt < retries) { await sleep(600 * (attempt + 1)); continue; }
        return { ok: false, status: res.status };
      }
      const ctype = res.headers.get("content-type") || "";
      if (asBuffer) {
        const buf = Buffer.from(await res.arrayBuffer());
        return { ok: true, status: res.status, buf, ctype };
      }
      return { ok: true, status: res.status, text: await res.text(), ctype };
    } catch (e) {
      if (attempt < retries) { await sleep(600 * (attempt + 1)); continue; }
      return { ok: false, status: 0, error: String(e.name || e) };
    }
  }
  return { ok: false, status: 0 };
}

function abs(href, baseUrl) {
  try { return new URL(href, baseUrl).href.split("#")[0]; } catch { return null; }
}
function sameHost(url) {
  try { return new URL(url).host === HOST; } catch { return false; }
}
function slugForRoute(url) {
  const u = new URL(url);
  let p = u.pathname.replace(/\/+$/, "");
  if (u.search) p += "_" + u.search.replace(/[^a-z0-9]+/gi, "-");
  p = p.replace(/^\/+/, "").replace(/[^a-z0-9._-]+/gi, "-");
  return (p || "index").slice(0, 120);
}

const ASSET_EXT = {
  images: ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"],
  icons: ["ico", "svg"],
  fonts: ["woff2", "woff", "ttf", "otf", "eot"],
  css: ["css"],
  documents: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip"],
};
function extOf(url) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    const m = p.match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
  } catch { return ""; }
}
function classify(url) {
  const ext = extOf(url);
  for (const [type, exts] of Object.entries(ASSET_EXT)) {
    if (exts.includes(ext)) {
      let t = type;
      if (type === "images" && /logo/i.test(url)) t = "logos";
      if (type === "icons" && ext === "svg" && /logo/i.test(url)) t = "logos";
      return { type: t, ext, folderKey: t };
    }
  }
  return null;
}

// ---- HTML asset/link extraction ----
function extractFromHtml(html, baseUrl) {
  const links = new Set();
  const assets = new Set();

  const attrRe = /\b(?:src|data-src|data-lazy-src|href|content|poster)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = attrRe.exec(html))) {
    const u = abs(m[1], baseUrl);
    if (!u) continue;
    if (classify(u)) assets.add(u);
    else if (sameHost(u) && /\.(html?|php)?$/i.test(new URL(u).pathname) && !/\/wp-(admin|json)\b/.test(u)) {
      links.add(u);
    }
  }
  // srcset / data-srcset (comma-separated "url size")
  const srcsetRe = /\b(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/gi;
  while ((m = srcsetRe.exec(html))) {
    for (const part of m[1].split(",")) {
      const u = abs(part.trim().split(/\s+/)[0], baseUrl);
      if (u && classify(u)) assets.add(u);
    }
  }
  // inline style url(...)
  const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  while ((m = urlRe.exec(html))) {
    const u = abs(m[1], baseUrl);
    if (u && classify(u)) assets.add(u);
  }
  return { links: [...links], assets: [...assets] };
}
function extractCssUrls(css, cssUrl) {
  const out = new Set();
  const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  let m;
  while ((m = urlRe.exec(css))) {
    if (m[1].startsWith("data:")) continue;
    const u = abs(m[1], cssUrl);
    if (u && classify(u)) out.add(u);
  }
  return [...out];
}

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); } catch { return fallback; }
}
function writeJson(p, obj) {
  fs.writeFileSync(path.join(ROOT, p), JSON.stringify(obj, null, 2));
}

async function pool(items, worker, concurrency = CONCURRENCY) {
  let i = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

// ---------------- DISCOVER ----------------
async function discover() {
  const pages = new Set(seedRoutes.map((r) => abs(r, BASE)));
  const sitemaps = [`${BASE}/?sitemap.xml`, `${BASE}/sitemap.xml`, `${BASE}/sitemap_index.xml`];
  const seen = new Set();
  let combinedXml = "";

  async function pullSitemap(url, depth = 0) {
    if (depth > 3 || seen.has(url)) return;
    seen.add(url);
    const r = await fetchRes(url);
    if (!r.ok || !r.text) return;
    combinedXml += `\n<!-- ${url} -->\n` + r.text;
    const locs = [...r.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((x) => x[1]);
    for (const loc of locs) {
      if (/\.xml(\?|$)/i.test(loc)) await pullSitemap(loc, depth + 1);
      else if (sameHost(loc)) pages.add(loc.split("#")[0]);
    }
  }
  for (const s of sitemaps) await pullSitemap(s);

  const list = [...pages].slice(0, MAX_PAGES);
  fs.writeFileSync(path.join(ROOT, "scrape/sitemap.xml"), combinedXml.trim() || "<!-- none -->");
  writeJson("scrape/urls.json", list);
  console.log(`DISCOVER: ${list.length} page URLs (from sitemap + ${seedRoutes.length} seeds).`);
  return list;
}

// ---------------- CRAWL ----------------
async function crawl() {
  let urls = readJson("scrape/urls.json", null);
  if (!urls) urls = await discover();

  const manifest = {}; // assetUrl -> { type, localPath, bytes, status, sourcePage }
  const usedPaths = new Set();
  const cssToParse = new Set();
  const pageReport = { found: urls.length, fetched: 0, failed: [] };

  function planLocalPath(url, type) {
    const folder = DIRS[type] || DIRS.images;
    let name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "asset");
    name = name.replace(/[^a-z0-9._-]+/gi, "-");
    if (!name || name === "-") name = "asset-" + crypto.createHash("md5").update(url).digest("hex").slice(0, 8);
    let local = path.join(folder, name);
    if (usedPaths.has(local)) {
      const h = crypto.createHash("md5").update(url).digest("hex").slice(0, 6);
      local = path.join(folder, h + "-" + name);
    }
    usedPaths.add(local);
    return local;
  }

  // 1) Fetch pages, collect assets
  await pool(urls, async (pageUrl) => {
    const r = await fetchRes(pageUrl);
    if (!r.ok || !r.text) { pageReport.failed.push({ url: pageUrl, status: r.status }); return; }
    pageReport.fetched++;
    fs.writeFileSync(path.join(ROOT, DIRS.raw, slugForRoute(pageUrl) + ".html"), r.text);
    const { assets } = extractFromHtml(r.text, pageUrl);
    for (const a of assets) {
      if (!sameHost(a)) continue;
      const c = classify(a);
      if (!c) continue;
      if (c.type === "css") cssToParse.add(a);
      if (!manifest[a]) manifest[a] = { type: c.type, sourcePage: pageUrl, status: "pending" };
    }
    process.stdout.write(".");
  });
  console.log(`\nPages fetched: ${pageReport.fetched}/${pageReport.found}. Assets queued: ${Object.keys(manifest).length}`);

  // 2) Download CSS first, parse for fonts/bg-images
  const cssList = [...cssToParse];
  await pool(cssList, async (cssUrl) => {
    const r = await fetchRes(cssUrl, { asBuffer: false });
    const entry = manifest[cssUrl];
    if (!r.ok || r.text == null) { if (entry) entry.status = "failed:" + r.status; return; }
    const local = planLocalPath(cssUrl, "css");
    fs.writeFileSync(path.join(ROOT, local), r.text);
    Object.assign(entry, { localPath: local.replace(/\\/g, "/"), bytes: Buffer.byteLength(r.text), status: "ok" });
    for (const sub of extractCssUrls(r.text, cssUrl)) {
      if (!sameHost(sub)) continue;
      const c = classify(sub);
      if (c && !manifest[sub]) manifest[sub] = { type: c.type, sourcePage: cssUrl, status: "pending" };
    }
  });

  // 3) Download all remaining binary assets
  const pending = Object.keys(manifest).filter((u) => manifest[u].status === "pending");
  await pool(pending, async (url) => {
    const entry = manifest[url];
    const r = await fetchRes(url, { asBuffer: true });
    if (!r.ok || !r.buf) { entry.status = "failed:" + (r.status || r.error || "err"); return; }
    if (r.buf.length > MAX_ASSET_BYTES) { entry.status = "skipped:too-large"; entry.bytes = r.buf.length; return; }
    const local = planLocalPath(url, entry.type);
    fs.writeFileSync(path.join(ROOT, local), r.buf);
    entry.localPath = local.replace(/\\/g, "/");
    entry.bytes = r.buf.length;
    entry.status = "ok";
  });

  writeJson("scrape/manifest.json", manifest);
  writeJson("scrape/crawl-report.json", pageReport);
  summarize(manifest, pageReport);
}

// ---------------- VERIFY (retry failed) ----------------
async function verify() {
  const manifest = readJson("scrape/manifest.json", {});
  const usedPaths = new Set(Object.values(manifest).map((e) => e.localPath).filter(Boolean));
  const failed = Object.keys(manifest).filter((u) => /^failed/.test(manifest[u].status || ""));
  console.log(`VERIFY: retrying ${failed.length} failed assets...`);
  await pool(failed, async (url) => {
    const entry = manifest[url];
    const r = await fetchRes(url, { asBuffer: entry.type !== "css", retries: 2 });
    if (!r.ok) { entry.status = "failed:" + (r.status || r.error || "err"); return; }
    const folder = DIRS[entry.type] || DIRS.images;
    let name = (new URL(url).pathname.split("/").pop() || "asset").replace(/[^a-z0-9._-]+/gi, "-");
    let local = path.join(folder, name);
    if (usedPaths.has(local)) local = path.join(folder, crypto.createHash("md5").update(url).digest("hex").slice(0, 6) + "-" + name);
    usedPaths.add(local);
    const data = entry.type === "css" ? r.text : r.buf;
    fs.writeFileSync(path.join(ROOT, local), data);
    entry.localPath = local.replace(/\\/g, "/");
    entry.bytes = entry.type === "css" ? Buffer.byteLength(r.text) : r.buf.length;
    entry.status = "ok";
  });
  writeJson("scrape/manifest.json", manifest);
  summarize(manifest, readJson("scrape/crawl-report.json", {}));
}

function summarize(manifest, pageReport) {
  const byType = {};
  let ok = 0, bad = 0, bytes = 0;
  for (const e of Object.values(manifest)) {
    byType[e.type] = byType[e.type] || { total: 0, ok: 0, bytes: 0 };
    byType[e.type].total++;
    if (e.status === "ok") { ok++; byType[e.type].ok++; byType[e.type].bytes += e.bytes || 0; bytes += e.bytes || 0; }
    else bad++;
  }
  const mb = (bytes / 1048576).toFixed(1);
  console.log("\n===== HARVEST SUMMARY =====");
  console.log(`Pages: fetched ${pageReport.fetched}/${pageReport.found}, failed ${pageReport.failed?.length || 0}`);
  console.log(`Assets: ${ok} ok, ${bad} failed/skipped, ${mb} MB total`);
  for (const [t, s] of Object.entries(byType)) {
    console.log(`  ${t.padEnd(10)} ${s.ok}/${s.total} ok  (${(s.bytes / 1048576).toFixed(1)} MB)`);
  }
  // human-readable manifest
  const lines = ["# BVCITS Asset Manifest\n", `Generated ${new Date().toISOString()}\n`,
    `Pages fetched: ${pageReport.fetched}/${pageReport.found} · Assets ok: ${ok} · Total: ${mb} MB\n`,
    "| Type | OK / Total | Size |", "|---|---|---|"];
  for (const [t, s] of Object.entries(byType)) lines.push(`| ${t} | ${s.ok}/${s.total} | ${(s.bytes / 1048576).toFixed(1)} MB |`);
  lines.push("\n## Failed / skipped\n");
  for (const [u, e] of Object.entries(manifest)) if (e.status !== "ok") lines.push(`- \`${e.status}\` ${u}`);
  fs.writeFileSync(path.join(ROOT, "docs/ASSET-MANIFEST.md"), lines.join("\n"));
}

const cmd = process.argv[2] || "crawl";
if (cmd === "discover") await discover();
else if (cmd === "crawl") await crawl();
else if (cmd === "verify") await verify();
else console.log("unknown command:", cmd);
