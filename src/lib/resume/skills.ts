// Canonical skill vocabulary used to turn free text (a pasted JD, a pasted
// resume, a project's "stack" field) into a normalized skill list.
//
// Same philosophy as DEPARTMENT_KEYWORDS in src/lib/opportunities/score.ts:
// plain-text matching over an explicit list rather than embeddings or an LLM
// call. It is inspectable, free, and when it misses a skill a human can see
// exactly why and extend the list — which matters here more than in ranking,
// because a missed skill becomes a false "you're missing this" on a
// student's resume.

export const KNOWN_SKILLS = [
  // languages
  "python", "java", "javascript", "typescript", "c", "c++", "c#", "go", "rust", "kotlin", "swift", "php", "ruby", "sql", "r", "scala", "dart", "matlab",
  // web / frontend
  "react", "next.js", "vue", "angular", "html", "css", "tailwind", "redux", "graphql", "rest api", "webpack",
  // backend / infra
  "node.js", "express", "django", "flask", "spring", "spring boot", "fastapi", ".net", "microservices",
  // data / ml
  "machine learning", "deep learning", "nlp", "computer vision", "data science", "data analysis", "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch", "keras", "statistics", "data visualization", "power bi", "tableau", "excel",
  // cloud / devops
  "aws", "azure", "gcp", "docker", "kubernetes", "ci/cd", "jenkins", "terraform", "linux", "git", "github", "devops",
  // databases
  "mysql", "postgresql", "mongodb", "redis", "firebase", "oracle", "database design",
  // mobile
  "android", "ios", "flutter", "react native",
  // core cs
  "data structures", "algorithms", "object-oriented programming", "system design", "operating systems", "computer networks", "dbms",
  // electronics / core engineering (non-CSE departments)
  "embedded systems", "vlsi", "iot", "verilog", "vhdl", "signal processing", "pcb design", "plc", "scada", "autocad", "solidworks", "ansys", "matlab simulink", "power systems", "renewable energy", "structural analysis", "surveying", "revit",
  // business / soft
  "project management", "communication", "leadership", "teamwork", "problem solving", "agile", "scrum", "public speaking", "time management", "marketing", "finance", "business analysis", "sales", "negotiation",
] as const;

/** Lowercased set for O(1) membership checks; the exported list stays readable/ordered. */
const KNOWN_SKILLS_SET = new Set<string>(KNOWN_SKILLS);

export function isKnownSkill(value: string): boolean {
  return KNOWN_SKILLS_SET.has(normalizeSkill(value));
}

export function normalizeSkill(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Extracts every known skill that appears as a substring of `text`. Longer
 * entries are checked first so "machine learning" matches before the
 * standalone "machine" would (which isn't even in the list, but the ordering
 * rule generalizes to future additions like "c++" vs "c").
 */
export function extractSkillsFromText(text: string): string[] {
  const haystack = ` ${normalizeSkill(text)} `;
  const found = new Set<string>();
  for (const skill of [...KNOWN_SKILLS].sort((a, b) => b.length - a.length)) {
    if (haystack.includes(` ${skill} `) || haystack.includes(`,${skill},`) || haystack.includes(`(${skill})`)) {
      found.add(skill);
    }
  }
  return [...found];
}

/** Splits a comma/semicolon/newline separated skills field into normalized, deduped entries. */
export function splitSkillList(raw: string): string[] {
  const parts = raw
    .split(/[,;\n•]+/)
    .map(normalizeSkill)
    .filter(Boolean);
  return [...new Set(parts)];
}
