// Guided intake — the question script the studio walks an admin through before
// any agent runs.
//
// The problem this solves: creating a campaign only captured a title, and the
// Generate button ran the whole pipeline immediately. The agents then had one
// fact to work from, so the "grounded" output was mostly boilerplate. Content
// quality is bounded by intake quality, and intake was one field.
//
// Required fields come from REQUIRED_FIELDS in context-agent.ts rather than a
// second hand-written list, so a campaign type that gains a requirement gains
// the question automatically. Everything after the required set is optional and
// explicitly skippable — an admin who does not know the chief guest should not
// be blocked, but should have been asked.

import type { CampaignFact, CampaignType } from "../domain";
import { FACT_LABELS, REQUIRED_FIELDS, detectMissingFields } from "./context-agent";

/** How the answer should be captured, so the UI renders the right control. */
export type IntakeInputKind = "text" | "longtext" | "date" | "time" | "number" | "list" | "photos";

export interface IntakeStep {
  field: string;
  /** The question, phrased conversationally. */
  prompt: string;
  /** Shown under the prompt when the field needs explaining. */
  help?: string;
  kind: IntakeInputKind;
  placeholder?: string;
  required: boolean;
}

/**
 * Fact key holding the fields the admin explicitly skipped.
 *
 * Without this, a skipped optional field is indistinguishable from an
 * unanswered one and the wizard would ask about the chief guest forever. It is
 * stored as an ordinary fact so it survives in campaign_facts with everything
 * else — no parallel state to keep in sync.
 */
export const SKIPPED_FIELDS_KEY = "skippedFields";

/**
 * Fact key holding the admin's original free-text brief, verbatim.
 *
 * The interview opens by asking the admin to describe the event in their own
 * words; extraction then fills in whatever it can recognise and the wizard only
 * asks about what is left. Storing the raw brief does two jobs: it marks the
 * describe phase complete (so a brief that yielded few facts still advances),
 * and it preserves the admin's own wording as provenance for anything a later
 * reviewer wants to check against.
 */
export const INTAKE_BRIEF_KEY = "intakeBrief";

/**
 * Campaign types where no photograph can exist yet, so requiring one would
 * deadlock the wizard. Everything else describes something that already
 * happened and must ship with a real photograph.
 */
const PHOTO_EXEMPT_TYPES: ReadonlySet<CampaignType> = new Set([
  "admission_announcement",
  "exam_announcement",
]);

/** Types where a prize breakdown is worth asking about. */
const PRIZE_TYPES: ReadonlySet<CampaignType> = new Set([
  "hackathon",
  "sports",
  "cultural_event",
  "award",
  "student_achievement",
]);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Whether generation should be blocked until a photograph is uploaded.
 *
 * Exempt types are waived outright. Everything else is waived only while the
 * event is still in the future — an admin promoting next month's fest has
 * nothing to upload yet, but the moment the date has passed a real photograph
 * is the difference between a publishable post and a template.
 */
export function photosRequired(type: CampaignType, facts: CampaignFact[]): boolean {
  if (PHOTO_EXEMPT_TYPES.has(type)) return false;
  const date = factValue(facts, "date");
  if (typeof date === "string" && date.slice(0, 10) > todayIso()) return false;
  return true;
}

/** Per-field question copy. Falls back to FACT_LABELS for anything unlisted. */
const PROMPTS: Record<string, { prompt: string; help?: string; kind: IntakeInputKind; placeholder?: string }> = {
  title: {
    prompt: "What is the official name of the event?",
    help: "Use the name exactly as it appears on the banner or notice — it goes into the headline and the URL.",
    kind: "text",
    placeholder: "e.g. Innovate 2026 — National Level Hackathon",
  },
  date: {
    prompt: "What date did it happen (or when will it)?",
    kind: "date",
  },
  startTime: { prompt: "What time does it start?", kind: "time" },
  endTime: { prompt: "And what time does it end?", kind: "time" },
  venue: {
    prompt: "Where is it being held?",
    kind: "text",
    placeholder: "e.g. Main Auditorium, BVCITS Campus",
  },
  description: {
    prompt: "In a sentence or two, what is it about?",
    help: "Plain facts are enough — the writing agent handles the phrasing.",
    kind: "longtext",
    placeholder: "A 36-hour hackathon for students across Andhra Pradesh…",
  },
  chiefGuest: {
    prompt: "Who is the chief guest?",
    help: "Include their title and organisation. Leave blank if there isn't one.",
    kind: "text",
    placeholder: "e.g. Dr A. Ramesh, Director, APSSDC",
  },
  guests: { prompt: "Any other notable guests?", kind: "list", placeholder: "Separate names with commas" },
  organizers: {
    prompt: "Who organised it?",
    kind: "list",
    placeholder: "e.g. Department of CSE, IIC",
  },
  participants: {
    prompt: "How many people took part?",
    kind: "number",
    placeholder: "e.g. 480",
  },
  winners: {
    prompt: "Who won?",
    help: "Names and prize positions. This is published as fact, so check the spelling.",
    kind: "longtext",
    placeholder: "1st: Team Cipher (CSE) · 2nd: Team Nova (ECE)",
  },
  prizes: {
    prompt: "What were the prizes for each position?",
    help: "First, second, third — cash amounts or trophies. Published as fact, so check the figures.",
    kind: "list",
    placeholder: "1st prize: ₹50,000 · 2nd prize: ₹25,000",
  },
  departments: {
    prompt: "Which departments were involved?",
    kind: "list",
    placeholder: "e.g. CSE, ECE, AI & DS",
  },
  achievements: {
    prompt: "What were the key achievements?",
    kind: "longtext",
    placeholder: "What is genuinely worth announcing?",
  },
  statistics: {
    prompt: "Any numbers worth highlighting?",
    kind: "longtext",
    placeholder: "e.g. 1256 offers, 58 recruiters, 38 LPA highest package",
  },
  websiteUrl: { prompt: "Is there a page or registration link?", kind: "text", placeholder: "https://…" },
};

/**
 * Optional fields offered after the required ones, in the order an admin would
 * naturally recall them. Fields already required for the type are filtered out
 * so nothing is asked twice.
 */
const OPTIONAL_TAIL = [
  "venue",
  "description",
  "chiefGuest",
  "organizers",
  "participants",
  "departments",
  "winners",
  "statistics",
  "websiteUrl",
];

function stepFor(field: string, required: boolean): IntakeStep {
  const copy = PROMPTS[field];
  return {
    field,
    prompt: copy?.prompt ?? `What is the ${FACT_LABELS[field] ?? field}?`,
    help: copy?.help,
    kind: copy?.kind ?? "text",
    placeholder: copy?.placeholder,
    required,
  };
}

/**
 * The full ordered script for a campaign type: required questions, then
 * optional ones, then photos last — an admin gathers files more slowly than
 * they type, so asking for them first stalls the whole flow.
 */
export function buildIntakeScript(type: CampaignType, facts: CampaignFact[] = []): IntakeStep[] {
  const required = REQUIRED_FIELDS[type] ?? ["title"];
  const steps = required.map((f) => stepFor(f, true));

  const optional = PRIZE_TYPES.has(type)
    ? // Prizes sit next to winners: an admin listing who won is already
      // thinking about placements, so asking straight after is natural.
      OPTIONAL_TAIL.flatMap((f) => (f === "winners" ? [f, "prizes"] : [f]))
    : OPTIONAL_TAIL;

  for (const field of optional) {
    if (!required.includes(field)) steps.push(stepFor(field, false));
  }

  const needsPhotos = photosRequired(type, facts);
  steps.push({
    field: "photos",
    prompt: needsPhotos ? "Upload the photographs from the event." : "Do you have any photos to include?",
    help: needsPhotos
      ? "At least one real photograph is required before generation can start. The creative agent composes them into posters — it never generates people or fabricates a scene."
      : "This campaign is dated in the future, so photos are optional for now.",
    kind: "photos",
    required: needsPhotos,
  });

  return steps;
}

function factValue(facts: CampaignFact[], field: string): CampaignFact["value"] | undefined {
  return facts.find((f) => f.field === field)?.value;
}

function hasAnswer(facts: CampaignFact[], field: string): boolean {
  const value = factValue(facts, field);
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Fields the admin chose to skip. */
export function skippedFields(facts: CampaignFact[]): string[] {
  const value = factValue(facts, SKIPPED_FIELDS_KEY);
  return Array.isArray(value) ? value.map(String) : [];
}

/**
 * Stage of the interview.
 *
 * `describe` — the admin types a free-text brief in their own words.
 * `gaps`     — the agent asks only about what extraction could not find.
 * `photos`   — the upload gate.
 * `confirm`  — review everything, then proceed to generation.
 */
export type IntakePhase = "describe" | "gaps" | "photos" | "confirm";

export interface IntakeState {
  phase: IntakePhase;
  /** The question to ask now, or null when the script is exhausted. */
  step: IntakeStep | null;
  /** Required fields still unanswered — the pipeline is blocked while non-empty. */
  missingRequired: string[];
  answered: number;
  total: number;
  /** True when a photograph must exist before generation may run. */
  photosRequired: boolean;
  photoCount: number;
  /** True when every required field has an answer and the photo gate is met. */
  canGenerate: boolean;
}

/** Has the admin submitted their opening free-text brief yet? */
export function briefProvided(facts: CampaignFact[]): boolean {
  const value = factValue(facts, INTAKE_BRIEF_KEY);
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Where the interview has got to.
 *
 * `canGenerate` depends on REQUIRED_FIELDS plus the photo gate. Optional
 * questions improve the output but must never block an admin who genuinely has
 * nothing more to give — the photo gate is the one deliberate exception,
 * because copy written about an event with no photograph of it is the exact
 * template output this interview exists to prevent.
 */
export function intakeState(
  facts: CampaignFact[],
  type: CampaignType,
  assetCount = 0
): IntakeState {
  const script = buildIntakeScript(type, facts);
  const skipped = new Set(skippedFields(facts));
  const needsPhotos = photosRequired(type, facts);

  const isDone = (step: IntakeStep): boolean =>
    step.field === "photos"
      ? assetCount > 0 || (!needsPhotos && skipped.has("photos"))
      : hasAnswer(facts, step.field) || skipped.has(step.field);

  const step = script.find((s) => !isDone(s)) ?? null;
  const answered = script.filter(isDone).length;
  const missingRequired = detectMissingFields(facts, type);
  const photoGateMet = !needsPhotos || assetCount > 0;

  const phase: IntakePhase = !briefProvided(facts)
    ? "describe"
    : step && step.field !== "photos"
      ? "gaps"
      : step?.field === "photos"
        ? "photos"
        : "confirm";

  return {
    phase,
    step,
    missingRequired,
    answered,
    total: script.length,
    photosRequired: needsPhotos,
    photoCount: assetCount,
    canGenerate: missingRequired.length === 0 && photoGateMet,
  };
}

/**
 * Everything collected, for the verification screen shown before generation.
 * Skipped fields are included with a null value so the admin can see what was
 * passed over and go back rather than discovering the gap in the output.
 */
export interface IntakeSummaryRow {
  field: string;
  label: string;
  value: string | null;
  required: boolean;
  skipped: boolean;
}

export function intakeSummary(
  facts: CampaignFact[],
  type: CampaignType,
  assetCount = 0
): IntakeSummaryRow[] {
  const skipped = new Set(skippedFields(facts));

  return buildIntakeScript(type, facts).map((step) => {
    const isPhotos = step.field === "photos";
    const raw = isPhotos ? (assetCount > 0 ? `${assetCount} photo${assetCount === 1 ? "" : "s"}` : null) : factValue(facts, step.field);

    const value =
      raw === undefined || raw === null || raw === ""
        ? null
        : Array.isArray(raw)
          ? raw.join(", ")
          : String(raw);

    return {
      field: step.field,
      label: FACT_LABELS[step.field] ?? (isPhotos ? "photos" : step.field),
      value,
      required: step.required,
      skipped: skipped.has(step.field) && value === null,
    };
  });
}
