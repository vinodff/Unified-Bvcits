// Collect + download every department sub-page URL found in the mirrored dept pages.
import fs from "node:fs";
import path from "node:path";

const RAW = "scrape/raw";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const urls = new Set();
for (const f of fs.readdirSync(RAW)) {
  if (!/^departments-|^science-humanities/.test(f)) continue;
  const html = fs.readFileSync(path.join(RAW, f), "utf8");
  for (const m of html.matchAll(/href="(https:\/\/bvcits\.edu\.in\/(?:departments\/[^"\/]+|science-humanities)\/[^"]*)"/gi)) {
    const u = m[1].split("#")[0];
    if (/\.(pdf|jpg|png)$/i.test(u)) continue;
    urls.add(u);
  }
}
const list = [...urls];
console.log(`Found ${list.length} department sub-page URLs.`);

const slugOf = (u) => {
  const p = new URL(u).pathname.replace(/^\/|\/$/g, "");
  return p.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 120);
};

let ok = 0, skip = 0, fail = 0;
let i = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < list.length) {
    const u = list[i++];
    const dest = path.join(RAW, slugOf(u) + ".html");
    if (fs.existsSync(dest)) { skip++; continue; }
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25000), redirect: "follow" });
      if (!r.ok) { fail++; continue; }
      fs.writeFileSync(dest, await r.text());
      ok++;
      if (ok % 25 === 0) process.stdout.write(`\r  fetched ${ok}`);
    } catch { fail++; }
  }
}));
console.log(`\nDone. new:${ok} already-had:${skip} failed:${fail}. Raw pages now: ${fs.readdirSync(RAW).length}`);
