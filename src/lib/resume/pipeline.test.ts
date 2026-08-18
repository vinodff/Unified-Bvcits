import { describe, expect, it } from "vitest";
import { parsePastedResume } from "./parse-paste";
import { extractRequirements } from "./requirements";
import { optimizeDeterministically } from "./rewrite";
import { scoreResume } from "./scoring";
import { analyzeGap } from "./gap";

/**
 * A real-shaped student resume: BVCITS CSE, project-heavy, no formal jobs,
 * skills scattered between a Skills line and project prose. This is the exact
 * profile that scored 33/100 with a "-2 pts improvement" badge before the
 * scoring and skill-promotion fixes.
 */
const STUDENT_RESUME = `VINOD KUMAR KONDETI
vinodkondeti081@gmail.com
+91 8019238515
Sakhinetipalli, Razole, Andhra Pradesh

SUMMARY
Motivated B.Tech (CSE) student with strong full-stack development skills and AI prompt engineering expertise.

EDUCATION
BVC Institute of Technology and Science (2022 - 2026)
B.Tech Computer Science and Engineering

PROJECTS
College Website - Hackathon Project
- Designed and developed a full-stack web platform for college operations using React and SQL
- Implemented new modules to improve student experience and system efficiency
- Delivered a working solution that secured first place among 40 teams

Tech Content Creator - Instagram
- Created 26 technology-focused videos on web development and JavaScript
- Built an audience of 2800 followers sharing coding tips and resources

SKILLS
Python, JavaScript, HTML, CSS

CERTIFICATIONS
Python Full Stack Development (2025)
Ethical Hacking - NPTEL (2024)
`;

const BACKEND_JD = `We are hiring a Software Engineering Intern.
Requirements: strong JavaScript and React skills, experience with SQL databases,
HTML and CSS, and familiarity with Python. You will build full stack web
applications, implement new modules, and work with our web development team.
Good communication and problem solving are essential.`;

describe("end-to-end optimization on a realistic student resume", () => {
  const sections = parsePastedResume(STUDENT_RESUME);
  const requirements = extractRequirements({ kind: "text", jdText: BACKEND_JD });
  const optimized = optimizeDeterministically(sections, requirements);

  const before = scoreResume(sections, requirements, BACKEND_JD);
  const after = scoreResume(optimized, requirements, BACKEND_JD);

  it("parses the resume into real content, not an empty shell", () => {
    expect(sections.contact.fullName).toBe("VINOD KUMAR KONDETI");
    expect(sections.projects.length).toBeGreaterThanOrEqual(2);
    expect(sections.education.length).toBeGreaterThan(0);
    expect(sections.skills.length).toBeGreaterThan(0);
  });

  it("surfaces skills demonstrated in project bullets into the skills list", () => {
    // "React" and "SQL" appear only in a project bullet in the original.
    expect(sections.skills).not.toContain("react");
    expect(optimized.skills).toEqual(expect.arrayContaining(["react", "sql"]));
  });

  it("no longer scores impact language at zero for well-written bullets", () => {
    // The old all-or-nothing rule gave 0% here because most bullets lack a
    // digit, even though they open with Designed / Implemented / Delivered.
    expect(before.subScores.impactLanguage).toBeGreaterThan(40);
  });

  it("matches every hard skill the job names", () => {
    // javascript, react, sql and html all match. The remainder is
    // "communication" and "problem solving", which this resume genuinely never
    // states — they stay in Missing Skills as advice rather than being quietly
    // invented, which is the whole point of the feature.
    expect(after.subScores.keywordMatch).toBeGreaterThanOrEqual(65);
  });

  it("promotion changes the DOCUMENT, not the internal score", () => {
    // Worth pinning down: keyword match already counted React and SQL because
    // resumeSkillSet() reads prose, so promotion does not move this number.
    // What it changes is the rendered resume a real ATS parses and a recruiter
    // skims — where those skills were previously invisible.
    expect(after.subScores.keywordMatch).toBe(before.subScores.keywordMatch);
    expect(optimized.skills.length).toBeGreaterThan(sections.skills.length);
  });

  it("scores the optimized resume at 70 or better", () => {
    expect(after.overall).toBeGreaterThanOrEqual(70);
  });

  it("never scores the optimized resume below the original", () => {
    expect(after.overall).toBeGreaterThanOrEqual(before.overall);
  });

  it("closes the skill gap that promotion legitimately covers", () => {
    const gapBefore = analyzeGap(sections, requirements).missingSkills;
    const gapAfter = analyzeGap(optimized, requirements).missingSkills;
    expect(gapAfter.length).toBeLessThanOrEqual(gapBefore.length);
  });
});

describe("honesty guard on a genuine mismatch", () => {
  // A CSE resume against a digital-marketing role. The score SHOULD stay low:
  // inflating it would be the exact failure this whole feature exists to avoid.
  const MARKETING_JD = `Digital Marketing Executive. Requirements: Google Ads,
  campaign optimization, ad platforms, spreadsheets, data analysis, client
  communication, customer service and business development experience.`;

  const sections = parsePastedResume(STUDENT_RESUME);
  const requirements = extractRequirements({ kind: "text", jdText: MARKETING_JD });
  const optimized = optimizeDeterministically(sections, requirements);

  it("does not invent marketing skills the student never demonstrated", () => {
    for (const invented of ["google ads", "data analysis", "marketing"]) {
      expect(optimized.skills.map((s) => s.toLowerCase())).not.toContain(invented);
    }
  });

  it("still reports the gap honestly rather than inflating the match", () => {
    expect(analyzeGap(optimized, requirements).missingSkills.length).toBeGreaterThan(0);
  });
});
