// Extract exact homepage content from the mirrored HTML.
import fs from "node:fs";

const h0 = fs.readFileSync("scrape/raw/index.html", "utf8");
const h = h0.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");

const clean = (s) =>
  s.replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8211;/g, "-").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/\s+/g, " ").trim();

const tags = (tag, limit = 40) => {
  const out = [...h.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))]
    .map((m) => clean(m[1])).filter((t) => t && t.length < 200);
  return [...new Set(out)].slice(0, limit);
};

console.log("=== H1 ===");
console.log(tags("h1").join("\n"));
console.log("\n=== H2 ===");
console.log(tags("h2", 35).join("\n"));
console.log("\n=== H3 ===");
console.log(tags("h3", 35).join("\n"));

// counters: elementor counter widgets
console.log("\n=== COUNTERS (elementor-counter) ===");
const counters = [...h.matchAll(/data-to-value="([^"]+)"[^>]*>/gi)].map((m) => m[1]);
console.log(counters.join(" | "));
const suffixes = [...h.matchAll(/class="elementor-counter-number-suffix"[^>]*>([\s\S]{0,40}?)</gi)].map((m) => clean(m[1]));
console.log("suffixes:", suffixes.join(" | "));
const titles = [...h.matchAll(/class="elementor-counter-title"[^>]*>([\s\S]{0,80}?)</gi)].map((m) => clean(m[1]));
console.log("titles:", titles.join(" | "));

// marquee / notices
console.log("\n=== TICKER / NOTICES ===");
const marq = [...h.matchAll(/<marquee[^>]*>([\s\S]*?)<\/marquee>/gi)].map((m) => clean(m[1]));
console.log(marq.slice(0, 5).join("\n---\n").slice(0, 1200));
