// Campus agent orchestrator.
//
// Pipeline: normalise → resolve department → score topics → compose answer → carry context.
//
// The conversation context is what makes follow-ups work. Ask "CSE HOD ఎవరు?" then just
// "ఫీజు ఎంత?" and the second turn still knows you mean CSE. The previous engine had no
// memory of the department, so every follow-up reset to the B.Tech default.

import { tokenize } from "./normalize";
import { resolveDepartment } from "./catalog";
import { isBackchannel, matchTopics } from "./intents";
import {
  answerAccreditation,
  answerAdmissions,
  answerAppointment,
  answerBackchannel,
  answerContact,
  answerCourses,
  answerFaculty,
  answerFees,
  answerGreeting,
  answerHodContact,
  answerHostel,
  answerIntake,
  answerLibrary,
  answerLocation,
  answerPlacements,
  answerResults,
  answerSyllabus,
  answerTimetable,
  answerTransport,
  answerUnknown,
  defaultDept,
} from "./answers";
import { HOD_DIRECTORY } from "@/data/bvcits-bot-knowledge";
import {
  EMPTY_CONTEXT,
  type AgentReply,
  type ConversationContext,
  type DeptEntity,
  type Topic,
} from "./types";

/**
 * Topics where carrying the previous turn's department forward is coherent:
 * after "CSE HOD", a bare "ఫీజు ఎంత?" clearly still means CSE.
 *
 * Topics NOT listed here answer with college-wide figures, so they use a department only
 * when the user names one in the same turn. Without that split, asking "who got the ₹38
 * lakh package" right after an MBA question paired the college-wide headline numbers with
 * a link to the MBA department page — the stat and the link disagreed with each other.
 */
const DEPT_INHERITING: ReadonlySet<Topic> = new Set<Topic>([
  "hod_contact",
  "appointment",
  "faculty",
  "intake",
  "syllabus",
  "fees",
]);

/** Minimum score for a topic match to be trusted over the fallback. */
const CONFIDENCE_FLOOR = 0.9;

function deptFromKey(key: string | undefined): DeptEntity | undefined {
  if (!key) return undefined;
  const hod = HOD_DIRECTORY[key];
  if (!hod) return undefined;
  // `short` is reconstructed from the department label's parenthesised code where present.
  const match = hod.department.match(/\(([^)]+)\)\s*$/);
  return { key, short: match ? match[1] : hod.department, hod };
}

export interface ProcessResult {
  reply: AgentReply;
  context: ConversationContext;
}

/**
 * Answers one user turn.
 *
 * @param rawInput   what the user typed or said
 * @param context    state from the previous turn (pass EMPTY_CONTEXT on a fresh chat)
 */
export function processQuery(
  rawInput: string,
  context: ConversationContext = EMPTY_CONTEXT,
): ProcessResult {
  const tokens = tokenize(rawInput);
  const nextTurn = context.turnCount + 1;

  // Empty or unusable input — treat as a nudge, never as an answer.
  if (tokens.length === 0) {
    return {
      reply: answerBackchannel(),
      context: { ...context, turnCount: nextTurn },
    };
  }

  if (isBackchannel(tokens)) {
    // A bare greeting on the first turn is a greeting; later it's just filler.
    const reply = nextTurn <= 1 ? answerGreeting() : answerBackchannel();
    return { reply, context: { ...context, lastTopic: reply.topic, turnCount: nextTurn } };
  }

  const explicitDept = resolveDepartment(tokens);
  const matches = matchTopics(tokens);
  const best = matches[0];

  // Nothing matched with confidence. If the user named a department and nothing else,
  // that is still a real question — show that department rather than failing.
  if (!best || best.score < CONFIDENCE_FLOOR) {
    if (explicitDept) {
      const reply = answerHodContact(explicitDept);
      return {
        reply,
        context: { lastTopic: reply.topic, lastDeptKey: explicitDept.key, turnCount: nextTurn },
      };
    }
    return {
      reply: answerUnknown(),
      context: { ...context, lastTopic: "unknown", turnCount: nextTurn },
    };
  }

  // Named in this turn wins; otherwise inherit only where inheriting makes sense.
  const inheritedDept = DEPT_INHERITING.has(best.topic)
    ? deptFromKey(context.lastDeptKey)
    : undefined;
  const dept = explicitDept ?? inheritedDept;

  const reply = compose(best.topic, dept);

  return {
    reply,
    context: {
      lastTopic: reply.topic,
      // Remember whichever department this answer was actually about, so the next turn
      // inherits it; otherwise keep the previous one rather than clearing it.
      lastDeptKey: reply.deptKey ?? explicitDept?.key ?? context.lastDeptKey,
      turnCount: nextTurn,
    },
  };
}

function compose(topic: Topic, dept?: DeptEntity): AgentReply {
  switch (topic) {
    case "hod_contact":
      return answerHodContact(dept ?? defaultDept());
    case "appointment":
      return answerAppointment(dept ?? defaultDept());
    case "contact":
      return answerContact();
    case "fees":
      return answerFees(dept);
    case "placements":
      return answerPlacements(dept);
    case "admissions":
      return answerAdmissions(dept);
    case "hostel":
      return answerHostel();
    case "transport":
      return answerTransport();
    case "results":
      return answerResults();
    case "timetable":
      return answerTimetable();
    case "syllabus":
      return answerSyllabus(dept);
    case "faculty":
      return answerFaculty(dept ?? defaultDept());
    case "intake":
      return answerIntake(dept ?? defaultDept());
    case "courses":
      return answerCourses();
    case "location":
      return answerLocation();
    case "accreditation":
      return answerAccreditation();
    case "library":
      return answerLibrary();
    case "greeting":
      return answerGreeting();
    case "backchannel":
      return answerBackchannel();
    default:
      return answerUnknown();
  }
}

/** The opening message shown when the assistant is first opened. */
export function welcomeReply(): AgentReply {
  return answerGreeting();
}
