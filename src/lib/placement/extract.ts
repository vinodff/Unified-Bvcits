// Data Extraction Agent — step 2 of the pipeline.
//
// Turns the research material (web snippets, corpus passages) into a strict
// structured shape: an ExamPattern + a list of ExamQuestions with topics,
// difficulties and answers. When the LLM is unavailable, the corpus is already
// structured, so the extraction is a lossless pass-through.

import "server-only";

import { generateJson } from "./gemini";
import { EXAM_CORPUS, findCorpusExam } from "./corpus";
import type { Difficulty, ExamPattern, ExamQuestion, ExtractedMaterial, ResearchMaterial } from "./types";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && (DIFFICULTIES as string[]).includes(value);
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    examName: { type: "string" },
    durationMinutes: { type: "integer" },
    totalQuestions: { type: "integer" },
    negativeMarking: { type: "number" },
    markingScheme: {
      type: "object",
      properties: {
        perQuestion: { type: "number" },
        negativePerWrong: { type: "number" },
      },
      required: ["perQuestion", "negativePerWrong"],
    },
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
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          questionText: { type: "string" },
          options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
          answerIndex: { type: "integer" },
          difficulty: { type: "string", enum: DIFFICULTIES },
          source: { type: "string" },
        },
        required: ["topic", "questionText", "options", "answerIndex", "difficulty"],
      },
    },
  },
  required: ["examName", "durationMinutes", "totalQuestions", "negativeMarking", "markingScheme", "sections", "questions"],
} as const;

interface ExtractionResponse {
  examName?: string;
  durationMinutes?: number;
  totalQuestions?: number;
  negativeMarking?: number;
  markingScheme?: { perQuestion?: number; negativePerWrong?: number };
  sections?: Array<{
    name?: string;
    topics?: string[];
    questionCount?: number;
    marksPerQuestion?: number;
  }>;
  questions?: Array<{
    topic?: string;
    questionText?: string;
    options?: string[];
    answerIndex?: number;
    difficulty?: string;
    source?: string;
  }>;
}

/** Hard cap so a huge corpus/web dump cannot blow the token budget downstream. */
const MAX_QUESTIONS = 60;

/** Corpus material is already structured — extract by pass-through. */
function extractFromCorpus(material: ResearchMaterial, examName: string): ExtractedMaterial | null {
  const corpus = findCorpusExam(examName);
  if (!corpus || !material.usedCorpus) return null;

  return {
    pattern: corpus.pattern,
    questions: corpus.questions.map((question) => ({ ...question })),
  };
}

export async function extractMaterial(
  examName: string,
  material: ResearchMaterial
): Promise<ExtractedMaterial> {
  const fromCorpus = extractFromCorpus(material, examName);
  if (fromCorpus) return fromCorpus;

  const systemInstruction = [
    "You are a senior exam-syllabus analyst. You convert raw, messy research material about a placement exam into a clean structured summary.",
    "RULES:",
    "- Sections must cover the material; never invent a section the material does not mention.",
    "- Each question needs 2-6 options and exactly one correct answer index.",
    "- Difficulty: easy/medium/hard based on how the item is typically ranked.",
    "- If the material gives no duration or marking, infer conservatively and mark it in a note.",
    "- Deduplicate repeated questions while extracting.",
  ].join("\n");

  const prompt = [
    `EXAM NAME: ${examName}`,
    "",
    "RESEARCH MATERIAL:",
    material.passages.map((p) => `- ${p}`).join("\n"),
    "",
    "Return the pattern + up to 40 clean questions extracted from the material.",
  ].join("\n");

  const result = await generateJson<ExtractionResponse>({
    systemInstruction,
    prompt,
    schema: EXTRACTION_SCHEMA,
  });

  if (result.data && Array.isArray(result.data.sections) && result.data.sections.length > 0) {
    const pattern: ExamPattern = {
      examName: result.data.examName ?? examName,
      durationMinutes: Math.max(10, Math.min(600, result.data.durationMinutes ?? 60)),
      totalQuestions: Math.max(1, result.data.totalQuestions ?? 0),
      negativeMarking: Math.max(0, result.data.negativeMarking ?? 0),
      markingScheme: {
        perQuestion: Math.max(0, result.data.markingScheme?.perQuestion ?? 1),
        negativePerWrong: Math.max(0, result.data.markingScheme?.negativePerWrong ?? 0),
      },
      sections: result.data.sections
        .filter((s) => s.name)
        .map((s) => ({
          name: s.name!,
          topics: (s.topics ?? []).filter(Boolean),
          questionCount: Math.max(1, s.questionCount ?? 1),
          marksPerQuestion: Math.max(0, s.marksPerQuestion ?? 1),
        })),
    };

    const questions: ExamQuestion[] = (result.data.questions ?? [])
      .filter(
        (item) =>
          item.questionText &&
          Array.isArray(item.options) &&
          item.options.length >= 2 &&
          item.options.length <= 6 &&
          typeof item.answerIndex === "number" &&
          item.answerIndex >= 0 &&
          item.answerIndex < item.options.length
      )
      .map((item) => ({
        topic: item.topic ?? "General",
        questionText: item.questionText!.trim(),
        options: item.options!.map((o) => o.trim()),
        answer: item.answerIndex!,
        difficulty: isDifficulty(item.difficulty) ? item.difficulty : "medium",
        source: item.source ?? "extracted from web material",
        sourceType: "pyq" as const,
      }))
      .slice(0, MAX_QUESTIONS);

    return { pattern, questions };
  }

  // Extraction failed or produced nothing usable — degrade to a heuristic
  // pattern over the corpus reference shape so the pipeline can continue.
  const reference = findCorpusExam(examName) ?? EXAM_CORPUS[0];
  console.warn("[placement-extract] LLM extraction empty; using corpus reference shape");
  return {
    pattern: reference.pattern,
    questions: reference.questions.slice(0, MAX_QUESTIONS).map((question) => ({ ...question })),
  };
}