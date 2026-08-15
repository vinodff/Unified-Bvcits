import fs from "node:fs";
const h0 = fs.readFileSync("scrape/raw/index.html", "utf8");
const h = h0.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
const clean = (s) => s.replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&#8217;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/&#8211;/g, "-").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

// Full visible text stream, then find number-ish tokens with their neighbours
const text = clean(h);
console.log("=== NUMBER TOKENS IN CONTEXT ===");
const re = /([^.?!]{0,70}?)(\b\d[\d,.]*\s*(?:\+|%|LPA|Lakhs?|Acres?|Crore)?)([^.?!]{0,50})/gi;
const seen = new Set();
let m, n = 0;
while ((m = re.exec(text)) && n < 60) {
  const num = m[2].trim();
  if (!/\d/.test(num)) continue;
  const ctx = (m[1] + " [" + num + "] " + m[3]).replace(/\s+/g, " ").trim();
  if (ctx.length < 12) continue;
  const key = num + ctx.slice(-25);
  if (seen.has(key)) continue;
  seen.add(key);
  console.log("  " + ctx.slice(0, 130));
  n++;
}

console.log("\n=== PARAGRAPHS (first 25) ===");
const ps = [...h.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((x) => clean(x[1])).filter((t) => t.length > 25);
[...new Set(ps)].slice(0, 25).forEach((p) => console.log("  • " + p.slice(0, 200)));
