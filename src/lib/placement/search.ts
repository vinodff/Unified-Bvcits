// Web Search Agent — step 1 of the pipeline.
//
// Tries live sources in order of fidelity, then degrades to the curated
// corpus so the pipeline always produces something:
//
//   1. Serper API (SERPER_API_KEY) — real Google results + page snippets.
//   2. Gemini googleSearch grounding — real search inside the LLM call.
//   3. EXAM_CORPUS — deterministic seed knowledge base (marked usedCorpus).
//
// The result is a ResearchMaterial: the sources consulted (honestly recorded)
// and passages the later agents can read. Nothing here decides what is true;
// it collects material.

import "server-only";

import { findCorpusExam, EXAM_CORPUS } from "./corpus";
import { modelChain } from "./gemini";
import type { ResearchMaterial } from "./types";

interface SerperResult {
  title?: string;
  link?: string;
  snippet?: string;
}

interface SerperResponse {
  organic?: SerperResult[];
}

/** One-shot real web search via Serper. Returns raw snippets, or null. */
async function searchWithSerper(examName: string): Promise<ResearchMaterial | null> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;

  const queries = [
    `${examName} exam pattern syllabus marking scheme`,
    `${examName} previous year questions with answers`,
    `${examName} section wise question distribution difficulty`,
  ];

  const sources: ResearchMaterial["sources"] = [];
  const passages: string[] = [];

  for (const query of queries) {
    try {
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: 8 }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;

      const payload = (await response.json()) as SerperResponse;
      for (const item of payload.organic ?? []) {
        if (!item.title && !item.snippet) continue;
        sources.push({
          url: item.link,
          title: item.title ?? "(untitled result)",
          description: item.snippet,
          kind: "web",
        });
        if (item.snippet) passages.push(`[${query}] ${item.snippet}`);
      }
    } catch {
      // A failing query is not fatal; the next query or the corpus takes over.
      console.warn(`[placement-search] serper query failed: ${query}`);
    }
  }

  if (sources.length === 0) return null;
  return { sources, passages, usedCorpus: false };
}

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

interface GroundingCandidate {
  content?: { parts?: { text?: string }[] };
  groundingMetadata?: {
    webSearchQueries?: string[];
    groundingChunks?: GroundingChunk[];
  };
}

/**
 * Search grounding inside a Gemini call — real results without extra keys.
 *
 * IMPORTANT: this asks for plain grounded text, not `responseMimeType:
 * "application/json"`. Combining the `googleSearch` tool with strict JSON
 * mode on the classic generateContent endpoint is not how Google's own
 * grounding examples work (see ai.google.dev/gemini-api/docs/google-search)
 * and produced silent empty/invalid responses here. The real, trustworthy
 * source list comes from `groundingMetadata.groundingChunks` — server-
 * verified search citations — not from asking the model to self-report a
 * `sources` field in JSON, which is what the previous version did.
 */
async function searchWithGeminiGrounding(examName: string): Promise<ResearchMaterial | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = [
    `Research the ${examName} placement exam using web search. Find and report:`,
    "1. Exam pattern: sections, duration, marking scheme, section-wise question distribution.",
    "2. Previous-year questions: actual sample/PYQ questions you can find, with topic and (if available) the correct answer.",
    "3. Frequently tested topics and difficulty trends across recent years.",
    "Prefer official sources and recent editions. Quote or closely paraphrase real questions rather than inventing them.",
  ].join("\n");

  for (const model of modelChain()) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.3 },
          }),
          signal: AbortSignal.timeout(25_000),
        }
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.warn(`[placement-search] ${model} grounding responded ${response.status}: ${detail.slice(0, 300)}`);
        continue;
      }

      const payload = (await response.json()) as { candidates?: GroundingCandidate[] };
      const candidate = payload.candidates?.[0];
      const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];

      if (!text && chunks.length === 0) {
        console.warn(`[placement-search] ${model} grounding returned no content or sources`);
        continue;
      }

      const sources: ResearchMaterial["sources"] = chunks
        .filter((chunk): chunk is GroundingChunk & { web: { uri: string } } => Boolean(chunk.web?.uri))
        .map((chunk) => ({ url: chunk.web.uri, title: chunk.web.title ?? "(search result)", kind: "web" }));

      const queries = candidate?.groundingMetadata?.webSearchQueries ?? [];
      console.info(
        `[placement-search] ${model} grounding ok — ${sources.length} source(s), queries: ${queries.join(" | ") || "(none logged)"}`
      );

      return { sources, passages: text ? [text] : [], usedCorpus: false };
    } catch (error) {
      console.warn(`[placement-search] ${model} grounding failed:`, error instanceof Error ? error.message : error);
    }
  }

  return null;
}

/**
 * Step 1: collect exam pattern + PYQ material.
 *
 * The corpus is the last resort but also the honest record: usedCorpus is true
 * whenever no live backend answered, and the UI shows it as such.
 */
export async function collectExamMaterial(examName: string): Promise<ResearchMaterial> {
  const live = (await searchWithSerper(examName)) ?? (await searchWithGeminiGrounding(examName));
  if (live) return live;

  const corpus = findCorpusExam(examName);
  if (corpus) {
    return {
      sources: [
        {
          title: `${corpus.pattern.examName} — curated seed knowledge base`,
          kind: "corpus",
          description: `Pattern, sections and ${corpus.questions.length} verified-flavoured seed questions.`,
        },
      ],
      passages: [
        `Corpus profile matched: ${corpus.pattern.examName}.`,
        `Duration: ${corpus.pattern.durationMinutes} minutes, ${corpus.pattern.totalQuestions} questions.`,
        ...corpus.pattern.sections.map(
          (s) => `Section "${s.name}": ${s.questionCount} questions, ${s.marksPerQuestion} mark(s) each. Topics: ${s.topics.join(", ")}.`
        ),
        ...(corpus.pattern.notes ?? []),
        ...corpus.questions.map((question) => {
          const options = question.options.map((o, i) => `${i + 1}) ${o}`).join(" ");
          return `Q [${question.topic}/${question.difficulty}] ${question.questionText} ${options} Answer: ${question.options[question.answer]}`;
        }),
      ],
      usedCorpus: true,
    };
  }

  // No live backend and no corpus match: we can still hand the reviewer a
  // generic shape and let the extraction agent structure it.
  const generic = EXAM_CORPUS[0];
  return {
    sources: [
      {
        title: "No live search or corpus match — using generic aptitude reference",
        kind: "fallback",
      },
    ],
    passages: [
      `No structured data found for "${examName}". Using a generic aptitude/placement exam shape as reference until a live search backend (SERPER_API_KEY) is configured.`,
      ...generic.pattern.sections.map(
        (s) => `Generic section "${s.name}": ${s.questionCount} questions, topics ${s.topics.join(", ")}.`
      ),
    ],
    usedCorpus: false,
  };
}