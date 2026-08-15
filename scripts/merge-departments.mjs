// Clean the scraped department JSON and emit a typed TS module the app consumes.
import fs from "node:fs";

const raw = JSON.parse(fs.readFileSync("src/data/scraped-departments.json", "utf8"));

const HEADER_ROW = /^(s\.?\s*no|sl\.?\s*no|name of|designation|qualification|photo|sno)$/i;
const titleCase = (s) =>
  s.replace(/\s+/g, " ").trim()
    .split(" ")
    .map((w) => (w.length > 2 && w === w.toUpperCase() && /^[A-Z.]+$/.test(w)
      ? w[0] + w.slice(1).toLowerCase() : w))
    .join(" ");

function cleanFaculty(list) {
  const out = [];
  for (const f of list || []) {
    if (!f.name) continue;
    const n = f.name.trim();
    if (HEADER_ROW.test(n) || n.length < 5 || /^name\b/i.test(n)) continue;
    if (f.designation && HEADER_ROW.test(f.designation)) f.designation = null;
    out.push({
      name: titleCase(n),
      designation: f.designation ? titleCase(f.designation) : "Faculty",
      qualification: f.qualification || null,
    });
  }
  const seen = new Set();
  return out.filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true)));
}

// Vision lines on the live site are sometimes prefixed with mission markers (DM1/DM2...)
const stripMarker = (s) => (s || "").replace(/^\s*(DM\s*\d+|M\s*\d+|V\s*\d+)[\s.:-]*/i, "").trim();

// The live vision/mission pages run statements together with DM1/DM2/M1 markers.
// Split on those markers: first chunk = vision, remainder = mission statements.
function splitOnMarkers(v) {
  if (!v) return [];
  return String(v)
    .split(/\s*(?:DM|PM|M|V)\s*\d+[\s.:-]*/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}
function cleanVision(v) {
  const parts = splitOnMarkers(v);
  const s = parts[0] ? stripMarker(parts[0]) : null;
  if (!s) return null;
  if (/^(vision,?\s*mission)/i.test(s)) return null; // page title, not a statement
  return s;
}
function extraMissions(v) {
  return splitOnMarkers(v).slice(1);
}

const result = {};
for (const [slug, d] of Object.entries(raw)) {
  const faculty = cleanFaculty(d.faculty);
  const byDesignation = (re) => faculty.filter((f) => re.test(f.designation || ""));
  result[slug] = {
    name: d.name && !/new$/i.test(d.name) ? d.name : null,
    about: (d.about || []).filter((p) => p.length > 60).slice(0, 3),
    vision: cleanVision(d.vision),
    mission: (() => { const m = (d.mission || []).map(stripMarker).filter((x) => x.length > 25); return (m.length ? m : extraMissions(d.vision)).slice(0, 6); })(),
    hod: d.hod?.name
      ? {
          name: titleCase(d.hod.name.replace(/\s+is\s+(currently\s+serving\s+as|a)\b.*$/i, "").trim()),
          designation: d.hod.designation || null,
          message: (d.hod.message || []).filter((m) => m.length > 60 && !/^note:/i.test(m)).slice(0, 2),
        }
      : null,
    faculty,
    facultyCount: faculty.length,
    professors: byDesignation(/professor/i).length,
    peos: (d.peos || []).map((p) => p.replace(/^PEO\s*\d+\s*/i, "").trim()).filter((p) => p.length > 25).slice(0, 5),
    pos: (d.pos || []).filter((p) => p.length > 25).slice(0, 12),
    psos: (d.psos || []).filter((p) => p.length > 25).slice(0, 4),
    labs: (d.labs || []).filter((l) => l.length > 15).slice(0, 10),
  };
}

fs.writeFileSync("src/data/real-departments.json", JSON.stringify(result, null, 2));

console.log("=== CLEANED REAL DEPARTMENT DATA ===");
let tf = 0;
for (const [s, d] of Object.entries(result)) {
  tf += d.facultyCount;
  console.log(`${s.padEnd(46)} hod:${(d.hod?.name || "-").slice(0, 28).padEnd(29)} fac:${String(d.facultyCount).padStart(3)} vision:${d.vision ? "Y" : "-"} peo:${d.peos.length}`);
}
console.log(`\nTOTAL REAL FACULTY NAMES: ${tf}`);
