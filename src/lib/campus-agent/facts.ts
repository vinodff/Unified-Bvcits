// Fact sheets handed to the language model.
//
// This is the grounding boundary. The model receives ONLY what these functions emit and is
// told it may not add anything. Links, phone numbers and action cards are never taken from
// the model's output — they come from the deterministic layer — so a fabricated link or a
// fabricated contact is structurally impossible, not merely discouraged.
//
// Keep every line here traceable to src/data/*. If a fact is not in a real source it does
// not belong in a fact sheet.

import {
  BVCITS_META,
  BUS_ROUTES,
  FEE_STRUCTURE,
  HOD_DIRECTORY,
  PLACEMENT_TOPPERS,
  RECRUITER_OFFERS,
} from "@/data/bvcits-bot-knowledge";
import type { DeptEntity, Topic } from "./types";

/** Facts true of the institution regardless of the question. Always included. */
function institutionFacts(): string[] {
  return [
    `College: ${BVCITS_META.institutionName}, ${BVCITS_META.campusLocation}`,
    `Status: ${BVCITS_META.accreditation}`,
    `Counselling code: ${BVCITS_META.counsellingCode}`,
    `Phone: ${BVCITS_META.admissionsHelpline} · Email: ${BVCITS_META.email}`,
    `Campus: ${BVCITS_META.campusSize}, ${BVCITS_META.facultyStrength}`,
  ];
}

function departmentFacts(dept: DeptEntity): string[] {
  const { hod } = dept;
  const lines = [
    `Department: ${hod.department}`,
    `Sanctioned intake: ${hod.intake} seats`,
    `Office hours: ${hod.officeHours}`,
  ];

  if (hod.verified) {
    lines.push(`Head of department: ${hod.hodName}${hod.designation ? ` (${hod.designation})` : ""}`);
  } else {
    // Stated explicitly so the model reports the gap instead of filling it.
    lines.push(
      `Head of department: NOT PUBLISHED. Do not name anyone. Tell the caller the college office will connect them.`,
    );
  }

  if (hod.facultyCount > 0) lines.push(`Faculty in this department: ${hod.facultyCount}`);
  return lines;
}

function feeFacts(dept?: DeptEntity): string[] {
  const rows = dept
    ? FEE_STRUCTURE.filter((f) => f.appliesTo.includes(dept.key))
    : FEE_STRUCTURE.filter((f) => f.appliesTo.includes("btech"));

  const chosen = rows.length > 0 ? rows : [FEE_STRUCTURE[0]];
  const lines = chosen.map(
    (f) => `${f.program} — ${f.tuitionFeePerYear}. ${f.jvdReimbursement}. ${f.notes}`,
  );

  const hostel = FEE_STRUCTURE.find((f) => f.appliesTo.includes("hostel"));
  if (hostel) lines.push(`Hostel: ${hostel.tuitionFeePerYear}. ${hostel.notes}`);
  lines.push("Bus fare: Rs 12,000 to Rs 22,000 per year depending on distance.");
  return lines;
}

function placementFacts(): string[] {
  return [
    `Total: ${BVCITS_META.totalPlacements2026}`,
    `Average package: ${BVCITS_META.averagePlacementPackage}`,
    ...PLACEMENT_TOPPERS.map(
      (t) => `${t.name} (${t.branch}, roll ${t.roll}) — ${t.package} at ${t.recruiter}`,
    ),
    `Recruiter packages: ${RECRUITER_OFFERS.map((o) => `${o.company} ${o.pkg}`).join(", ")}`,
  ];
}

function admissionFacts(): string[] {
  return [
    `Entry route: AP EAPCET counselling, enter code ${BVCITS_META.counsellingCode}.`,
    `Lateral entry (diploma holders) via AP ECET into 2nd year.`,
    `MBA and MCA admission via AP ICET.`,
    `Management quota available for direct admission on Intermediate marks.`,
    `Admissions helpline: ${BVCITS_META.admissionsHelpline}`,
  ];
}

function transportFacts(): string[] {
  return BUS_ROUTES.map((r) => `${r.routeName}: ${r.stops.join(", ")} — ${r.annualFee}`);
}

function courseFacts(): string[] {
  return Object.values(HOD_DIRECTORY)
    .filter((h) => h.intake > 0)
    .map((h) => `${h.department} — ${h.intake} seats`);
}

/**
 * Facts for a resolved topic. `unknown` deliberately returns a broad sheet: an off-script
 * question is exactly where a purely templated reply sounded generic, so the model is given
 * enough real material to answer properly rather than deflecting.
 */
export function buildFactSheet(topic: Topic, dept?: DeptEntity): string {
  const sections: string[] = [...institutionFacts()];

  if (dept) sections.push("", ...departmentFacts(dept));

  switch (topic) {
    case "fees":
      sections.push("", ...feeFacts(dept));
      break;
    case "placements":
      sections.push("", ...placementFacts());
      break;
    case "admissions":
    case "intake":
      sections.push("", ...admissionFacts(), "", ...courseFacts());
      break;
    case "transport":
      sections.push("", ...transportFacts());
      break;
    case "hostel":
      sections.push("", ...feeFacts(dept).filter((l) => l.startsWith("Hostel")));
      break;
    case "courses":
      sections.push("", ...courseFacts());
      break;
    case "hod_contact":
    case "appointment":
    case "faculty":
      if (!dept) sections.push("", ...courseFacts());
      break;
    case "library":
      // No verified volume count exists in our sources, so none is offered here.
      sections.push("", "Central digital library with books and IEEE/Springer e-journals.");
      break;
    case "unknown":
      sections.push(
        "",
        ...courseFacts(),
        "",
        ...feeFacts(),
        "",
        ...placementFacts(),
        "",
        ...admissionFacts(),
      );
      break;
    default:
      break;
  }

  return sections.filter(Boolean).join("\n");
}

/**
 * Every number that appears in the grounded facts, normalised for comparison.
 * Used to reject a model reply that states a figure we never supplied.
 */
export function extractNumbers(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/\d[\d,]*/g)) {
    // Strip separators so "43,000" and "43000" compare equal.
    const normalized = match[0].replace(/,/g, "");
    if (normalized.length > 0) found.add(normalized);
  }
  return found;
}
