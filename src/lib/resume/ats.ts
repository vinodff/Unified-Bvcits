// ATS compatibility check (pipeline stage 4): structural checks only.
//
// A typical ATS checker has to guess at a document's layout (columns, text
// boxes, images an OCR can't read) because it's parsing someone else's PDF.
// This resume is rendered from our own structured `sections` — see
// docs/resume-optimizer plan — so layout-safety is guaranteed by
// construction. What's left to check is content completeness: the things a
// recruiter's scanner (or a recruiter) actually penalizes a resume for.
//
// Deterministic, same convention as runQualityCheck() in
// src/lib/marketing/agents/quality-agent.ts: start from a clean score and
// deduct for each concrete issue found, so the score is always explainable
// by the issues list sitting next to it.

import type { AtsResult, ResumeSections } from "./types";

const MAX_BULLET_LENGTH = 220;
const MIN_BULLET_LENGTH = 15;

function allBullets(sections: ResumeSections): string[] {
  return [...sections.experience.flatMap((e) => e.bullets), ...sections.projects.flatMap((p) => p.bullets)];
}

export function checkAts(sections: ResumeSections): AtsResult {
  const issues: string[] = [];
  let score = 100;

  if (!sections.contact.email.trim()) {
    issues.push("No email address in the contact section — recruiters and ATS systems need one to reach you.");
    score -= 15;
  }
  if (!sections.contact.phone.trim()) {
    issues.push("No phone number in the contact section.");
    score -= 5;
  }

  if (!sections.summary.trim()) {
    issues.push("No summary — a 2–3 line summary at the top helps both a human skim and an ATS keyword scan.");
    score -= 10;
  } else if (sections.summary.trim().length < 40) {
    issues.push("The summary is very short — expand it to cover your target role and top skills.");
    score -= 5;
  }

  if (sections.education.length === 0) {
    issues.push("No education entries.");
    score -= 10;
  }

  if (sections.experience.length === 0 && sections.projects.length === 0) {
    issues.push("No experience or project entries — at least one is needed to show what you've actually built.");
    score -= 20;
  }

  if (sections.skills.length === 0) {
    issues.push("The skills list is empty — this is what most keyword scans check first.");
    score -= 15;
  }

  const entriesWithNoBullets = [...sections.experience, ...sections.projects].filter((e) => e.bullets.length === 0);
  if (entriesWithNoBullets.length > 0) {
    issues.push("One or more experience/project entries have no bullet points describing what you did.");
    score -= 5;
  }

  const bullets = allBullets(sections).map((b) => b.trim()).filter(Boolean);
  if (bullets.some((b) => b.length > MAX_BULLET_LENGTH)) {
    issues.push(`Some bullets are longer than ${MAX_BULLET_LENGTH} characters — split them so each stays scannable on one line.`);
    score -= 5;
  }
  if (bullets.some((b) => b.length < MIN_BULLET_LENGTH)) {
    issues.push("Some bullets are too short to describe real impact — add what you did and the result.");
    score -= 5;
  }

  return { score: Math.max(0, score), issues };
}
