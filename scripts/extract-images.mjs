import fs from "node:fs";
const h = fs.readFileSync("scrape/raw/index.html", "utf8");
const map = JSON.parse(fs.readFileSync("src/data/asset-map.json", "utf8"));

// homepage images in document order with alt text
const out = [];
const re = /<img[^>]*>/gi;
let m;
while ((m = re.exec(h))) {
  const tag = m[0];
  const src = (tag.match(/\b(?:data-src|src)\s*=\s*["']([^"']+)["']/i) || [])[1];
  const alt = (tag.match(/\balt\s*=\s*["']([^"']*)["']/i) || [])[1] || "";
  if (!src || !src.includes("bvcits.edu.in")) continue;
  out.push({ src, alt: alt.slice(0, 60), local: map[src] || null });
}
const seen = new Set();
const uniq = out.filter((o) => (seen.has(o.src) ? false : (seen.add(o.src), true)));
console.log(`homepage images: ${uniq.length}`);
uniq.forEach((o, i) => console.log(`${String(i).padStart(3)} ${o.local ? "LOCAL" : "     "} ${o.src.split("/uploads/")[1] || o.src} | ${o.alt}`));
