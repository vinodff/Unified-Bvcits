// Question Paper Generation Agent — step 5 of the pipeline.
//
// Assembles the predicted paper from the processed dataset following the
// reviewer's blueprint: per-section question budgets, topic coverage and the
// difficulty mix. Selection is deterministic (score-based) so the same data
// yields a reproducible paper; the LLM is only consulted to FILL gaps when the
// collected dataset cannot satisfy the blueprint.

import "server-only";

import { generateJson } from "./gemini";
import type { Difficulty, ExamQuestion, PaperBlueprint } from "./types";

export interface GeneratedPaperItem {
  question: ExamQuestion;
  marks: number;
}

export interface GeneratedPaper {
  title: string;
  description: string;
  durationMinutes: number;
  sections: PaperBlueprint["sections"];
  items: GeneratedPaperItem[];
  totalMarks: number;
  /** True when the LLM had to invent questions to fill the blueprint. */
  usedAiFill: boolean;
}

interface FillQuestion {
  topic?: string;
  questionText?: string;
  options?: string[];
  answerIndex?: number;
  explanation?: string;
}

const FILL_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          questionText: { type: "string" },
          options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
          answerIndex: { type: "integer" },
          explanation: { type: "string" },
        },
        required: ["topic", "questionText", "options", "answerIndex"],
      },
    },
  },
  required: ["questions"],
} as const;

/** Score how well a bank question fits a blueprint section's needs. */
function fitScore(
  question: ExamQuestion,
  sectionTopics: string[],
  targetDifficulty: Difficulty
): number {
  let score = 0;
  const qText = question.questionText.toLowerCase();
  const qTopic = question.topic.toLowerCase();

  if (sectionTopics.length === 0) {
    score += 2;
  } else {
    for (const t of sectionTopics) {
      const n = t.toLowerCase();
      if (qTopic.includes(n) || n.includes(qTopic)) score += 4;
      else if (qText.includes(n)) score += 2;
    }
  }

  if (question.difficulty === targetDifficulty) score += 3;
  else if (
    (targetDifficulty === "medium" && question.difficulty !== "hard") ||
    (targetDifficulty === "easy" && question.difficulty === "easy") ||
    (targetDifficulty === "hard" && question.difficulty !== "easy")
  ) {
    score += 1;
  }

  return score;
}

/** A deterministic score-based selector, per section, honouring the difficulty mix. */
function selectForSection(
  bank: ExamQuestion[],
  sectionTopics: string[],
  count: number,
  difficultyMix: { easy: number; medium: number; hard: number }
): { chosen: ExamQuestion[]; shortfall: number } {
  const targetEasy = Math.round(count * (difficultyMix.easy / 100));
  const targetHard = Math.round(count * (difficultyMix.hard / 100));
  const targetMedium = count - targetEasy - targetHard;

  const ranked = [...bank]
    .map((question) => ({ question, score: fitScore(question, sectionTopics, "medium") }))
    .sort((a, b) => b.score - a.score);

  const pools: Record<Difficulty, ExamQuestion[]> = { easy: [], medium: [], hard: [] };
  for (const { question } of ranked) pools[question.difficulty].push(question);

  const chosen: ExamQuestion[] = [];
  const take = (pool: ExamQuestion[], n: number) => {
    while (n > 0 && pool.length > 0) {
      chosen.push(pool.shift()!);
      n -= 1;
    }
  };

  take(pools.easy, targetEasy);
  take(pools.hard, targetHard);
  take(pools.medium, targetMedium);
  // Any leftover need is filled by whatever ranks highest.
  const remaining = [...pools.easy, ...pools.medium, ...pools.hard]
    .sort((a, b) => fitScore(b, sectionTopics, "medium") - fitScore(a, sectionTopics, "medium"));
  take(remaining, count - chosen.length);

  return { chosen, shortfall: Math.max(0, count - chosen.length) };
}

async function fillWithAi(
  examName: string,
  sectionName: string,
  topics: string[],
  need: number,
  difficulty: Difficulty
): Promise<ExamQuestion[]> {
  const systemInstruction = [
    `You write realistic ${examName} style multiple-choice questions.`,
    "Each question must be self-contained, unambiguous, with exactly one correct answer.",
    "Options must be plausible distractors of similar length.",
    "Return JSON only.",
  ].join("\n");

  const prompt = [
    `Write ${need} ${difficulty}-difficulty multiple-choice questions for the "${sectionName}" section of ${examName}.`,
    `Preferred topics: ${topics.join(", ") || "general aptitude"}.`,
    "Format: questionText, 4 options, answerIndex (0-based), explanation, topic.",
  ].join("\n");

  const result = await generateJson<{ questions?: FillQuestion[] }>({
    systemInstruction,
    prompt,
    schema: FILL_SCHEMA,
  });

  const valid: ExamQuestion[] = [];
  for (const item of result.data?.questions ?? []) {
    if (
      item.questionText &&
      Array.isArray(item.options) &&
      item.options.length >= 2 &&
      typeof item.answerIndex === "number" &&
      item.answerIndex >= 0 &&
      item.answerIndex < item.options.length
    ) {
      valid.push({
        topic: item.topic ?? topics[0] ?? sectionName,
        questionText: item.questionText.trim(),
        options: item.options.map((o) => o.trim()),
        answer: item.answerIndex,
        explanation: item.explanation,
        difficulty,
        source: `AI-generated for ${examName}`,
        sourceType: "ai",
      });
    }
  }
  return valid;
}

export async function generatePaper(
  examName: string,
  blueprint: PaperBlueprint,
  bank: ExamQuestion[]
): Promise<GeneratedPaper> {
  const items: GeneratedPaperItem[] = [];
  let usedAiFill = false;
  const bankCopy = [...bank];

  for (const section of blueprint.sections) {
    const difficultyMix = { easy: 30, medium: 50, hard: 20 };
    const { chosen, shortfall } = selectForSection(
      bankCopy,
      section.topics,
      section.questionCount,
      difficultyMix
    );

    for (const question of chosen) {
      const idx = bankCopy.findIndex((q) => q.questionText === question.questionText);
      if (idx >= 0) bankCopy.splice(idx, 1); // a question appears in the paper once
      items.push({ question, marks: section.marksPerQuestion });
    }

    if (shortfall > 0) {
      const fills = await fillWithAi(
        examName,
        section.name,
        section.topics,
        Math.min(shortfall, 5),
        "medium"
      );
      usedAiFill = usedAiFill || fills.length > 0;
      for (const question of fills.slice(0, shortfall)) {
        items.push({ question, marks: section.marksPerQuestion });
      }
    }
  }

  const totalMarks = items.reduce((sum, item) => sum + item.marks, 0);

  return {
    title: `${examName} — Predicted Paper`,
    description: `AI-predicted question paper for ${examName}, generated from collected patterns and previous-year material, reviewed by the AI reviewer (30 years' exam-review experience) and pending faculty approval.`,
    durationMinutes: blueprint.durationMinutes,
    sections: blueprint.sections,
    items,
    totalMarks,
    usedAiFill,
  };
}