// Extract REAL department content from mirrored HTML into src/data/scraped-departments.json
import fs from "node:fs";
import path from "node:path";

const RAW = "scrape/raw";
const FILES = {
  "computer-science-engineering": "departments-computer-science-engineering.html",
  "ai-ds-new": "departments-ai-ds-new.html",
  "cse-artificial-intelligence-machine-learning": "departments-cse-artificial-intelligence-machine-learning.html",
  "electronics-communication-engineering": "departments-electronics-communication-engineering.html",
  "electrical-electronics-engineering": "departments-electrical-electronics-engineering.html",
  "mechanical-engineering": "departments-mechanical-engineering.html",
  "civil-engineering": "departments-civil-engineering.html",
  "master-of-business-administration": "departments-master-of-business-administration.html",
  "masters-in-computer-application": "departments-masters-in-computer-application.html",
  "science-humanities": "science-humanities.html",
};

const ent = (s) =>
  s.replace(/&#8217;|&#8216;|&rsquo;|&lsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, "-").replace(/&#8212;|&mdash;/g, "—")
    .replace(/&amp;|&#038;/g, "&").replace(/&nbsp;|&#160;/g, " ")
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const strip = (s) => ent(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const NAV_NOISE = /^(home|about us|academics|admissions|departments|examinations|placements|student resources|iqac|polytechnic|nirf|feedback|apply|call|menu|search|read more|view all|toggle|close|next|previous)$/i;

function blocks(html, tag) {
  return [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))]
    .map((m) => strip(m[1]))
    .filter((t) => t && t.length > 1 && !NAV_NOISE.test(t));
}

// Pull the main content region (drop header/nav/footer noise)
function mainRegion(html) {
  let h = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  h = h.replace(/<nav[\s\S]*?<\/nav>/gi, " ").replace(/<header[\s\S]*?<\/header>/gi, " ").replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  return h;
}

// Section-aware paragraph harvest: find a heading, take paragraphs after it
function afterHeading(h, re, maxChars = 2200) {
  const m = h.search(re);
  if (m < 0) return [];
  const seg = h.slice(m, m + maxChars);
  return blocks(seg, "p").filter((p) => p.length > 40).slice(0, 6);
}

function listAfterHeading(h, re, maxChars = 2600) {
  const m = h.search(re);
  if (m < 0) return [];
  const seg = h.slice(m, m + maxChars);
  return blocks(seg, "li").filter((t) => t.length > 18 && t.length < 400).slice(0, 8);
}

// Faculty tables: rows with a name-ish first cell
function facultyRows(h) {
  const out = [];
  for (const t of h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...t[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1]));
    if (cells.length < 2) continue;
    const joined = cells.join(" ").toLowerCase();
    if (/s\.?\s*no|name of the faculty|designation|qualification/.test(joined) && cells.length <= 5 && !/^\d+$/.test(cells[0])) continue;
    const named = cells.find((c) => /^(dr|mr|ms|mrs|prof)\.?\s+\S/i.test(c) || /^[A-Z]\.\s?[A-Z]/.test(c));
    if (!named) continue;
    const rest = cells.filter((c) => c !== named && c.length > 1 && !/^\d+$/.test(c));
    out.push({
      name: named,
      designation: rest.find((r) => /prof|assoc|assist|head|hod|lect/i.test(r)) || rest[0] || null,
      qualification: rest.find((r) => /ph\.?d|m\.?tech|m\.?sc|mba|mca|b\.?tech|m\.?e\b/i.test(r)) || null,
    });
  }
  const seen = new Set();
  return out.filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true)));
}

const result = {};
for (const [slug, file] of Object.entries(FILES)) {
  const p = path.join(RAW, file);
  if (!fs.existsSync(p)) { result[slug] = { _note: "page not mirrored" }; continue; }
  const raw = fs.readFileSync(p, "utf8");
  const h = mainRegion(raw);

  const h1 = blocks(h, "h1")[0] || null;
  const allP = blocks(h, "p").filter((t) => t.length > 60);
  const heads = [...blocks(h, "h2"), ...blocks(h, "h3"), ...blocks(h, "h4")];

  const vision = afterHeading(h, /Vision/i, 1200)[0] || null;
  const mission = listAfterHeading(h, /Mission/i);
  const missionP = mission.length ? mission : afterHeading(h, /Mission/i, 1400).slice(0, 4);

  // HOD block
  const hodIdx = h.search(/Head\s+of\s+the\s+Department|HOD|Head of Department/i);
  let hod = null;
  if (hodIdx >= 0) {
    const seg = h.slice(hodIdx, hodIdx + 2500);
    const nameM = seg.match(/\b((?:Dr|Mr|Ms|Mrs|Prof)\.?\s+[A-Z][A-Za-z.\s]{2,40})/);
    const msg = blocks(seg, "p").filter((t) => t.length > 60).slice(0, 3);
    if (nameM || msg.length) hod = { name: nameM ? nameM[1].trim() : null, designation: null, message: msg };
  }

  const faculty = facultyRows(h);
  const peos = listAfterHeading(h, /Programme?\s+Educational\s+Objectives|PEO/i);
  const psos = listAfterHeading(h, /Programme?\s+Specific\s+Outcomes|PSO/i);
  const labs = listAfterHeading(h, /Laborator|Infrastructur|Facilit/i);

  const images = [...new Set([...raw.matchAll(/\b(?:data-src|src)\s*=\s*["'](https:\/\/bvcits\.edu\.in[^"']+\.(?:jpe?g|png|webp))["']/gi)].map((m) => m[1]))].slice(0, 12);

  result[slug] = {
    name: h1,
    headings: [...new Set(heads)].slice(0, 25),
    about: allP.slice(0, 5),
    vision,
    mission: missionP,
    hod,
    faculty,
    peos,
    psos,
    labs,
    images,
    _counts: { paragraphs: allP.length, faculty: faculty.length, headings: heads.length },
  };
}

fs.mkdirSync("src/data", { recursive: true });
fs.writeFileSync("src/data/scraped-departments.json", JSON.stringify(result, null, 2));

console.log("=== DEPARTMENT EXTRACTION ===");
for (const [slug, d] of Object.entries(result)) {
  console.log(`\n${slug}`);
  console.log(`  name: ${d.name || "(none)"}`);
  console.log(`  paras:${d._counts?.paragraphs ?? 0} faculty:${d._counts?.faculty ?? 0} heads:${d._counts?.headings ?? 0} vision:${d.vision ? "Y" : "N"} mission:${d.mission?.length ?? 0} hod:${d.hod?.name || "N"}`);
}
