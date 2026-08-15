// Phase 1 — replace thumbnail downloads with the TRUE full-resolution originals.
// WordPress serves several derivatives; on this site "-scaled" is often a tiny one.
// For each local asset we probe every plausible source URL, keep the largest, and
// overwrite in place so no import path changes.
import fs from "node:fs";
import path from "node:path";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const MAP = JSON.parse(fs.readFileSync("src/data/asset-map.json", "utf8"));

// local web path -> original remote URL (invert the asset map)
const byLocal = new Map();
for (const [remote, local] of Object.entries(MAP)) {
  if (!byLocal.has(local)) byLocal.set(local, remote);
}

/** Every plausible higher-res variant of a WordPress upload URL. */
function candidates(url) {
  const out = new Set([url]);
  const noSize = url.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1");
  out.add(noSize);
  out.add(noSize.replace(/-scaled(\.[a-z0-9]+)$/i, "$1"));
  out.add(url.replace(/-scaled(\.[a-z0-9]+)$/i, "$1"));
  // "-min" derivatives sometimes have a plain sibling
  out.add(noSize.replace(/-min(\.[a-z0-9]+)$/i, "$1"));
  return [...out];
}

async function head(url) {
  try {
    const r = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000), redirect: "follow" });
    if (!r.ok) return 0;
    return parseInt(r.headers.get("content-length") || "0", 10) || 0;
  } catch { return 0; }
}

async function download(url, dest) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000), redirect: "follow" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

// Only bother with real raster assets under public/assets (skip css/fonts/docs)
const targets = [...byLocal.entries()].filter(([local]) =>
  /^\/assets\/(images|logos|icons)\//.test(local) && /\.(jpe?g|png|webp)$/i.test(local)
);

console.log(`Checking ${targets.length} local images for higher-resolution originals...\n`);

let upgraded = 0, unchanged = 0, failed = 0, bytesBefore = 0, bytesAfter = 0;
let i = 0;

await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (i < targets.length) {
      const [local, remote] = targets[i++];
      const dest = path.join("public", local.replace(/^\//, ""));
      const localSize = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
      bytesBefore += localSize;

      // find the biggest available variant
      let best = { url: null, size: localSize };
      for (const c of candidates(remote)) {
        const s = await head(c);
        if (s > best.size * 1.05) best = { url: c, size: s };
      }

      if (!best.url) { unchanged++; bytesAfter += localSize; continue; }
      try {
        const got = await download(best.url, dest);
        bytesAfter += got;
        upgraded++;
        const name = path.basename(dest);
        console.log(`  ↑ ${name.padEnd(46)} ${(localSize / 1024).toFixed(0).padStart(5)}KB → ${(got / 1024).toFixed(0).padStart(6)}KB`);
      } catch {
        failed++; bytesAfter += localSize;
      }
    }
  })
);

console.log(`\nupgraded: ${upgraded}   unchanged: ${unchanged}   failed: ${failed}`);
console.log(`total image bytes: ${(bytesBefore / 1048576).toFixed(1)} MB → ${(bytesAfter / 1048576).toFixed(1)} MB`);
