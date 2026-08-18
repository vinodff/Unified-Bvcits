// AI Reviewer Agent — step 4 of the pipeline.
//
// Persona: a senior examination reviewer with 30 years of experience setting
// and reviewing placement papers. It reads the processed dataset and the
// pattern, then produces:
//
//   - reviewer_insights — weightage, trends, frequently-tested concepts,
//     difficulty distribution, and a plain-language summary.
//   - blueprint — the exact paper spec (sections, per-section topic budgets,
//     marks, duration) that the generation agent must follow.
//
// When the LLM is unavailable, a deterministic heuristic stands in: topic
// frequency in the collected dataset becomes weightage, difficulty is
// rebalanced toward the pattern's known mix, and frequently-tested topics are
// the most common ones. The paper is still grounded in the collected data.

import "server-only";

import { generateJson } from "./gemini";
import type { ExamPattern, ExamQuestion, PaperBlueprint, ReviewerInsights } from "./types";

const REVIEWER_SCHEMA = {
  type: "object",
  properties: {
    weightage: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          weightPct: { type: "number" },
          trend: { type: "string", enum: ["rising", "stable", "falling"] },
          importance: { type: "string", enum: ["critical", "high", "medium", "low"] },
        },
        required: ["topic", "weightPct", "trend", "importance"],
      },
    },
    frequentlyTested: { type: "array", items: { type: "string" } },
    difficultyDistribution: {
      type: "object",
      properties: {
        easy: { type: "number" },
        medium: { type: "number" },
        hard: { type: "number" },
      },
      required: ["easy", "medium", "hard"],
    },
    predictions: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    blueprint: {
      type: "object",
      properties: {
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              topics: { type: "array", items: { type: "string" } },
              questionCount: { type: "integer" },
              marksPerQuestion: { type: "number" },
            },
            required: ["name", "topics", "questionCount", "marksPerQuestion"],
          },
        },
        totalQuestions: { type: "integer" },
        durationMinutes: { type: "integer" },
        notes: { type: "array", items: { type: "string" } },
      },
      required: ["sections", "totalQuestions", "durationMinutes"],
    },
  },
  required: ["weightage", "frequentlyTested", "difficultyDistribution", "predictions", "summary", "blueprint"],
} as const;

interface ReviewerResponse {
  weightage?: Array<{ topic?: string; weightPct?: number; trend?: string; importance?: string }>;
  frequentlyTested?: string[];
  difficultyDistribution?: { easy?: number; medium?: number; hard?: number };
  predictions?: string[];
  summary?: string;
  blueprint?: {
    sections?: Array<{ name?: string; topics?: string[]; questionCount?: number; marksPerQuestion?: number }>;
    totalQuestions?: number;
    durationMinutes?: number;
    notes?: string[];
  };
}

/** Deterministic fallback review: frequency becomes weightage. */
export function heuristicReview(
  examName: string,
  pattern: ExamPattern,
  dataset: ExamQuestion[]
): { insights: ReviewerInsights; blueprint: PaperBlueprint } {
  const byTopic = new Map<string, number>();
  const byDifficulty = { easy: 0, medium: 0, hard: 0 };
  for (const question of dataset) {
    byTopic.set(question.topic, (byTopic.get(question.topic) ?? 0) + 1);
    byDifficulty[question.difficulty] += 1;
  }

  const total = dataset.length || 1;
  const topics = [...byTopic.entries()].sort((a, b) => b[1] - a[1]);
  const weightage = topics.map(([topic, count]) => ({
    topic,
    weightPct: Math.round((count / total) * 100),
    trend: "stable" as const,
    importance: (count / total >= 0.15 ? "critical" : count / total >= 0.08 ? "high" : "medium") as
      | "critical"
      | "high"
      | "medium",
  }));

  const difficultyTotal = byDifficulty.easy + byDifficulty.medium + byDifficulty.hard || 1;
  const difficultyDistribution = {
    easy: Math.round((byDifficulty.easy / difficultyTotal) * 100),
    medium: Math.round((byDifficulty.medium / difficultyTotal) * 100),
    hard: Math.round((byDifficulty.hard / difficultyTotal) * 100),
  };

  // The blueprint rebalances the collected data toward the pattern's own
  // section budget, so a lopsided dataset cannot warp the paper.
  const blueprint: PaperBlueprint = {
    sections: pattern.sections.map((section) => {
      const topicsInSection = new Set<string>();
      for (const question of dataset) {
        const topic = question.topic;
        if (
          section.topics.some((t) =>
            topic.toLowerCase().includes(t.toLowerCase()) ||
            t.toLowerCase().includes(topic.toLowerCase()) ||
            question.questionText.toLowerCase().includes(t.toLowerCase())
          )
        ) {
          topicsInSection.add(topic);
        }
      }
      return {
        name: section.name,
        topics: topicsInSection.size > 0 ? [...topicsInSection].slice(0, 6) : section.topics.slice(0, 6),
        questionCount: section.questionCount,
        marksPerQuestion: section.marksPerQuestion,
      };
    }),
    totalQuestions: pattern.totalQuestions,
    durationMinutes: pattern.durationMinutes,
  };

  const insights: ReviewerInsights = {
    weightage,
    frequentlyTested: topics.slice(0, 5).map(([topic]) => topic),
    difficultyDistribution,
    predictions: [
      `Topics with the most collected evidence — ${topics.slice(0, 3).map(([t]) => t).join(", ")} — are the safest bets.`,
      `Keep difficulty near the collected mix (${difficultyDistribution.easy}% easy / ${difficultyDistribution.medium}% medium / ${difficultyDistribution.hard}% hard).`,
    ],
    summary: `Heuristic review of ${examName}: ${dataset.length} collected questions across ${topics.length} topics were analysed. ${topics[0]?.[0] ?? "No"} dominates the collected set; the paper follows the documented section budget.`,
  };

  return { insights, blueprint };
}

export async function reviewExam(
  examName: string,
  pattern: ExamPattern,
  dataset: ExamQuestion[]
): Promise<{ insights: ReviewerInsights; blueprint: PaperBlueprint }> {
  const material = {
    examName,
    pattern,
    dataset: dataset.map((question) => ({
      topic: question.topic,
      difficulty: question.difficulty,
      text: question.questionText,
      options: question.options,
    })),
  };

  const systemInstruction = [
    "You are a senior examination reviewer with 30 years of experience setting and reviewing placement tests for Indian IT companies (TCS, Infosys, Wipro, Accenture, Cognizant, Capgemini and others).",
    "You are famous for predicting which topics and question types will appear in the next cycle.",
    "Your job: analyse the collected dataset and the documented exam pattern, then decide the blueprint for a PREDICTED question paper.",
    "",
    "RULES:",
    "- Weightage must reflect historical trends visible in the data AND standard practice for this exam family. Sum of weightPct should be ~100.",
    "- The blueprint's per-section question counts should follow the pattern's section budgets.",
    "- Difficulty mix: most exams are ~30% easy, 50% medium, 20% hard. Deviate only with reason.",
    "- frequentlyTested: the concepts that appear again and again in the data.",
    "- predictions: 2-4 specific, testable predictions (e.g. 'Expect 2-3 questions on profit-loss with successive discounts').",
    "- Be specific. A reviewer who says 'topics will be tested' has added nothing.",
  ].join("\n");

  const prompt = [
    `EXAM: ${examName}`,
    "",
    "DOCUMENTED PATTERN:",
    JSON.stringify(material.pattern, null, 2),
    "",
    `COLLECTED DATASET (${dataset.length} questions):`,
    JSON.stringify(material.dataset.slice(0, 80), null, 2),
    "",
    "Produce the reviewer insights and the predicted-paper blueprint.",
  ].join("\n");

  const result = await generateJson<ReviewerResponse>({
    systemInstruction,
    prompt,
    schema: REVIEWER_SCHEMA,
  });

  const data = result.data;
  if (
    data &&
    Array.isArray(data.blueprint?.sections) &&
    data.blueprint.sections.length > 0 &&
    typeof data.blueprint.totalQuestions === "number"
  ) {
    const insights: ReviewerInsights = {
      weightage: (data.weightage ?? [])
        .filter((w) => w.topic)
        .map((w) => ({
          topic: w.topic!,
          weightPct: Math.max(0, w.weightPct ?? 0),
          trend: w.trend === "rising" || w.trend === "falling" ? w.trend : "stable",
          importance: w.importance === "critical" || w.importance === "high" || w.importance === "low" ? w.importance : "medium",
        })),
      frequentlyTested: (data.frequentlyTested ?? []).filter(Boolean),
      difficultyDistribution: {
        easy: Math.max(0, data.difficultyDistribution?.easy ?? 30),
        medium: Math.max(0, data.difficultyDistribution?.medium ?? 50),
        hard: Math.max(0, data.difficultyDistribution?.hard ?? 20),
      },
      predictions: (data.predictions ?? []).filter(Boolean),
      summary: data.summary ?? `Reviewer analysis of ${examName} completed.`,
    };

    const blueprint: PaperBlueprint = {
      sections: data.blueprint.sections
        .filter((s) => s.name)
        .map((s) => ({
          name: s.name!,
          topics: (s.topics ?? []).filter(Boolean).slice(0, 8),
          questionCount: Math.max(1, s.questionCount ?? 1),
          marksPerQuestion: Math.max(0, s.marksPerQuestion ?? 1),
        })),
      totalQuestions: Math.max(1, data.blueprint.totalQuestions),
      durationMinutes: Math.max(5, Math.min(600, data.blueprint.durationMinutes ?? pattern.durationMinutes)),
      notes: data.blueprint.notes ?? [],
    };

    return { insights, blueprint };
  }

  console.warn("[placement-review] LLM review empty; using heuristic review");
  return heuristicReview(examName, pattern, dataset);
}