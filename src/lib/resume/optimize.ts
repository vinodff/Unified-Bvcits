// Resume rewriting — the model call and its fallback.
//
// Two paths, and the deterministic one is not a stub: with no model configured
// the optimizer still reorders skills to lead with what the job asked for and
// rebuilds a targeted summary from facts already on the resume. That keeps the
// whole feature working on a machine with zero API keys, the same stance
// MockLLM takes in the marketing pipeline.
//
// The rules about what a rewrite may change live in rewrite.ts (pure, tested).
// This module only decides whether to call a model and what to do when the
// call fails — which it treats as routine, not exceptional.

import { completeJson } from "./llm";
import { resumeSkillSet } from "./gap";
import { mergeModelRewrite, optimizeDeterministically, buildSummary, prioritizeSkills, promoteEvidencedSkills } from "./rewrite";
import { sanitizeSections } from "./types";
import type { RequirementSet, ResumeSections } from "./types";

export interface OptimizeOutcome {
  sections: ResumeSections;
  usedFallback: boolean;
}

export async function optimizeResume(
  sections: ResumeSections,
  requirements: RequirementSet,
  jdText: string,
  extraNotes: string
): Promise<OptimizeOutcome> {
  const deterministic = optimizeDeterministically(sections, requirements);

  const response = await completeJson(
    [
      "Rewrite this student's resume so it targets the job description as closely as the truth allows.",
      "",
      "REWRITE EVERY BULLET. Do not return a bullet unchanged unless it is already excellent. For each one:",
      "- Open with a strong past-tense action verb (Built, Designed, Automated, Led, Optimised, Delivered, Implemented).",
      "- Never open with 'Responsible for', 'Worked on', 'Helped with' or 'Involved in'.",
      "- Keep every number, percentage and scale the original already contains, and keep it exact.",
      "- Name the concrete technology or method the student actually used, taken from their own text.",
      "- State the outcome or purpose, not just the activity. One sentence, 12-30 words.",
      "- Mirror the job description's vocabulary wherever the student's real experience genuinely supports it.",
      "",
      "Write a summary of 2-3 sentences that positions the student for THIS role, using only their real",
      "background, and naming the technologies they actually have that the job asks for.",
      "",
      "HARD RULES — breaking these makes the output unusable:",
      "- Never invent an employer, job title, date, degree, certification, metric or number.",
      "- Never add a number that is not in the original. If a bullet has no metric, improve the verb and the",
      "  specificity instead; do NOT estimate, approximate or invent a figure.",
      "- Only list a skill the student's own resume text already demonstrates or states.",
      "",
      "Return JSON: { summary: string, experience: [{ bullets: string[] }], projects: [{ bullets: string[] }], skills: string[] }.",
      "Keep the experience and projects arrays the same length and order as the input.",
    ].join("\n"),
    {
      resume: sections,
      jobDescription: jdText.slice(0, 6000),
      requiredSkills: requirements.skills,
      // What the resume proves the student can do, including skills mentioned
      // only in prose. Handing this over is what lets the model surface a real
      // skill into the skills list without it counting as an invention.
      evidencedSkills: resumeSkillSet(sections),
      studentNotes: extraNotes.slice(0, 1000),
    }
  );

  if (!response) return { sections: deterministic, usedFallback: true };

  try {
    const merged = mergeModelRewrite(sections, JSON.parse(response.text) as Record<string, unknown>);

    // A rewrite that produced nothing usable is worse than the safe path.
    if (!merged.summary.trim() && merged.experience.length === 0 && merged.projects.length === 0) {
      return { sections: deterministic, usedFallback: true };
    }

    // The model may still leave a thin summary, omit a skill it demonstrated,
    // or return an unhelpful order. Running the deterministic improvements over
    // its output costs nothing and cannot make the result less accurate.
    const polished = sanitizeSections({
      ...merged,
      skills: prioritizeSkills(promoteEvidencedSkills(merged, requirements), requirements),
      summary: buildSummary(merged, requirements, merged.summary),
    });

    return { sections: polished, usedFallback: false };
  } catch {
    return { sections: deterministic, usedFallback: true };
  }
}
