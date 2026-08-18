// Pure resume-rewriting logic: the deterministic optimizer, and the merge that
// decides how much of a model's output is allowed through.
//
// Kept separate from optimize.ts (which imports the "server-only" LLM client)
// so these rules are testable without a server or an API key — the same
// pure/IO split as jd-sanitize.ts vs jd-fetch.ts.
//
// Neither function here can introduce a fact. mergeModelRewrite() is the
// enforcement point for that: the model's prompt asks it not to fabricate, but
// this is what makes fabrication structurally impossible for the fields that
// matter most.

import { resumeSkillSet } from "./gap";
import { normalizeSkill } from "./skills";
import { sanitizeSections } from "./types";
import type { RequirementSet, ResumeSections } from "./types";

/**
 * Orders the resume's own skills so the ones the job asked for come first.
 *
 * The highest-leverage safe edit available: it changes nothing about what the
 * student claims, but a recruiter skimming the first line of a skills list
 * sees the relevant half instead of whatever order it was typed in.
 */
export function prioritizeSkills(skills: readonly string[], requirements: RequirementSet): string[] {
  const wanted = new Set(requirements.skills.map(normalizeSkill));
  const relevant = skills.filter((s) => wanted.has(normalizeSkill(s)));
  const rest = skills.filter((s) => !wanted.has(normalizeSkill(s)));
  return [...relevant, ...rest];
}

/**
 * Adds skills the resume already DEMONSTRATES but never listed.
 *
 * A student who wrote "Built a full-stack platform using React and SQL" in a
 * project bullet, but whose Skills line says only "Python", was scoring 0% on
 * keyword match against a React job. They have the skill and they proved it —
 * the resume just never put it where a keyword scanner looks.
 *
 * This is not fabrication and the distinction matters: every skill added here
 * came out of the student's own sentences via the skills dictionary, so the
 * evidence map grades each one VERIFIED against the original. Nothing is
 * invented; something already earned is made visible.
 */
export function promoteEvidencedSkills(sections: ResumeSections, requirements: RequirementSet): string[] {
  const listed = sections.skills.map(normalizeSkill);
  const demonstrated = resumeSkillSet(sections); // includes skills found in prose
  const wanted = new Set(requirements.skills.map(normalizeSkill));

  // Job-relevant evidenced skills first, then any other evidenced ones. A
  // resume should not balloon with every term the dictionary spotted, so
  // off-target additions are capped.
  const missingRelevant = demonstrated.filter((s) => wanted.has(normalizeSkill(s)) && !listed.includes(normalizeSkill(s)));
  const missingOther = demonstrated
    .filter((s) => !wanted.has(normalizeSkill(s)) && !listed.includes(normalizeSkill(s)))
    .slice(0, 6);

  return [...sections.skills, ...missingRelevant, ...missingOther];
}

/**
 * A summary built only from facts already present.
 *
 * Used when the student has no summary, or one so short it fails the ATS
 * check. Never states a year count or a seniority the resume does not already
 * support.
 */
export function buildSummary(sections: ResumeSections, requirements: RequirementSet, existing: string): string {
  if (existing.trim().length >= 40) return existing;

  const wanted = requirements.skills.map(normalizeSkill);
  const matched = resumeSkillSet(sections).filter((s) => wanted.includes(normalizeSkill(s)));

  const parts: string[] = [sections.education[0]?.degree ? `${sections.education[0].degree} student` : "Engineering student"];
  if (matched.length > 0) parts.push(`with hands-on experience in ${matched.slice(0, 5).join(", ")}`);
  if (sections.projects.length > 0) parts.push(`across ${sections.projects.length} project${sections.projects.length === 1 ? "" : "s"}`);

  return `${parts.join(" ")}.`;
}

/** The no-model path. Safe, boring, and never wrong about facts. */
export function optimizeDeterministically(sections: ResumeSections, requirements: RequirementSet): ResumeSections {
  return sanitizeSections({
    ...sections,
    summary: buildSummary(sections, requirements, sections.summary),
    skills: prioritizeSkills(promoteEvidencedSkills(sections, requirements), requirements),
  });
}

/**
 * Merges a model's rewrite onto the original.
 *
 * Only the fields a rewrite is allowed to touch are taken from the model —
 * summary text, bullet wording, and skill ORDER. Organizations, roles, dates,
 * institutions, degrees, certifications and contact details are copied from
 * the original no matter what the model returned, so a hallucinated employer
 * cannot reach the output at all. The model also cannot change how many
 * entries exist: it rewrites entry N's bullets or it doesn't, and the count is
 * fixed by the original.
 */
export function mergeModelRewrite(original: ResumeSections, model: Record<string, unknown>): ResumeSections {
  const modelExperience = Array.isArray(model.experience) ? model.experience : [];
  const modelProjects = Array.isArray(model.projects) ? model.projects : [];

  const asBullets = (value: unknown, fallback: string[]): string[] => {
    if (!Array.isArray(value)) return fallback;
    const bullets = value.filter((b): b is string => typeof b === "string" && b.trim().length > 0);
    return bullets.length > 0 ? bullets : fallback;
  };

  return sanitizeSections({
    // There is no rewriting a phone number or a degree into something better,
    // only into something wrong — so these are copied wholesale.
    contact: original.contact,
    education: original.education,
    certifications: original.certifications,

    summary: typeof model.summary === "string" && model.summary.trim() ? model.summary : original.summary,

    experience: original.experience.map((entry, i) => ({
      ...entry,
      bullets: asBullets((modelExperience[i] as Record<string, unknown> | undefined)?.bullets, entry.bullets),
    })),

    projects: original.projects.map((entry, i) => ({
      ...entry,
      bullets: asBullets((modelProjects[i] as Record<string, unknown> | undefined)?.bullets, entry.bullets),
    })),

    // Skills may be reordered and surfaced, never invented. "Allowed" is
    // everything the resume EVIDENCES — the listed skills plus any the
    // dictionary finds inside the student's own bullets, projects and summary —
    // not merely what the Skills line happened to contain. Restricting it to
    // the latter meant a student who described building with React but forgot
    // to list it could never match a React job, which punished a formatting
    // omission as though it were a missing skill. Anything the model returns
    // outside that evidenced set is still dropped.
    skills: (() => {
      const allowed = new Set([...original.skills, ...resumeSkillSet(original)].map(normalizeSkill));
      const returned = Array.isArray(model.skills)
        ? model.skills.filter((s): s is string => typeof s === "string" && allowed.has(normalizeSkill(s)))
        : [];
      if (returned.length === 0) return original.skills;
      const returnedNormalized = returned.map(normalizeSkill);
      return [...returned, ...original.skills.filter((s) => !returnedNormalized.includes(normalizeSkill(s)))];
    })(),
  });
}
