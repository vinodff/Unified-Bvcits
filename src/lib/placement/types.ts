// Shared types for the placement exam pipeline.
//
// These mirror the Postgres shapes in supabase/migrations/0006_exam_portal.sql.
// The pipeline agents produce these shapes; the route handlers persist them.

export type Difficulty = "easy" | "medium" | "hard";

export type QuestionSourceType = "pyq" | "ai" | "faculty" | "seed";

export interface ExamQuestion {
  id?: string;
  topic: string;
  subtopic?: string | null;
  questionText: string;
  options: string[];
  answer: number;
  explanation?: string | null;
  difficulty: Difficulty;
  source?: string | null;
  sourceType: QuestionSourceType;
}

/** One section of an exam: name, topics it draws from, question budget. */
export interface ExamSection {
  name: string;
  topics: string[];
  questionCount: number;
  marksPerQuestion: number;
}

/** The extracted exam pattern (what the exam actually looks like). */
export interface ExamPattern {
  examName: string;
  durationMinutes: number;
  totalQuestions: number;
  negativeMarking: number;
  markingScheme: { perQuestion: number; negativePerWrong: number };
  sections: ExamSection[];
  notes?: string[];
}

/** What the web-search agent collected, before any cleaning. */
export interface ResearchMaterial {
  sources: Array<{ url?: string; title: string; description?: string; kind: string }>;
  /** Free-text notes / extracted passages the agents can read. */
  passages: string[];
  /** True when the fallback corpus was used instead of a live search. */
  usedCorpus: boolean;
}

/** The AI Reviewer Agent's output — the analysis that justifies the paper. */
export interface ReviewerInsights {
  weightage: Array<{ topic: string; weightPct: number; trend: "rising" | "stable" | "falling"; importance: "critical" | "high" | "medium" | "low" }>;
  frequentlyTested: string[];
  difficultyDistribution: { easy: number; medium: number; hard: number };
  predictions: string[];
  summary: string;
}

/** The blueprint the generation agent must follow. */
export interface PaperBlueprint {
  sections: ExamSection[];
  totalQuestions: number;
  durationMinutes: number;
  notes?: string[];
}

export interface ExtractedMaterial {
  pattern: ExamPattern;
  questions: ExamQuestion[];
}

export interface PipelineProgress {
  step: "research" | "extract" | "process" | "review" | "generate";
  status: "pending" | "running" | "done" | "failed";
  message?: string;
}

export type ExamPipelineStatus =
  | "draft"
  | "researching"
  | "extracting"
  | "processing"
  | "reviewing"
  | "generating"
  | "review"
  | "approved"
  | "published"
  | "failed";

/** Mirrors the `paper_status` enum in 0006_exam_portal.sql. */
export type PaperStatus = "draft" | "review" | "approved" | "published" | "archived";

export const PIPELINE_STEPS: PipelineProgress["step"][] = [
  "research",
  "extract",
  "process",
  "review",
  "generate",
];

/** Sanitised shape sent to the exam-taker (NEVER includes the answer). */
export interface AttemptQuestion {
  paperQuestionId: string;
  orderNo: number;
  marks: number;
  topic: string;
  questionText: string;
  options: string[];
  difficulty: Difficulty;
}

export type ViolationType =
  | "tab_switch"
  | "fullscreen_exit"
  | "copy_paste"
  | "printscreen"
  | "webcam_absence"
  | "webcam_denied"
  | "focus_loss"
  | "auto_submit";

export interface Violation {
  type: ViolationType;
  detail: string;
  occurredAt: string;
}