import { describe, expect, it } from "vitest";
import { parsePastedResume, reflow } from "./parse-paste";

const CLEAN = `Jane Doe
jane.doe@example.com
+91 98765 43210
Amalapuram, Andhra Pradesh

SUMMARY
Final-year CSE student focused on backend development.

EDUCATION
BVCITS (2022 - 2026)
B.Tech Computer Science

EXPERIENCE
Acme Corp - Backend Intern (2025)
- Built a REST API using Django and PostgreSQL
- Reduced query time by 30%

PROJECTS
Portfolio Site
- Built a personal site with Next.js and Tailwind

SKILLS
Python, Django, PostgreSQL, React

CERTIFICATIONS
AWS Cloud Practitioner (2025)
Amazon Web Services
`;

/**
 * The real failure case: a PDF export whose line breaks were lost, so every
 * heading is welded to the sentence before it. Taken from an actual run.
 */
const FLAT =
  "Motivated B.Tech (CSE) student with strong full-stack development skills, AI prompt engineering expertise, and content creation " +
  "experience. Proven leadership through hackathons and real-world projects. Passionate about building innovative solutions, learning " +
  "emerging technologies, and using AI to improve productivity and simplify work.PROFILE / SUMMARYEDUCATIONB.TECH CSE STUDENTVINOD KUMAR " +
  "KONDETIvinodkondeti081@gmail.com+91 8019238515Sakhinetipalli, Razole, Andhra Pradesh, IndiaPROJECTSCollege Website – Hackathon Project " +
  "Designed and developed a full-stack web platform for college operations. Implemented new modules to improve student experience. " +
  "SKILLSPython, JavaScript, React, SQL, Full Stack Development";

describe("parsePastedResume — well-formed input", () => {
  it("extracts contact info", () => {
    const result = parsePastedResume(CLEAN);
    expect(result.contact.fullName).toBe("Jane Doe");
    expect(result.contact.email).toBe("jane.doe@example.com");
    expect(result.contact.phone).toContain("98765");
  });

  it("extracts the summary", () => {
    expect(parsePastedResume(CLEAN).summary).toContain("backend development");
  });

  it("extracts education with years split out", () => {
    const [entry] = parsePastedResume(CLEAN).education;
    expect(entry.institution).toBe("BVCITS");
    expect(entry.years).toContain("2022");
    expect(entry.degree).toBe("B.Tech Computer Science");
  });

  it("extracts experience with its bullets", () => {
    const [entry] = parsePastedResume(CLEAN).experience;
    expect(entry.organization).toBe("Acme Corp");
    expect(entry.role).toContain("Backend Intern");
    expect(entry.bullets).toEqual(
      expect.arrayContaining([expect.stringContaining("REST API"), expect.stringContaining("30%")])
    );
  });

  it("extracts projects", () => {
    const [entry] = parsePastedResume(CLEAN).projects;
    expect(entry.name).toContain("Portfolio Site");
    expect(entry.bullets.length).toBeGreaterThan(0);
  });

  it("extracts skills as a normalized list", () => {
    expect(parsePastedResume(CLEAN).skills).toEqual(expect.arrayContaining(["python", "django", "postgresql", "react"]));
  });

  it("extracts certifications", () => {
    expect(parsePastedResume(CLEAN).certifications.length).toBeGreaterThan(0);
  });
});

describe("reflow — repairing PDF text that lost its line breaks", () => {
  it("breaks a heading away from the sentence it was welded to", () => {
    expect(reflow(FLAT)).toMatch(/\nPROFILE \/ SUMMARY\n/i);
  });

  it("separates two headings that ran together", () => {
    const lines = reflow(FLAT).split("\n").map((l) => l.trim().toUpperCase());
    expect(lines).toContain("EDUCATION");
    expect(lines).toContain("SKILLS");
  });

  it("leaves well-formed text untouched", () => {
    expect(reflow(CLEAN)).toBe(CLEAN.replace(/\r\n?/g, "\n"));
  });
});

describe("parsePastedResume — the real PDF-export failure", () => {
  const result = parsePastedResume(FLAT);

  it("does NOT promote the summary paragraph to the candidate's name", () => {
    // The original defect: the whole first paragraph became the resume's name,
    // rendering as a 3-line all-caps heading on the optimized document.
    expect(result.contact.fullName.length).toBeLessThanOrEqual(60);
    expect(result.contact.fullName.toLowerCase()).not.toContain("motivated");
  });

  it("still finds the email and phone", () => {
    expect(result.contact.email).toBe("vinodkondeti081@gmail.com");
    expect(result.contact.phone).toContain("8019238515");
  });

  it("recovers the summary text", () => {
    expect(result.summary.toLowerCase()).toContain("full-stack");
  });

  it("recovers skills instead of returning an empty resume", () => {
    expect(result.skills.length).toBeGreaterThan(0);
    expect(result.skills).toEqual(expect.arrayContaining(["python", "javascript", "react"]));
  });

  it("recovers a projects section", () => {
    expect(result.projects.length).toBeGreaterThan(0);
  });

  it("produces a resume with real content rather than only a summary", () => {
    const populated = [result.skills.length, result.projects.length, result.education.length, result.experience.length].filter(
      (n) => n > 0
    );
    expect(populated.length).toBeGreaterThanOrEqual(2);
  });
});

describe("parsePastedResume — robustness", () => {
  it("handles text with no recognizable sections without throwing", () => {
    expect(() => parsePastedResume("just some random text")).not.toThrow();
  });

  it("handles an empty string", () => {
    expect(() => parsePastedResume("")).not.toThrow();
  });

  it("strips a category prefix from a skills line", () => {
    const result = parsePastedResume("SKILLS\nLanguages: Python, Java\nTools: Git, Docker");
    expect(result.skills).toEqual(expect.arrayContaining(["python", "java", "git", "docker"]));
    expect(result.skills).not.toContain("languages");
    expect(result.skills).not.toContain("tools");
  });

  it("splits entries on a date line when there are no blank lines", () => {
    const result = parsePastedResume(
      "EXPERIENCE\nAcme Corp - Intern (2025)\n- Did a thing\nBeta Ltd - Analyst (2024)\n- Did another thing"
    );
    expect(result.experience).toHaveLength(2);
  });
});
