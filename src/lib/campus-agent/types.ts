// Shared contracts for the BVCITS campus assistant.

import type { HodInfo } from "@/data/bvcits-bot-knowledge";

export type Lang = "te" | "en";

export type ActionCardType =
  | "hod_contact"
  | "appointment_booking"
  | "fee_breakdown"
  | "placements_showcase"
  | "bus_routes"
  | "website_navigator";

export interface ActionCard {
  type: ActionCardType;
  payload: unknown;
}

/** Payload shape for the website_navigator card. */
export interface NavigationTarget {
  titleTe: string;
  titleEn: string;
  descriptionTe: string;
  descriptionEn: string;
  href: string;
  badge: string;
  secondaryLinks?: { label: string; href: string }[];
}

/** A resolved department entity. `key` indexes HOD_DIRECTORY. */
export interface DeptEntity {
  key: string;
  short: string;
  hod: HodInfo;
}

/** One scored topic candidate produced by the intent matcher. */
export interface TopicMatch {
  topic: Topic;
  score: number;
  /** Which alias tokens fired — used for debugging and tests. */
  hits: string[];
}

export type Topic =
  | "greeting"
  | "hod_contact"
  | "appointment"
  | "fees"
  | "placements"
  | "admissions"
  | "hostel"
  | "transport"
  | "results"
  | "timetable"
  | "syllabus"
  | "faculty"
  | "intake"
  | "courses"
  | "location"
  | "accreditation"
  | "library"
  | "contact"
  | "backchannel"
  | "unknown";

/** A composed answer: short spoken form + richer screen form + real links. */
export interface AgentReply {
  topic: Topic;
  /** Department the answer was scoped to, when one was resolved. */
  deptKey?: string;
  /** Markdown shown on screen (Telugu). */
  replyTelugu: string;
  /** Markdown shown on screen (English). */
  replyEnglish: string;
  /** Plain text for TTS — no markdown, no emoji, one or two sentences. */
  spokenTelugu: string;
  /** Plain text for TTS in English. */
  spokenEnglish: string;
  actionCards: ActionCard[];
  quickReplies: QuickReply[];
  /** True when the agent could not ground an answer and said so. */
  isFallback: boolean;
}

export interface QuickReply {
  te: string;
  en: string;
  /** The query to send when tapped — lets a chip ask a real follow-up question. */
  query: string;
}

/** Conversation state carried between turns so follow-ups resolve ("and the fee?"). */
export interface ConversationContext {
  lastTopic?: Topic;
  lastDeptKey?: string;
  turnCount: number;
}

export const EMPTY_CONTEXT: ConversationContext = { turnCount: 0 };
