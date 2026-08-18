// Pipeline orchestrator — runs the five agents and persists every artifact.
//
//   research  -> collectExamMaterial        (Web Search Agent)
//   extract   -> extractMaterial            (Data Extraction Agent)
//   process   -> processQuestions           (Data Processing Agent)
//   review    -> reviewExam                 (AI Reviewer Agent)
//   generate  -> generatePaper              (Question Paper Generation Agent)
//
// Every step writes its outcome to `exam_research` and updates
// `exam_pipeline_steps` + `exam_definitions.status` so the admin UI can poll
// progress. Runs server-side with the service client (RLS is irrelevant here —
// the caller is already gated by the exams.create capability).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExamPattern, ExamQuestion, ExamPipelineStatus, ExtractedMaterial } from "./types";
import { collectExamMaterial } from "./search";
import { extractMaterial } from "./extract";
import { processQuestions } from "./process";
import { reviewExam } from "./reviewer";
import { generatePaper } from "./generator";

export const STEP_STATUS_TO_EXAM_STATUS: Record<string, ExamPipelineStatus> = {
  research: "researching",
  extract: "extracting",
  process: "processing",
  review: "reviewing",
  generate: "generating",
};

export interface PipelineInput {
  examId: string;
  examName: string;
  adminUserId: string;
}

interface StepResult {
  pattern?: ExamPattern;
  questions?: ExamQuestion[];
  message?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runPipeline(
  supabase: SupabaseClient,
  input: PipelineInput
): Promise<{ ok: boolean; error?: string }> {
  const { examId, examName, adminUserId } = input;

  const setStatus = async (status: ExamPipelineStatus, errorMessage?: string | null) => {
    const patch: Record<string, unknown> = { status };
    if (errorMessage !== undefined) patch.error_message = errorMessage;
    await supabase.from("exam_definitions").update(patch).eq("id", examId);
  };

  const markStep = async (
    step: string,
    status: "pending" | "running" | "done" | "failed",
    message?: string
  ) => {
    const patch: Record<string, unknown> = { status };
    if (message) patch.message = message;
    if (status === "running") patch.started_at = new Date().toISOString();
    if (status === "done" || status === "failed") patch.finished_at = new Date().toISOString();
    await supabase.from("exam_pipeline_steps").update(patch).eq("exam_id", examId).eq("step", step);
  };

  const ensureSteps = async () => {
    const { data: existing } = await supabase
      .from("exam_pipeline_steps")
      .select("step")
      .eq("exam_id", examId);
    const have = new Set((existing ?? []).map((row) => row.step));
    const steps = ["research", "extract", "process", "review", "generate"] as const;
    for (const step of steps) {
      if (!have.has(step)) {
        await supabase.from("exam_pipeline_steps").insert({ exam_id: examId, step });
      }
    }
  };

  const storeResearch = async (patch: Record<string, unknown>) => {
    await supabase.from("exam_research").upsert({ exam_id: examId, ...patch });
  };

  try {
    await ensureSteps();
    await setStatus("researching");

    // --- 1. Web Search Agent ------------------------------------------------
    await markStep("research", "running", "Searching the web for exam patterns and previous-year questions…");
    const material = await collectExamMaterial(examName);
    await storeResearch({ sources: material.sources, raw_material: [] });
    await markStep("research", "done", material.usedCorpus
      ? "Live search unavailable — used the curated seed knowledge base."
      : `Collected ${material.sources.length} sources.`);

    // --- 2. Data Extraction Agent ------------------------------------------
    await setStatus("extracting");
    await markStep("extract", "running", "Extracting pattern and questions from the material…");
    const extracted: ExtractedMaterial = await extractMaterial(examName, material);
    await storeResearch({
      pattern: extracted.pattern,
      raw_material: extracted.questions,
      sources: material.sources,
    });
    await markStep("extract", "done", `Pattern with ${extracted.pattern.sections.length} sections; ${extracted.questions.length} raw questions.`);

    // --- 3. Data Processing Agent ------------------------------------------
    await setStatus("processing");
    await markStep("process", "running", "Cleaning, deduplicating and categorising questions…");
    const processed = processQuestions(extracted.questions, extracted.pattern);
    await storeResearch({ processed_dataset: processed.questions });
    await markStep("process", "done", `Bank: ${processed.questions.length} questions (${processed.duplicatesRemoved} duplicates, ${processed.unusableRemoved} unusable removed).`);

    if (processed.questions.length === 0) {
      throw new Error("The processed question bank is empty — nothing to build a paper from.");
    }

    // --- 4. AI Reviewer Agent ----------------------------------------------
    await setStatus("reviewing");
    await markStep("review", "running", "AI reviewer analysing weightage, trends and difficulty…");
    const { insights, blueprint } = await reviewExam(examName, extracted.pattern, processed.questions);
    await storeResearch({ reviewer_insights: insights, blueprint });
    await markStep("review", "done", insights.summary);

    // --- 5. Question Paper Generation Agent --------------------------------
    await setStatus("generating");
    await markStep("generate", "running", "Assembling the predicted paper from the blueprint…");
    const paper = await generatePaper(examName, blueprint, processed.questions);

    // Persist the bank + paper inside one logical flow (no transaction across
    // two tables via PostgREST; a failure here just leaves a retryable exam).
    const questionIds: string[] = [];
    for (const item of paper.items) {
      const { data: inserted, error: insertError } = await supabase
        .from("questions")
        .insert({
          exam_id: examId,
          topic: item.question.topic,
          subtopic: null,
          question_text: item.question.questionText,
          options: item.question.options,
          answer: item.question.answer,
          explanation: item.question.explanation ?? null,
          difficulty: item.question.difficulty,
          source: item.question.source ?? null,
          source_type: item.question.sourceType,
          created_by: adminUserId,
        })
        .select("id")
        .single();
      if (insertError) throw new Error(`Failed to persist a question: ${insertError.message}`);
      questionIds.push(inserted.id);
    }

    const { data: paperRow, error: paperError } = await supabase
      .from("papers")
      .insert({
        exam_id: examId,
        title: paper.title,
        description: paper.description,
        duration_minutes: paper.durationMinutes,
        sections: paper.sections,
        status: "review",
        total_marks: paper.totalMarks,
        created_by: adminUserId,
      })
      .select("id")
      .single();
    if (paperError) throw new Error(`Failed to create the paper: ${paperError.message}`);

    const memberships = paper.items.map((item, index) => ({
      paper_id: paperRow.id,
      question_id: questionIds[index],
      order_no: index + 1,
      marks: item.marks,
    }));
    const { error: membershipError } = await supabase
      .from("paper_questions")
      .insert(memberships);
    if (membershipError) throw new Error(`Failed to attach questions: ${membershipError.message}`);

    await markStep("generate", "done", `Paper ready for review: ${paper.items.length} questions, ${paper.totalMarks} marks.`);
    await setStatus("review");

    // A little breathing room so the final status lands after the last step row.
    await sleep(150);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pipeline failure";
    console.error("[placement-pipeline] failed:", error);
    try {
      await markStep("generate", "failed", message);
      await setStatus("failed", message);
    } catch {
      // The failure may itself be a DB problem; the exam row keeps 'failed'
      // as best-effort.
    }
    return { ok: false, error: message };
  }
}