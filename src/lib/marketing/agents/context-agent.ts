// Context Completion Agent (spec Section 6).
// Identifies ONLY the missing information required for accurate content, extracts
// answers from natural language, and never re-asks what it already knows.
// Everything extracted from the admin is stored as source: "admin" (authoritative).

import { DEFAULT_BRAND } from "../brand";
import type { CampaignFact, CampaignType, FactSource } from "../domain";

/** Minimum facts required per campaign type before generation may begin. */
export const REQUIRED_FIELDS: Record<CampaignType, string[]> = {
  event: ["title", "date"],
  hackathon: ["title", "date", "winners"],
  workshop: ["title", "date"],
  seminar: ["title", "date"],
  achievement: ["title", "achievements"],
  placement: ["title", "statistics"],
  award: ["title", "achievements", "winners"],
  faculty_achievement: ["title", "achievements"],
  student_achievement: ["title", "achievements", "winners"],
  admission_announcement: ["title"],
  exam_announcement: ["title", "date"],
  campus_news: ["title", "date"],
  research: ["title", "achievements"],
  sports: ["title", "date", "winners"],
  cultural_event: ["title", "date"],
  other: ["title", "date"],
};

export const FACT_LABELS: Record<string, string> = {
  title: "official name of the event",
  date: "date",
  startTime: "start time",
  endTime: "end time",
  venue: "venue",
  description: "short description",
  chiefGuest: "chief guest",
  guests: "guests",
  organizers: "organizers",
  participants: "participation numbers",
  winners: "winners",
  departments: "participating departments",
  achievements: "key achievements",
  statistics: "important statistics",
  websiteUrl: "website link",
};

export interface ExtractResult {
  facts: CampaignFact[];
  answeredFields: string[];
}

const DEPT_MAP: Record<string, string> = Object.fromEntries(
  DEFAULT_BRAND.departments.map((d) => [d.toLowerCase(), d])
);

function fact(field: string, value: CampaignFact["value"], source: FactSource = "admin", confidence = 1): CampaignFact {
  return { field, value, source, confidence, verified: source === "admin" };
}

function norm(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function parseDateToken(token: string): string | null {
  const t = token.toLowerCase();
  if (t === "today") return new Date().toISOString().slice(0, 10);
  if (t === "yesterday") return new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (t === "tomorrow") return new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  // dd-mm-yyyy / dd/mm/yyyy / yyyy-mm-dd
  let m = t.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (m) {
    const [d, mo, y] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
    const year = y < 100 ? 2000 + y : y;
    return `${year}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // month day, year / month day
  m = t.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[.\s]+(\d{1,2})(?:\s*,\s*(\d{2,4}))?/i);
  if (m) {
    const mo = MONTH_SHORT.indexOf(m[1].toLowerCase().slice(0, 3)) + 1;
    const year = m[3] ? (parseInt(m[3]) < 100 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : new Date().getFullYear();
    return `${year}-${String(mo).padStart(2, "0")}-${String(parseInt(m[2])).padStart(2, "0")}`;
  }
  m = t.match(/^\d{4}-\d{2}-\d{2}$/);
  if (m) return t;
  return null;
}

function parseTimeToken(token: string): string | null {
  const t = token.toLowerCase().replace(/\./g, "");
  let m = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (m) {
    let h = parseInt(m[1]);
    const min = m[2];
    const ap = m[3];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${min}`;
  }
  m = t.match(/^(\d{1,2})\s*(am|pm)$/);
  if (m) {
    let h = parseInt(m[1]);
    if (m[2] === "pm" && h < 12) h += 12;
    if (m[2] === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:00`;
  }
  m = t.match(/^(\d{1,2})[:.](\d{2})$/);
  if (m) return `${String(parseInt(m[1])).padStart(2, "0")}:${m[2]}`;
  return null;
}

/**
 * Extract structured facts from a natural-language admin message.
 * Deterministic + conservative: anything uncertain is simply not extracted,
 * so the agent asks instead of guessing (spec Sections 6, 24).
 */
export function extractFactsFromMessage(rawText: string, existing: CampaignFact[]): ExtractResult {
  const text = norm(rawText);
  const lower = text.toLowerCase();
  const existingFields = new Set(existing.map((f) => f.field));
  const facts: CampaignFact[] = [];
  const answered: string[] = [];

  const add = (field: string, value: CampaignFact["value"]) => {
    if (value == null || value === "") return;
    facts.push(fact(field, value));
    answered.push(field);
  };

  // Title — quoted text, or "called X", "named X", "titled X"
  if (!existingFields.has("title")) {
    let m = lower.match(/["'“”](.+?)["'“”]/);
    if (m) add("title", m[1]);
    else {
      m = text.match(/called\s+(.+?)(?:[,.]|$)/i);
      if (m) add("title", m[1]);
      else {
        m = text.match(/named\s+(.+?)(?:[,.]|$)/i);
        if (m) add("title", m[1]);
        else {
          m = text.match(/titled\s+(.+?)(?:[,.]|$)/i);
          if (m) add("title", m[1]);
        }
      }
    }
  }

  // Date / time
  if (!existingFields.has("date")) {
    for (const token of text.split(/\s+/)) {
      const d = parseDateToken(token.replace(/[,.;!?]+$/, ""));
      if (d) {
        add("date", d);
        break;
      }
    }
  }
  if (!existingFields.has("startTime")) {
    for (const token of text.split(/\s+/)) {
      const t = parseTimeToken(token.replace(/[,.;!?]+$/, ""));
      if (t) {
        add("startTime", t);
        break;
      }
    }
  }

  // Venue — "at X", "venue is X", "held at X" (avoid catching "at 7 pm" or a trailing date)
  if (!existingFields.has("venue")) {
    const venueMatch = lower.match(/(?:held\s+at|conducted\s+at|venue\s+(?:is|was|:)\s*)\s*(.+?)(?:[,.]|$|\s+on\s+\d)/i);
    if (venueMatch) add("venue", venueMatch[1].trim().replace(/^the\s+/, ""));
  }

  // Chief guest
  if (!existingFields.has("chiefGuest")) {
    const m = lower.match(/chief\s+guest\s+(?:was|is|being)\s+(?:dr\.?\s*|mr\.?\s*|mrs\.?\s*|prof\.?\s*)?([a-z][a-z.\s]*?)(?:[,.]|$)/i);
    if (m && m[1].length > 2) add("chiefGuest", m[1].replace(/\.\s*$/, "").trim());
  }

  // Winners — "winners were X", "Winners: X", "X won", "winning team was X".
  // Values are captured to the end of the sentence so multi-winner lists survive.
  if (!existingFields.has("winners")) {
    const end = "(?=\\.\\s|\\.$|\\n|$|\\s+[A-Z]\\d+|\\.\\s?[A-Z])";
    const endWon = "(?=\\.\\s|\\.$|\\n|$|\\s+[A-Z]\\d+|\\s+(?:at|in|on|during|first|the|1st)\\s)";
    let m = lower.match(new RegExp(`winners?\\s+(?:were|was|are)\\s+(.+?)${end}`, "i"));
    if (m) add("winners", splitList(m[1]));
    else {
      m = lower.match(new RegExp(`winners?\\s*:\\s*(.+?)${end}`, "i"));
      if (m) add("winners", splitList(m[1]));
      else {
        m = lower.match(new RegExp(`winning\\s+team\\s+was\\s+(.+?)${end}`, "i"));
        if (m) add("winners", splitList(m[1]));
        else {
          m = lower.match(new RegExp(`^(.+?)\\s+won\\b${endWon}`, "i"));
          if (m) add("winners", splitList(m[1]));
          else {
            m = lower.match(new RegExp(`(.+?)\\s+won\\s+(?:first\\s+place|the\\s+event|the\\s+competition|1st|the\\s+hackathon)${endWon}`, "i"));
            if (m) add("winners", splitList(m[1]));
          }
        }
      }
    }
  }

  // Departments
  if (!existingFields.has("departments")) {
    const found: string[] = [];
    for (const key of Object.keys(DEPT_MAP)) {
      const aliases = [
        key,
        key.replace(" & ", " and "),
        key.replace("science & humanities", "s&h"),
      ];
      if (aliases.some((a) => lower.includes(a))) {
        const canonical = DEPT_MAP[key];
        if (!found.includes(canonical)) found.push(canonical);
      }
    }
    if (found.length) add("departments", found);
  }

  // Organizers
  if (!existingFields.has("organizers")) {
    const m = lower.match(/organized\s+by\s+(.+?)(?:[,.]|$)/i);
    if (m) add("organizers", splitList(m[1]));
  }

  // Participants — "N students", "N teams"
  if (!existingFields.has("participants")) {
    const m = lower.match(/(\d{1,5}[+]?)\s*(students|participants|teams)/i);
    if (m) add("participants", m[0].trim());
  }

  // Achievements / statistics — sentences containing numbers or "achieved"
  if (!existingFields.has("achievements")) {
    const sentences = lower.split(/(?<=[.!?])\s+/);
    const hits = sentences.filter(
      (s) => /\d+/.test(s) && /(achiev|won|record|selected|placed|secured|score)/.test(s)
    );
    if (hits.length) add("achievements", hits.slice(0, 2).join(" "));
  }
  if (!existingFields.has("statistics")) {
    const sentences = lower.split(/(?<=[.!?])\s+/);
    const hits = sentences.filter((s) => /\d+/.test(s) && /(students|teams|projects|companies|offers|packages?|lpa|percentage)/.test(s));
    if (hits.length && !facts.some((f) => f.field === "achievements" && hits.some((h) => f.value === h))) {
      add("statistics", hits.slice(0, 2).join(" "));
    }
  }

  // Website URL
  if (!existingFields.has("websiteUrl")) {
    const m = text.match(/https?:\/\/[^\s,]+/);
    if (m) add("websiteUrl", m[0]);
  }

  // Description — first non-trivial sentence that isn't a known field pattern
  if (!existingFields.has("description")) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 30);
    const skip = /(chief guest|winners|venue|organized by|conducted|held at|won|departments?|participants)/i;
    const candidate = sentences.find((s) => !skip.test(s));
    if (candidate) add("description", candidate);
  }

  return { facts, answeredFields: answered };
}

function splitList(s: string): string[] {
  return s
    .split(/[,;&]|\band\b/)
    .map((x) => x.trim())
    .filter((x) => x.length > 1)
    .slice(0, 5);
}

/** Which required fields are still missing for this campaign type. */
export function detectMissingFields(facts: CampaignFact[], type: CampaignType): string[] {
  const have = new Set(facts.filter((f) => f.value != null && f.value !== "" && f.value !== false).map((f) => f.field));
  return REQUIRED_FIELDS[type].filter((f) => !have.has(f));
}

/** Produce a short, natural list of questions — only for missing fields, max 4. */
export function buildQuestions(missing: string[]): string[] {
  const limited = missing.slice(0, 4);
  const questions: string[] = [];
  for (const field of limited) {
    switch (field) {
      case "title":
        questions.push("What was the official name of the event?");
        break;
      case "date":
        questions.push("What was the date?");
        break;
      case "winners":
        questions.push("Who were the winners?");
        break;
      case "achievements":
        questions.push("What were the key achievements?");
        break;
      case "statistics":
        questions.push("What important statistics should we highlight?");
        break;
      default:
        questions.push(`What was the ${FACT_LABELS[field] ?? field}?`);
    }
  }
  return questions;
}

/** One message the assistant presents to the admin when info is missing. */
export function composeInfoRequest(missing: string[], campaignTitle: string): string {
  if (!missing.length) return "All required information is present.";
  const q = buildQuestions(missing);
  return (
    `I can prepare the campaign for “${campaignTitle}”. I need ${missing.length} detail${missing.length > 1 ? "s" : ""} first:\n\n` +
    q.map((question, i) => `${i + 1}. ${question}`).join("\n") +
    "\n\nYou can answer naturally in one message."
  );
}

/** Merge an extraction result into the campaign's stored facts (admin wins). */
export function mergeFacts(existing: CampaignFact[], incoming: CampaignFact[]): CampaignFact[] {
  const byField = new Map<string, CampaignFact>();
  for (const f of existing) byField.set(f.field, f);
  for (const f of incoming) {
    const prev = byField.get(f.field);
    if (!prev || prev.source !== "admin" || f.source === "admin") byField.set(f.field, f);
  }
  return Array.from(byField.values());
}