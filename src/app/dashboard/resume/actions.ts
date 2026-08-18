"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/auth/server";
import { parsePastedResume, runOptimization } from "@/lib/resume";
import type { OptimizationResult } from "@/lib/resume";
import { extractResumeText } from "@/lib/resume/extract-file";
import { fetchJobDescription } from "@/lib/resume/jd-fetch";

const MAX_RESUME_TEXT = 40000;
const MAX_JD_TEXT = 20000;
const MAX_NOTES = 1000;
const MIN_RESUME_TEXT = 80;
const MIN_JD_TEXT = 60;

// ---------------------------------------------------------------------------
// Upload → text
// ---------------------------------------------------------------------------

export interface UploadState {
  error: string | null;
  text: string | null;
  fileName: string | null;
}

/**
 * Extracts text from an uploaded resume file.
 *
 * Deliberately separate from the optimize action: the student sees the
 * extracted text land in the textarea and can fix a bad extraction before
 * spending a model call on it. A PDF that parses into gibberish is obvious at
 * this point and invisible if we went straight to optimizing.
 */
export async function uploadResumeFile(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await getSessionUser();
  if (!user || user.role !== "student") return { error: "Only student accounts can use this.", text: null, fileName: null };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file received.", text: null, fileName: null };

  const result = await extractResumeText(file);
  if (!result.ok) return { error: result.error, text: null, fileName: file.name };

  return { error: null, text: result.text, fileName: file.name };
}

// ---------------------------------------------------------------------------
// JD URL → text
// ---------------------------------------------------------------------------

export interface JdFetchState {
  error: string | null;
  text: string | null;
}

export async function fetchJdFromUrl(_prev: JdFetchState, formData: FormData): Promise<JdFetchState> {
  const user = await getSessionUser();
  if (!user || user.role !== "student") return { error: "Only student accounts can use this.", text: null };

  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { error: "Paste a link first.", text: null };

  const result = await fetchJobDescription(url);
  return result.ok ? { error: null, text: result.text } : { error: result.error, text: null };
}

// ---------------------------------------------------------------------------
// The optimization run
// ---------------------------------------------------------------------------

export interface OptimizeState {
  error: string | null;
  result: OptimizationResult | null;
  originalText: string | null;
}

/**
 * Runs the full pipeline and persists the result.
 *
 * The resume row is upserted first so the optimization has something to hang
 * off, and so a student who returns tomorrow still has their source text —
 * which is also the evidence base the trust score was computed against, so
 * losing it would make an old run's trust score unverifiable.
 *
 * A persistence failure does NOT fail the request: the student came for the
 * analysis, and they should get it even if history could not be written. The
 * error is logged rather than surfaced, matching how setSavedStatus treats a
 * failed opportunity save.
 */
export async function optimizeForJob(_prev: OptimizeState, formData: FormData): Promise<OptimizeState> {
  const user = await getSessionUser();
  if (!user || user.role !== "student") {
    return { error: "Only student accounts can use the resume optimizer.", result: null, originalText: null };
  }

  const resumeText = String(formData.get("resumeText") ?? "").trim().slice(0, MAX_RESUME_TEXT);
  const jdText = String(formData.get("jdText") ?? "").trim().slice(0, MAX_JD_TEXT);
  const jdUrl = String(formData.get("jdUrl") ?? "").trim().slice(0, 500) || null;
  const extraNotes = String(formData.get("extraNotes") ?? "").trim().slice(0, MAX_NOTES);

  if (resumeText.length < MIN_RESUME_TEXT) {
    return { error: "Add your resume first — paste the text or upload a PDF.", result: null, originalText: null };
  }
  if (jdText.length < MIN_JD_TEXT) {
    return { error: "Add the job description you're targeting.", result: null, originalText: null };
  }

  const sections = parsePastedResume(resumeText);

  let result: OptimizationResult;
  try {
    result = await runOptimization({ sections, originalText: resumeText, jdText, extraNotes });
  } catch (error) {
    console.error("[resume] optimization failed:", error instanceof Error ? error.message : error);
    return { error: "Could not analyse that resume. Try again in a moment.", result: null, originalText: null };
  }

  await persist(user.id, { resumeText, jdText, jdUrl, extraNotes, result });

  revalidatePath("/dashboard/resume");
  return { error: null, result, originalText: resumeText };
}

async function persist(
  studentId: string,
  input: { resumeText: string; jdText: string; jdUrl: string | null; extraNotes: string; result: OptimizationResult }
): Promise<void> {
  try {
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("resumes")
      .select("id")
      .eq("student_id", studentId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let resumeId = existing?.id as string | undefined;

    if (resumeId) {
      await supabase
        .from("resumes")
        .update({ original_text: input.resumeText, sections: parsePastedResume(input.resumeText) })
        .eq("id", resumeId)
        .eq("student_id", studentId);
    } else {
      const { data: created } = await supabase
        .from("resumes")
        .insert({ student_id: studentId, original_text: input.resumeText, sections: parsePastedResume(input.resumeText) })
        .select("id")
        .single();
      resumeId = created?.id;
    }

    if (!resumeId) return;

    const { result } = input;
    await supabase.from("resume_optimizations").insert({
      resume_id: resumeId,
      student_id: studentId,
      jd_text: input.jdText,
      jd_url: input.jdUrl,
      extra_notes: input.extraNotes || null,
      before_score: result.before.overall,
      after_score: result.after.overall,
      before_subscores: result.before.subScores,
      after_subscores: result.after.subScores,
      matched_skills: result.matchedSkills,
      missing_skills: result.missingSkills,
      keyword_coverage: result.keywordCoverage,
      trust_score: result.evidence.trustScore,
      evidence: result.evidence.items,
      skill_gaps: result.skillGaps,
      optimized_sections: result.optimizedSections,
    });
  } catch (error) {
    // Deliberately swallowed — see the doc comment on optimizeForJob.
    console.error("[resume] could not persist run:", error instanceof Error ? error.message : error);
  }
}
