import { describe, expect, test } from "vitest";
import { processQuery } from "./engine";
import { EMPTY_CONTEXT, type ConversationContext } from "./types";
import { HOD_DIRECTORY } from "@/data/bvcits-bot-knowledge";
import { tokenize } from "./normalize";
import { resolveDepartment } from "./catalog";

/** Convenience: run a single turn from a clean slate. */
function ask(q: string, ctx: ConversationContext = EMPTY_CONTEXT) {
  return processQuery(q, ctx);
}

describe("regression: short queries are answered, not swallowed as filler", () => {
  // The old engine treated any input <= 4 chars as a hesitation and replied
  // "I'm listening" instead of answering.
  test.each([
    ["ece", "hod_contact"],
    ["eee", "hod_contact"],
    ["mba", "hod_contact"],
    ["bus", "transport"],
    ["job", "placements"],
    ["fee", "fees"],
  ])("%s is answered as %s", (query, expected) => {
    expect(ask(query).reply.topic).toBe(expected);
  });
});

describe("regression: substring matching no longer misfires", () => {
  // includes("ai") used to match inside email/available/detail/training.
  test.each([
    "what is your email address",
    "are seats available",
    "give me the details",
    "placement training",
  ])("%s does not resolve to AI & DS", (query) => {
    const dept = resolveDepartment(tokenize(query));
    expect(dept?.key).not.toBe("aids");
  });

  // includes("ds") used to match inside "needs".
  test("'what do I need' does not resolve to AI & DS", () => {
    expect(resolveDepartment(tokenize("what do i need"))?.key).not.toBe("aids");
  });

  test("explicit AI & DS phrasings still resolve", () => {
    expect(resolveDepartment(tokenize("ai ds fee"))?.key).toBe("aids");
    expect(resolveDepartment(tokenize("data science seats"))?.key).toBe("aids");
  });
});

describe("answers are department-specific, not one generic blob", () => {
  test("MBA fee returns the MBA row", () => {
    const { reply } = ask("mba fee");
    expect(reply.topic).toBe("fees");
    expect(reply.replyEnglish).toContain("₹35,000");
  });

  test("MCA fee returns the MCA row", () => {
    expect(ask("mca fee").reply.replyEnglish).toContain("₹45,000");
  });

  test("B.Tech fee returns the convenor row", () => {
    expect(ask("cse fee").reply.replyEnglish).toContain("₹43,000");
  });

  test("intake differs per department", () => {
    expect(ask("how many seats in cse").reply.replyEnglish).toContain("180");
    expect(ask("how many seats in civil").reply.replyEnglish).toContain("60");
  });

  test("faculty count differs per department", () => {
    expect(ask("ece faculty").reply.replyEnglish).toContain("59");
    expect(ask("mca faculty").reply.replyEnglish).toContain("24");
  });
});

describe("grounding: HOD names match the scraped source", () => {
  test("CSE HOD is the real name, not the fabricated one", () => {
    const { reply } = ask("who is the cse hod");
    expect(reply.replyEnglish).toContain("Dr. Katikireddy Srinivas");
    expect(reply.replyEnglish).not.toContain("Srinivasa Rao");
  });

  test("ECE HOD is the real name", () => {
    expect(ask("ece hod").reply.replyEnglish).toContain("Dr. Siva Sankara Phani");
  });

  test("a department with no published head is not given an invented name", () => {
    const { reply } = ask("aiml hod");
    expect(HOD_DIRECTORY.aiml.verified).toBe(false);
    expect(reply.replyEnglish).toMatch(/not published/i);
  });
});

describe("conversation context carries the department across turns", () => {
  test("'and the fee?' after a CSE question stays on CSE", () => {
    const first = ask("cse hod");
    expect(first.context.lastDeptKey).toBe("cse");

    const second = processQuery("fee", first.context);
    expect(second.reply.topic).toBe("fees");
    expect(second.reply.replyEnglish).toContain("₹43,000");
  });

  test("college-wide questions do not inherit a stale department", () => {
    // Regression: asking about the ₹38 LPA topper right after an MBA question used to
    // return the college-wide figures but link to the MBA department placements page.
    const mba = ask("mba fee");
    expect(mba.context.lastDeptKey).toBe("mba");

    const placements = processQuery("who got the 38 lakh package", mba.context);
    expect(placements.reply.deptKey).toBeUndefined();
    expect(placements.reply.replyEnglish).toContain("/placements-cell");
    expect(placements.reply.replyEnglish).not.toContain("master-of-business-administration");
  });

  test("an explicitly named department still scopes placements", () => {
    const { reply } = ask("cse placements");
    expect(reply.replyEnglish).toContain("computer-science-engineering");
  });

  test("fees still inherit the department across turns", () => {
    const first = ask("ece hod");
    const second = processQuery("fee", first.context);
    expect(second.reply.deptKey).toBe("ece");
  });

  test("naming a new department overrides the carried one", () => {
    const first = ask("cse hod");
    const second = processQuery("mba fee", first.context);
    expect(second.reply.replyEnglish).toContain("₹35,000");
    expect(second.context.lastDeptKey).toBe("mba");
  });
});

describe("voice output stays short and speakable", () => {
  const queries = [
    "cse hod",
    "fee structure",
    "placements",
    "how to get admission",
    "bus routes",
    "exam results",
    "what courses are offered",
  ];

  test.each(queries)("'%s' spoken reply is concise", (q) => {
    const { reply } = ask(q);
    expect(reply.spokenTelugu.length).toBeGreaterThan(0);
    expect(reply.spokenTelugu.length).toBeLessThanOrEqual(180);
    expect(reply.spokenEnglish.length).toBeLessThanOrEqual(180);
  });

  test.each(queries)("'%s' spoken reply carries no markdown or links", (q) => {
    const { reply } = ask(q);
    for (const spoken of [reply.spokenTelugu, reply.spokenEnglish]) {
      expect(spoken).not.toContain("**");
      expect(spoken).not.toContain("](");
      expect(spoken).not.toContain("http");
    }
  });
});

describe("every answer offers a real next step", () => {
  const queries = [
    "cse hod",
    "fee structure",
    "placements",
    "how to get admission",
    "hostel",
    "bus routes",
    "exam results",
    "syllabus",
    "library",
    "where is the college",
    "naac accreditation",
  ];

  test.each(queries)("'%s' returns a card or a quick reply", (q) => {
    const { reply } = ask(q);
    expect(reply.actionCards.length + reply.quickReplies.length).toBeGreaterThan(0);
  });

  test("no answer links to the unbuilt examinations sub-routes", () => {
    // These paths have no page in this app and fall through to the [...slug] stub.
    const dead = ["/examinations/autonomous/results", "/examinations/autonomous/time-tables"];
    for (const q of queries) {
      const { reply } = ask(q);
      const blob = JSON.stringify(reply);
      for (const path of dead) {
        expect(blob).not.toContain(`"${path}"`);
      }
    }
  });
});

describe("backchannels vs real questions", () => {
  test("pure filler is treated as filler", () => {
    expect(ask("hmm", { turnCount: 3 }).reply.topic).toBe("backchannel");
    expect(ask("ఆగు", { turnCount: 3 }).reply.topic).toBe("backchannel");
  });

  test("filler followed by a real question is answered", () => {
    expect(ask("ok what is the fee").reply.topic).toBe("fees");
  });

  test("a greeting on the first turn greets", () => {
    expect(ask("hello").reply.topic).toBe("greeting");
  });
});

describe("Telugu queries resolve", () => {
  test.each([
    ["ఫీజు ఎంత?", "fees"],
    ["ప్లేస్‌మెంట్స్ వివరాలు", "placements"],
    ["హాస్టల్ ఫీజు", "hostel"],
    ["బస్సు రూట్లు", "transport"],
    ["అడ్మిషన్ ఎలా?", "admissions"],
  ])("%s → %s", (query, expected) => {
    expect(ask(query).reply.topic).toBe(expected);
  });

  test("Telugu case endings still match the stem", () => {
    // "ఫీజులు" / "ఫీజు" are the same noun with different endings.
    expect(ask("ఫీజులు చెప్పండి").reply.topic).toBe("fees");
  });
});

describe("unknown input fails honestly", () => {
  test("gibberish returns the fallback with next steps", () => {
    const { reply } = ask("qwerty zxcvb");
    expect(reply.isFallback).toBe(true);
    expect(reply.quickReplies.length).toBeGreaterThan(0);
  });

  test("empty input does not crash", () => {
    expect(() => ask("")).not.toThrow();
    expect(() => ask("   ")).not.toThrow();
  });
});

describe("Telugu verb morphology resolves to the right intent", () => {
  test.each([
    ["నా కొడుకుని ఇంజనీరింగ్ చేర్పించాలి అనుకుంటున్నాను", "admissions"],
    ["కాలేజీలో చేరవచ్చా?", "admissions"],
    ["ప్రవేశం ఎలా?", "admissions"],
  ])("%s → %s", (query, expected) => {
    expect(ask(query).reply.topic).toBe(expected);
  });

  test("a parent's enrolment question is not answered with the fallback", () => {
    const { reply } = ask("నా కొడుకుని ఇంజనీరింగ్ చేర్పించాలి అనుకుంటున్నాను ఏం చేయాలి?");
    expect(reply.isFallback).toBe(false);
  });
});
