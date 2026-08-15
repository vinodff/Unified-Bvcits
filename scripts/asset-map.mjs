// Builds src/data/asset-map.json: original bvcits.edu.in URL -> local /public path.
// Also rewrites any *.json in src/data that contains original URLs (in-place, safe backup).
// Run AFTER scrape.mjs finishes: node scripts/asset-map.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const manifestPath = path.join(ROOT, "scrape/manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("No scrape/manifest.json yet — run the crawl first.");
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const map = {};
for (const [url, e] of Object.entries(manifest)) {
  if (e.status === "ok" && e.localPath) {
    // localPath like "public/assets/images/foo.png" -> web path "/assets/images/foo.png"
    map[url] = "/" + e.localPath.replace(/^public\//, "");
  }
}
fs.mkdirSync(path.join(ROOT, "src/data"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "src/data/asset-map.json"), JSON.stringify(map, null, 2));
console.log(`asset-map.json: ${Object.keys(map).length} URL mappings.`);

// WordPress serves many size variants (e.g. foo-300x200.jpg). Provide a fuzzy
// resolver pass for scraped JSON files: exact match first, then try stripping
// the -WxH suffix and matching the original, then any size variant of same base.
function fuzzyResolve(url) {
  if (map[url]) return map[url];
  const m = url.match(/^(.+?)-\d+x\d+(\.[a-z]+)$/i);
  if (m) {
    const orig = m[1] + m[2];
    if (map[orig]) return map[orig];
  }
  // any variant sharing the same basename stem
  const stem = url.replace(/^https?:\/\/[^/]+/, "").replace(/-\d+x\d+(\.[a-z]+)$/i, "$1");
  for (const [u, p] of Object.entries(map)) {
    if (u.endsWith(stem)) return p;
  }
  return null;
}

const dataDir = path.join(ROOT, "src/data");
let totalRewrites = 0;
for (const f of fs.readdirSync(dataDir)) {
  if (!f.startsWith("scraped-") || !f.endsWith(".json")) continue;
  const p = path.join(dataDir, f);
  let text = fs.readFileSync(p, "utf8");
  const urls = [...new Set(text.match(/https?:\/\/bvcits\.edu\.in[^"\\ )]+/g) || [])];
  let rewrites = 0;
  for (const u of urls) {
    const local = fuzzyResolve(u);
    if (local) {
      text = text.split(u).join(local);
      rewrites++;
    }
  }
  if (rewrites > 0) {
    fs.writeFileSync(p + ".bak", fs.readFileSync(p));
    fs.writeFileSync(p, text);
  }
  totalRewrites += rewrites;
  console.log(`${f}: ${rewrites}/${urls.length} URLs mapped to local assets.`);
}
console.log(`Done. ${totalRewrites} total rewrites.`);
