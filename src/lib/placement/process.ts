// Data Processing Agent — step 3 of the pipeline.
//
// Deterministic by design: cleaning, deduplication and categorisation are exact
// operations, so they do not need an LLM (and an LLM must not be able to
// silently drop or alter a candidate question). This module is pure —
// unit-testable without any network.

import type { ExamQuestion, ExamPattern } from "./types";

/** Lowercase, strip punctuation/spacing — the key for exact-duplicate removal. */
export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove questions that cannot possibly be presented in an exam. */
export function isUsableQuestion(question: ExamQuestion): boolean {
  if (!question.questionText || question.questionText.trim().length < 5) return false;
  if (!Array.isArray(question.options) || question.options.length < 2) return false;
  if (question.options.length > 6) return false;
  if (question.options.some((o) => !o || o.trim().length === 0)) return false;
  if (typeof question.answer !== "number") return false;
  if (question.answer < 0 || question.answer >= question.options.length) return false;
  if (!["easy", "medium", "hard"].includes(question.difficulty)) return false;
  if (!question.topic || question.topic.trim().length === 0) return false;
  return true;
}

/** Categorise a question into a section of the pattern, by topic overlap. */
export function assignSection(
  question: ExamQuestion,
  pattern: ExamPattern
): string | null {
  const topic = normalizeQuestionText(question.topic);
  for (const section of pattern.sections) {
    const matches = section.topics.some((t) => {
      const n = normalizeQuestionText(t);
      return topic.includes(n) || n.includes(topic) || question.questionText.toLowerCase().includes(n);
    });
    if (matches) return section.name;
  }
  // Fall back to the largest section, or the first — something is better than nothing.
  return pattern.sections.reduce(
    (acc, s) => (s.questionCount > acc.questionCount ? s : acc),
    pattern.sections[0]
  )?.name ?? null;
}

export interface ProcessedResult {
  questions: ExamQuestion[];
  /** Section name -> count, so the reviewer sees coverage at a glance. */
  bySection: Record<string, number>;
  /** Topic -> count. */
  byTopic: Record<string, number>;
  byDifficulty: Record<ExamQuestion["difficulty"], number>;
  duplicatesRemoved: number;
  unusableRemoved: number;
}

export function processQuestions(
  raw: ExamQuestion[],
  pattern: ExamPattern
): ProcessedResult {
  const seen = new Set<string>();
  const questions: ExamQuestion[] = [];
  let duplicatesRemoved = 0;
  let unusableRemoved = 0;

  for (const question of raw) {
    if (!isUsableQuestion(question)) {
      unusableRemoved += 1;
      continue;
    }
    const key = normalizeQuestionText(question.questionText);
    if (seen.has(key)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(key);
    questions.push({
      ...question,
      questionText: question.questionText.trim(),
      options: question.options.map((o) => o.trim()),
      topic: question.topic.trim(),
    });
  }

  const bySection: Record<string, number> = {};
  const byTopic: Record<string, number> = {};
  const byDifficulty: Record<ExamQuestion["difficulty"], number> = {
    easy: 0,
    medium: 0,
    hard: 0,
  };

  for (const question of questions) {
    byDifficulty[question.difficulty] += 1;
    byTopic[question.topic] = (byTopic[question.topic] ?? 0) + 1;
    const section = assignSection(question, pattern);
    if (section) bySection[section] = (bySection[section] ?? 0) + 1;
  }

  return { questions, bySection, byTopic, byDifficulty, duplicatesRemoved, unusableRemoved };
}