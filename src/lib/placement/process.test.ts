import { describe, expect, test } from "vitest";
import {
  assignSection,
  isUsableQuestion,
  normalizeQuestionText,
  processQuestions,
} from "./process";
import type { ExamPattern, ExamQuestion } from "./types";

const TCS_LIKE_PATTERN: ExamPattern = {
  examName: "TCS NQT",
  durationMinutes: 60,
  totalQuestions: 50,
  negativeMarking: 0,
  markingScheme: { perQuestion: 1, negativePerWrong: 0 },
  sections: [
    { name: "Numerical Ability", topics: ["Arithmetic", "Algebra", "Number Systems"], questionCount: 20, marksPerQuestion: 1 },
    { name: "Reasoning Ability", topics: ["Logical Reasoning", "Coding-Decoding", "Puzzles"], questionCount: 15, marksPerQuestion: 1 },
    { name: "Verbal Ability", topics: ["Grammar", "Vocabulary"], questionCount: 15, marksPerQuestion: 1 },
  ],
};

function question(overrides: Partial<ExamQuestion> = {}): ExamQuestion {
  return {
    topic: "Arithmetic",
    questionText: "What is 15% of 200?",
    options: ["20", "25", "30", "35"],
    answer: 2,
    difficulty: "easy",
    source: "test",
    sourceType: "seed",
    ...overrides,
  };
}

describe("normalizeQuestionText", () => {
  test("lowercases and strips punctuation and spacing", () => {
    expect(normalizeQuestionText("  What  is 15% of 200?! ")).toBe("what is 15 of 200");
  });
});

describe("isUsableQuestion", () => {
  test("accepts a well-formed question", () => {
    expect(isUsableQuestion(question())).toBe(true);
  });

  test("rejects empty text", () => {
    expect(isUsableQuestion(question({ questionText: "   " }))).toBe(false);
  });

  test("rejects fewer than 2 options", () => {
    expect(isUsableQuestion(question({ options: ["only"] }))).toBe(false);
  });

  test("rejects more than 6 options", () => {
    expect(isUsableQuestion(question({ options: Array.from({ length: 7 }, (_, i) => `o${i}`) }))).toBe(false);
  });

  test("rejects blank options", () => {
    expect(isUsableQuestion(question({ options: ["a", " ", "c", "d"] }))).toBe(false);
  });

  test("rejects an out-of-range answer", () => {
    expect(isUsableQuestion(question({ answer: 4 }))).toBe(false);
    expect(isUsableQuestion(question({ answer: -1 }))).toBe(false);
  });

  test("rejects unknown difficulty", () => {
    expect(isUsableQuestion(question({ difficulty: "expert" as ExamQuestion["difficulty"] }))).toBe(false);
  });

  test("rejects a missing topic", () => {
    expect(isUsableQuestion(question({ topic: "" }))).toBe(false);
  });
});

describe("assignSection", () => {
  test("matches a topic to the right section", () => {
    const q = question({ topic: "Coding-Decoding" });
    expect(assignSection(q, TCS_LIKE_PATTERN)).toBe("Reasoning Ability");
  });

  test("falls back to the largest section when nothing matches", () => {
    const q = question({ topic: "Space Science" });
    expect(assignSection(q, TCS_LIKE_PATTERN)).toBe("Numerical Ability");
  });
});

describe("processQuestions", () => {
  test("deduplicates by normalized text", () => {
    const result = processQuestions(
      [
        question({ questionText: "What is 15% of 200?" }),
        question({ questionText: "What is 15% of 200? " }),
        question({ questionText: "WHAT IS 15% OF 200?!" }),
      ],
      TCS_LIKE_PATTERN
    );
    expect(result.questions.length).toBe(1);
    expect(result.duplicatesRemoved).toBe(2);
  });

  test("drops unusable questions and counts them", () => {
    const result = processQuestions(
      [question({ options: ["only one"] }), question({ answer: 9 }), question()],
      TCS_LIKE_PATTERN
    );
    expect(result.questions.length).toBe(1);
    expect(result.unusableRemoved).toBe(2);
  });

  test("trims text, options and topic", () => {
    const result = processQuestions(
      [question({ questionText: "  What is 15% of 200?  ", options: [" 20 ", "25 ", "30", "35"], topic: " Arithmetic " })],
      TCS_LIKE_PATTERN
    );
    expect(result.questions[0].questionText).toBe("What is 15% of 200?");
    expect(result.questions[0].options).toEqual(["20", "25", "30", "35"]);
    expect(result.questions[0].topic).toBe("Arithmetic");
  });

  test("tallies sections, topics and difficulty", () => {
    const result = processQuestions(
      [
        question({ topic: "Arithmetic", difficulty: "easy" }),
        question({ topic: "Arithmetic", difficulty: "medium", questionText: "Solve 2x+3=11" }),
        question({ topic: "Coding-Decoding", difficulty: "hard", questionText: "Decode NPPO" }),
      ],
      TCS_LIKE_PATTERN
    );
    expect(result.bySection["Numerical Ability"]).toBe(2);
    expect(result.bySection["Reasoning Ability"]).toBe(1);
    expect(result.byTopic.Arithmetic).toBe(2);
    expect(result.byDifficulty).toEqual({ easy: 1, medium: 1, hard: 1 });
  });

  test("survives an empty corpus", () => {
    const result = processQuestions([], TCS_LIKE_PATTERN);
    expect(result.questions).toEqual([]);
    expect(result.duplicatesRemoved).toBe(0);
    expect(result.unusableRemoved).toBe(0);
  });
});