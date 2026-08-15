// Scored intent matching.
//
// The previous engine used a first-match if/else chain, so whichever `if` sat highest in
// the file won regardless of how weakly it matched. "CSE HOD fee ఎంత" hit the HOD branch
// purely by ordering. Here every topic is scored and the strongest wins, with the runner-up
// available for tie-breaking against conversation context.

import { scoreAlias } from "./normalize";
import type { Topic, TopicMatch } from "./types";

interface TopicRule {
  topic: Topic;
  /** Matched on token boundaries (Latin) or stems (Telugu). */
  aliases: string[];
  /** Multiplier for topics that should win ties when they match at all. */
  weight?: number;
}

/**
 * Backchannels: filler the user says while thinking. These must be an explicit list.
 * The old engine treated ANY input of 4 characters or fewer as filler, which swallowed
 * real questions — "ece", "eee", "bus", "job", "hod", "mba" all returned "I'm listening".
 */
const BACKCHANNEL_ALIASES = [
  "hmm",
  "umm",
  "uh",
  "er",
  "ok",
  "okay",
  "hello",
  "hi",
  "wait",
  "one sec",
  "one second",
  "ఆగు",
  "ఉండు",
  "అంటే",
  "అదే",
  "సరే",
  "ఆc",
];

const RULES: TopicRule[] = [
  {
    topic: "hod_contact",
    aliases: [
      "hod", "head", "head of department", "hod name", "hod phone", "hod number",
      "who is hod", "principal", "professor",
      "హెచ్ఓడీ", "హెచ్ ఓ డి", "అధిపతి", "ప్రిన్సిపాల్",
    ],
  },
  {
    topic: "contact",
    aliases: [
      "contact", "phone", "phone number", "number", "call", "mobile", "email",
      "helpline", "reach", "address",
      "ఫోన్", "నెంబర్", "నంబర్", "కాల్", "ఈమెయిల్", "సంప్రదించ",
    ],
  },
  {
    topic: "appointment",
    aliases: [
      "appointment", "book appointment", "meeting", "slot", "visit", "schedule",
      "అపాయింట్మెంట్", "మీటింగ్", "కలవాలి", "కలవడ",
    ],
    weight: 1.15,
  },
  {
    topic: "fees",
    aliases: [
      "fee", "fees", "fee structure", "tuition", "cost", "price", "how much",
      "reimbursement", "jvd", "vidya deevena", "scholarship", "management quota",
      "ఫీజు", "ఫీజెంత", "ఖర్చు", "రుసుము", "విద్యా దీవెన", "స్కాలర్‌షిప్",
    ],
  },
  {
    topic: "placements",
    aliases: [
      "placement", "placements", "salary", "package", "recruiter", "recruiters",
      "job", "jobs", "company", "companies", "lpa", "servicenow", "highest package",
      "ప్లేస్‌మెంట్", "ప్యాకేజ్", "ఉద్యోగ", "జీతం", "కంపెనీ",
    ],
  },
  {
    topic: "admissions",
    aliases: [
      "admission", "admissions", "apply", "join", "counselling", "counseling",
      "eamcet", "eapcet", "ecet", "icet", "polycet", "bvts", "code", "seat", "enroll",
      "admission process", "how to join", "engineering",
      // Telugu verb morphology is rich: "చేరు" (to join) also appears as the causative
      // "చేర్పించాలి" (to get someone enrolled), which a parent asking on a child's behalf
      // will actually say. Stem matching is prefix-based, so each stem must be listed.
      "అడ్మిషన్", "కౌన్సెలింగ్", "చేరాలి", "చేరడ", "చేరవ", "చేర్పించ", "చేర్చ",
      "జాయిన్", "సీటు", "ప్రవేశ", "ఇంజనీరింగ్",
    ],
  },
  {
    topic: "hostel",
    aliases: [
      "hostel", "accommodation", "stay", "mess", "food", "rooms", "warden",
      "హాస్టల్", "వసతి", "భోజనం",
    ],
  },
  {
    topic: "transport",
    aliases: [
      "bus", "buses", "transport", "route", "routes", "travel", "pickup",
      "బస్సు", "బస్", "రూట్", "ప్రయాణ",
    ],
  },
  {
    topic: "results",
    aliases: [
      "result", "results", "marks", "grade", "grades", "cgpa", "sgpa",
      "supplementary", "revaluation", "backlog",
      "రిజల్ట్", "ఫలిత", "మార్కుల", "రీవాల్యుయేషన్",
    ],
  },
  {
    topic: "timetable",
    aliases: [
      "timetable", "time table", "exam date", "exam dates", "schedule", "calendar",
      "టైంటేబుల్", "పరీక్ష తేదీ", "షెడ్యూల్",
    ],
  },
  {
    topic: "syllabus",
    aliases: [
      "syllabus", "curriculum", "course structure", "regulation", "regulations",
      "br23", "br24", "subjects",
      "సిలబస్", "పాఠ్య", "రెగ్యులేషన్",
    ],
  },
  {
    topic: "faculty",
    aliases: [
      "faculty", "teachers", "staff", "lecturers", "professors", "teaching",
      "అధ్యాపక", "ఫ్యాకల్టీ", "టీచర్",
    ],
  },
  {
    topic: "intake",
    aliases: [
      "intake", "seats", "how many seats", "capacity", "strength", "sanctioned",
      "సీట్ల", "సంఖ్య",
    ],
  },
  {
    topic: "courses",
    aliases: [
      "courses", "branches", "departments", "programs", "programmes", "streams",
      "what do you offer", "btech", "b tech",
      "కోర్సు", "బ్రాంచ్", "డిపార్ట్‌మెంట్", "విభాగ",
    ],
  },
  {
    topic: "location",
    aliases: [
      "where", "location", "located", "address", "campus", "directions", "map",
      "ఎక్కడ", "చిరునామా", "క్యాంపస్",
    ],
  },
  {
    topic: "accreditation",
    aliases: [
      "naac", "nba", "nirf", "aicte", "jntuk", "autonomous", "accreditation",
      "accredited", "ranking", "affiliated", "recognised", "recognized",
      "గుర్తింపు", "ర్యాంక్",
    ],
  },
  {
    topic: "library",
    aliases: ["library", "books", "journals", "e journals", "లైబ్రరీ", "పుస్తక"],
  },
  {
    topic: "greeting",
    aliases: [
      "namaskaram", "namaste", "good morning", "good evening", "thanks", "thank you",
      "నమస్కారం", "ధన్యవాద", "బాగున్నార",
    ],
  },
];

/** True when the whole utterance is filler and carries no question. */
export function isBackchannel(tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  // Only filler if EVERY token is filler — "ok what is the fee" is a real question.
  return tokens.every((t) =>
    BACKCHANNEL_ALIASES.some((a) => (a.includes(" ") ? false : a === t)),
  );
}

/** Scores every topic and returns matches sorted strongest-first. */
export function matchTopics(tokens: string[]): TopicMatch[] {
  const matches: TopicMatch[] = [];

  for (const rule of RULES) {
    let score = 0;
    const hits: string[] = [];

    for (const alias of rule.aliases) {
      const aliasScore = scoreAlias(tokens, alias);
      if (aliasScore > 0) {
        // Take the strongest single alias rather than summing, so a topic listing many
        // synonyms of the same idea does not out-score a genuinely better match.
        score = Math.max(score, aliasScore);
        hits.push(alias);
      }
    }

    if (score > 0) {
      matches.push({ topic: rule.topic, score: score * (rule.weight ?? 1), hits });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}
