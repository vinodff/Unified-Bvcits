// Extract REAL per-department detail (HOD, faculty, vision/mission, PEO/PO/PSO, labs)
// from the mirrored department sub-pages -> src/data/scraped-departments.json
import fs from "node:fs";
import path from "node:path";

const RAW = "scrape/raw";
const DEPTS = {
  "computer-science-engineering": "departments-computer-science-engineering",
  "ai-ds-new": "departments-ai-ds-new",
  "cse-artificial-intelligence-machine-learning": "departments-cse-artificial-intelligence-machine-learning",
  "electronics-communication-engineering": "departments-electronics-communication-engineering",
  "electrical-electronics-engineering": "departments-electrical-electronics-engineering",
  "mechanical-engineering": "departments-mechanical-engineering",
  "civil-engineering": "departments-civil-engineering",
  "master-of-business-administration": "departments-master-of-business-administration",
  "masters-in-computer-application": "departments-masters-in-computer-application",
  "science-humanities": "science-humanities",
};

const ent = (s) => s
  .replace(/&#8217;|&#8216;|&rsquo;|&lsquo;/g, "'").replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
  .replace(/&#8211;|&ndash;/g, "-").replace(/&#8212;|&mdash;/g, "—")
  .replace(/&amp;|&#038;/g, "&").replace(/&nbsp;|&#160;/g, " ")
  .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'");
const strip = (s) => ent(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function clean(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ");
}
const NOISE = /CloudPDF|documentId|getElementById|const config|darkMode/i;

function paras(h, min = 50) {
  return [...h.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => strip(m[1])).filter((t) => t.length > min && !NOISE.test(t));
}
function items(h, min = 15) {
  return [...h.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => strip(m[1]))
    .filter((t) => t.length > min && t.length < 500 && !NOISE.test(t));
}
function read(slug, sub) {
  const p = path.join(RAW, sub ? `${slug}-${sub}.html` : `${slug}.html`);
  return fs.existsSync(p) ? clean(fs.readFileSync(p, "utf8")) : null;
}
const ALL_FILES = fs.readdirSync(RAW);
// Resolve a sub-page: try EXACT candidate slugs first, then a loose pattern.
function findSub(base, re, exact = []) {
  for (const cand of exact) {
    const f = `${base}-${cand}.html`;
    if (ALL_FILES.includes(f)) return clean(fs.readFileSync(path.join(RAW, f), "utf8"));
  }
  // shortest matching filename wins (avoids "faculty-certifications" beating "faculty")
  const matches = ALL_FILES.filter((x) => x.startsWith(base + "-") && re.test(x)).sort((a, b) => a.length - b.length);
  return matches.length ? clean(fs.readFileSync(path.join(RAW, matches[0]), "utf8")) : null;
}
// department code used in their sub-page slugs (cse-hod, eee-hod, ...)
const CODE = {
  "departments-computer-science-engineering": "cse",
  "departments-ai-ds-new": "ai-ds",
  "departments-cse-artificial-intelligence-machine-learning": "aiml",
  "departments-electronics-communication-engineering": "ece",
  "departments-electrical-electronics-engineering": "eee",
  "departments-mechanical-engineering": "mech",
  "departments-civil-engineering": "civil",
  "departments-master-of-business-administration": "mba",
  "departments-masters-in-computer-application": "mca",
  "science-humanities": "sh",
};

function facultyFrom(h) {
  const out = [];
  for (const t of h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...t[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1]));
    if (cells.length < 2) continue;
    const name = cells.find((c) => /^(Dr|Mr|Ms|Mrs|Prof|Sri|Smt)\.?\s+[A-Z]/i.test(c) || /^[A-Z]\.\s?[A-Z][a-z]/.test(c));
    if (!name || name.length > 60) continue;
    const rest = cells.filter((c) => c !== name && c.length > 1 && !/^\d+$/.test(c) && c.length < 90);
    out.push({
      name,
      designation: rest.find((r) => /professor|assoc|assist|head|hod|lecturer/i.test(r)) || null,
      qualification: rest.find((r) => /ph\.?\s?d|m\.?\s?tech|m\.?\s?sc|mba|mca|b\.?\s?tech|m\.?\s?e\b|m\.?\s?a\b/i.test(r)) || null,
    });
  }
  const seen = new Set();
  return out.filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true)));
}

const result = {};
for (const [slug, base] of Object.entries(DEPTS)) {
  const landing = read(base);
  const rec = { slug, name: null, about: [], vision: null, mission: [], hod: null, faculty: [], peos: [], pos: [], psos: [], labs: [], _sources: {} };

  if (landing) {
    rec.name = strip((landing.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "") || null;
    rec.about = paras(landing).slice(0, 4);
    const li = items(landing).filter((t) => !/^(home|about|academics|admission)/i.test(t));
    if (li.length) rec.aboutPoints = li.slice(0, 8);
  }

  // Vision & Mission
  const code = CODE[base] || "";
  const vm = findSub(base, /vision/i, [code+"-vision-and-mission", "vision-and-mission", "vision-mission"]);
  if (vm) {
    rec._sources.visionMission = true;
    const ps = paras(vm, 40);
    const its = items(vm, 20);
    const vIdx = vm.search(/Vision/i);
    const mIdx = vm.search(/Mission/i);
    if (vIdx >= 0) {
      const seg = vm.slice(vIdx, mIdx > vIdx ? mIdx : vIdx + 1600);
      rec.vision = paras(seg, 40)[0] || items(seg, 30)[0] || ps[0] || null;
    }
    if (mIdx >= 0) {
      const seg = vm.slice(mIdx, mIdx + 2600);
      rec.mission = items(seg, 25).slice(0, 6);
      if (!rec.mission.length) rec.mission = paras(seg, 40).slice(0, 4);
    }
    if (!rec.vision && ps.length) rec.vision = ps[0];
    if (!rec.mission.length && its.length) rec.mission = its.slice(0, 5);
  }

  // HOD
  const hodPage = findSub(base, /hod|head-of/i, [code+"-hod", "hod", "head-of-the-department"]);
  if (hodPage) {
    rec._sources.hod = true;
    const ps = paras(hodPage, 50);
    const nameM = hodPage.match(/\b((?:Dr|Mr|Ms|Mrs|Prof)\.?\s+[A-Z][A-Za-z.\s]{2,45}?)(?=\s*(?:<|,|\n|M\.?Tech|Ph\.?D|Professor|Assoc))/);
    const desig = (hodPage.match(/\b(Professor\s*(?:&|and)\s*Head|Assoc(?:iate)?\.?\s*Professor\s*(?:&|and)\s*Head|Head\s+of\s+the\s+Department)/i) || [])[1] || null;
    rec.hod = { name: nameM ? nameM[1].trim().replace(/\s+/g, " ") : null, designation: desig, message: ps.slice(0, 3) };
  }

  // Faculty
  const facPage = findSub(base, /^.*-faculty\.html$/i, ["faculty", "faculty-profile", code+"-staff", "me-staff", code+"-faculty", "faculty-profiles"]);
  if (facPage) {
    rec._sources.faculty = true;
    rec.faculty = facultyFrom(facPage).slice(0, 60);
  }

  // PEO / PO / PSO  (live pages put these in <li> under ALL-CAPS headings)
  const peoPage = findSub(base, /peo/i, ["peo-po-psos", "peo-po-pso", code+"-peo-po-psos"]);
  if (peoPage) {
    rec._sources.peo = true;
    const grab = (re, n) => {
      const i = peoPage.search(re);
      if (i < 0) return [];
      return items(peoPage.slice(i, i + 6000), 25)
        .filter((t) => !/^(home|about|academics|department)/i.test(t))
        .slice(0, n);
    };
    rec.peos = grab(/PROGRAM(?:ME)?\s+EDUCATIONAL\s+OBJECTIVES/i, 5);
    rec.pos = grab(/PROGRAM(?:ME)?\s+OUTCOMES/i, 12);
    rec.psos = grab(/PROGRAM(?:ME)?\s+SPECIFIC\s+OUTCOMES/i, 4);
    if (!rec.peos.length) rec.peos = items(peoPage, 30).filter((t) => /^PEO|graduates? will/i.test(t)).slice(0, 5);
  }

  // Infrastructure / labs (their slug has a typo: "infrastructue")
  const infra = findSub(base, /infrastruct/i, ["infrastructure", "infrastructue", code+"-infrastructure"]);
  if (infra) {
    rec._sources.infrastructure = true;
    rec.labs = items(infra, 15).slice(0, 12);
    if (!rec.labs.length) rec.labs = paras(infra, 40).slice(0, 6);
  }

  result[slug] = rec;
}

fs.writeFileSync("src/data/scraped-departments.json", JSON.stringify(result, null, 2));
console.log("=== REAL DEPARTMENT DATA ===");
for (const [s, d] of Object.entries(result)) {
  console.log(`\n${s}`);
  console.log(`  name    : ${d.name || "-"}`);
  console.log(`  hod     : ${d.hod?.name || "-"} ${d.hod?.designation ? "(" + d.hod.designation + ")" : ""}`);
  console.log(`  faculty : ${d.faculty.length}`);
  console.log(`  vision  : ${d.vision ? d.vision.slice(0, 70) + "..." : "-"}`);
  console.log(`  mission : ${d.mission.length}  peos:${d.peos.length} pos:${d.pos.length} psos:${d.psos.length} labs:${d.labs.length}`);
}
