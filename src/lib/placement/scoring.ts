// Scoring engine — pure functions shared by the submission route and the
// analytics screens. No I/O here so every branch is unit-testable.

export interface ScoreableQuestion {
  paperQuestionId: string;
  answer: number;
  marks: number;
}

export interface StudentAnswer {
  paperQuestionId: string;
  selectedIndex: number | null;
  markedForReview: boolean;
  timeTakenSec: number | null;
}

export interface ScoredAnswer {
  paperQuestionId: string;
  selectedIndex: number | null;
  isCorrect: boolean;
  marksObtained: number;
  timeTakenSec: number | null;
  markedForReview: boolean;
  answered: boolean;
}

export interface ScoreResult {
  answers: ScoredAnswer[];
  score: number;
  totalMarks: number;
  percent: number;
  attemptedCount: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  timeTakenSec: number;
}

export function scoreAttempt(
  questions: ScoreableQuestion[],
  answers: StudentAnswer[],
  negativePerWrong: number,
  startedAtIso: string,
  submittedAtIso: string
): ScoreResult {
  const byId = new Map(questions.map((question) => [question.paperQuestionId, question]));
  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);

  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let attemptedCount = 0;

  const scored: ScoredAnswer[] = answers.map((answer) => {
    const question = byId.get(answer.paperQuestionId);
    if (!question) {
      return {
        paperQuestionId: answer.paperQuestionId,
        selectedIndex: answer.selectedIndex,
        isCorrect: false,
        marksObtained: 0,
        timeTakenSec: answer.timeTakenSec,
        markedForReview: answer.markedForReview,
        answered: answer.selectedIndex !== null,
      };
    }

    const answered = answer.selectedIndex !== null;
    let isCorrect = false;
    let marksObtained = 0;

    if (answered) {
      attemptedCount += 1;
      isCorrect = answer.selectedIndex === question.answer;
      if (isCorrect) {
        correctCount += 1;
        marksObtained = question.marks;
      } else {
        wrongCount += 1;
        marksObtained = -negativePerWrong;
      }
      score += marksObtained;
    }

    return {
      paperQuestionId: answer.paperQuestionId,
      selectedIndex: answer.selectedIndex,
      isCorrect,
      marksObtained,
      timeTakenSec: answer.timeTakenSec,
      markedForReview: answer.markedForReview,
      answered,
    };
  });

  const unansweredCount = questions.length - attemptedCount;
  const percent = totalMarks > 0 ? Math.max(0, Math.min(100, (score / totalMarks) * 100)) : 0;

  const started = new Date(startedAtIso).getTime();
  const submitted = new Date(submittedAtIso).getTime();
  const timeTakenSec = Math.max(0, Math.round((submitted - started) / 1000));

  return {
    answers: scored,
    score: Math.max(0, score),
    totalMarks,
    percent: Math.round(percent * 100) / 100,
    attemptedCount,
    correctCount,
    wrongCount,
    unansweredCount,
    timeTakenSec,
  };
}

/** Percentile = share of prior attempts on the same paper scoring below you. */
export function computePercentile(
  myPercent: number,
  allPercents: number[]
): number {
  const relevant = allPercents.filter((p) => p !== myPercent);
  if (relevant.length === 0) return 100;
  const below = relevant.filter((p) => p < myPercent).length;
  return Math.round((below / relevant.length) * 1000) / 10;
}

export interface TopicPerformance {
  topic: string;
  total: number;
  correct: number;
  accuracy: number; // 0-100
}

export interface SectionPerformance {
  section: string;
  total: number;
  correct: number;
  accuracy: number;
  avgTimeSec: number | null;
}

export interface AttemptAnalysis {
  score: number;
  totalMarks: number;
  percent: number;
  attemptedCount: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  timeTakenSec: number;
  avgTimePerQuestionSec: number | null;
  sectionPerformance: SectionPerformance[];
  topicPerformance: TopicPerformance[];
  slowestTopics: TopicPerformance[];
}

/** Builds the results-page analysis. `sections` are the paper's sections. */
export function analyzeAttempt(
  result: ScoreResult,
  sections: Array<{ name: string; topics?: string[] }>,
  questions: Array<{ paperQuestionId: string; topic: string }>
): AttemptAnalysis {
  const topicByQid = new Map(questions.map((question) => [question.paperQuestionId, question.topic]));

  const topicStats = new Map<string, { total: number; correct: number; time: number[] }>();
  for (const answer of result.answers) {
    const topic = topicByQid.get(answer.paperQuestionId) ?? "Unknown";
    const stats = topicStats.get(topic) ?? { total: 0, correct: 0, time: [] };
    stats.total += 1;
    if (answer.isCorrect) stats.correct += 1;
    if (answer.timeTakenSec !== null) stats.time.push(answer.timeTakenSec);
    topicStats.set(topic, stats);
  }

  const topicPerformance: TopicPerformance[] = [...topicStats.entries()].map(([topic, stats]) => ({
    topic,
    total: stats.total,
    correct: stats.correct,
    accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
  }));

  const sectionPerformance: SectionPerformance[] = sections.map((section) => {
    const memberQids = new Set<string>();
    const topicNames = section.topics ?? [];
    for (const [qid, topic] of topicByQid.entries()) {
      const match =
        topicNames.length === 0 ||
        topicNames.some((t) => topic.toLowerCase().includes(t.toLowerCase()));
      if (match) memberQids.add(qid);
    }
    let total = 0;
    let correct = 0;
    const times: number[] = [];
    for (const answer of result.answers) {
      if (!memberQids.has(answer.paperQuestionId)) continue;
      total += 1;
      if (answer.isCorrect) correct += 1;
      if (answer.timeTakenSec !== null) times.push(answer.timeTakenSec);
    }
    return {
      section: section.name,
      total,
      correct,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      avgTimeSec: times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    };
  });

  const slowestTopics = [...topicStats.entries()]
    .map(([topic, stats]) => ({
      topic,
      total: stats.total,
      correct: stats.correct,
      accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      avgTimeSec: stats.time.length > 0 ? stats.time.reduce((a, b) => a + b, 0) / stats.time.length : 0,
    }))
    .sort((a, b) => b.avgTimeSec - a.avgTimeSec)
    .slice(0, 5)
    .map(({ topic, total, correct, accuracy }) => ({ topic, total, correct, accuracy }));

  const answeredTimes = result.answers
    .map((answer) => answer.timeTakenSec)
    .filter((t): t is number => t !== null);

  return {
    score: result.score,
    totalMarks: result.totalMarks,
    percent: result.percent,
    attemptedCount: result.attemptedCount,
    correctCount: result.correctCount,
    wrongCount: result.wrongCount,
    unansweredCount: result.unansweredCount,
    timeTakenSec: result.timeTakenSec,
    avgTimePerQuestionSec:
      answeredTimes.length > 0
        ? Math.round(answeredTimes.reduce((a, b) => a + b, 0) / answeredTimes.length)
        : null,
    sectionPerformance,
    topicPerformance: topicPerformance.sort((a, b) => b.accuracy - a.accuracy),
    slowestTopics,
  };
}