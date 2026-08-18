"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface AttemptQuestion {
  paperQuestionId: string;
  orderNo: number;
  marks: number;
  topic: string;
  questionText: string;
  options: string[];
  difficulty: string;
}

interface AttemptPayload {
  attempt: { id: string; status: string };
  paper: { id: string; title: string; durationMinutes: number; totalMarks: number };
  deadline: string;
  questions: AttemptQuestion[];
  student: { name: string; rollNumber: string | null };
}

interface Violation {
  type: string;
  detail: string;
  occurredAt: string;
}

interface AnswerState {
  selectedIndex: number | null;
  markedForReview: boolean;
  timeTakenSec: number;
}

const VIOLATION_MAX = 15;
const NO_MOTION_AFTER_SEC = 30;
/** RMS of normalized (-1..1) time-domain samples. Lowered from 0.06 so a
 * quieter voice further from the mic — e.g. someone dictating an answer
 * from behind the student rather than the student's own close-up voice —
 * still crosses it. Typical room background noise sits under 0.02. */
const TALKING_RMS_THRESHOLD = 0.035;
/** Require this many consecutive seconds above the threshold before flagging
 * — still filters out a cough or chair creak, but short dictated answers
 * ("it's B", "two forty") now have time to trip it. */
const TALKING_SUSTAINED_SEC = 1.2;

/**
 * Secure exam environment.
 *
 * Integrity model: the client is treated as hostile-but-helpful. The answer
 * key never reaches it; it can only record `selectedIndex` per question and
 * report proctoring events. Scoring happens server-side at submit. All
 * anti-cheat measures (fullscreen lock, tab-switch detection, input blocking,
 * webcam motion check, watermark, countdown + auto-submit) run here.
 */
export function ExamRunner({ paperId }: { paperId: string }) {
  const [payload, setPayload] = useState<AttemptPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  /** Brief on-screen alert for the violation that just happened — distinct
   * from `warning`, which is a persistent banner for an unresolved state
   * (currently out of fullscreen). */
  const [toast, setToast] = useState<string | null>(null);
  // Fullscreen MUST be requested synchronously inside a real click handler —
  // browsers reject requestFullscreen() called from an effect on mount
  // because there is no live user gesture behind it. So proctoring only
  // starts once the student explicitly clicks through this gate.
  const [secureModeEntered, setSecureModeEntered] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** Drives the full-screen block overlay. Set on fullscreen loss OR the
   * tab/window losing visibility — the exam stays frozen behind it until
   * the student explicitly clicks "Resume Exam", instead of silently
   * letting them keep answering questions while switched away. */
  const [needsResume, setNeedsResume] = useState(false);

  // Randomised once per session so the watermark layout can't be predicted
  // and cropped out the same way on every attempt.
  const [watermarkSeed] = useState(() => Math.floor(Math.random() * 1000));
  const startRef = useRef<number>(Date.now());
  const violationsRef = useRef<Violation[]>([]);
  const answersRef = useRef<Record<string, AnswerState>>({});
  const submittedRef = useRef(false);
  const webcamRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastFrameRef = useRef<ImageData | null>(null);
  const noMotionSinceRef = useRef<number | null>(null);
  const loudSinceRef = useRef<number | null>(null);

  // ---- Boot: start (or resume) the attempt ---------------------------------
  const boot = useCallback(async () => {
    try {
      const response = await fetch("/api/placement/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId }),
      });
      const data = (await response.json()) as { error?: string } & AttemptPayload;
      if (!response.ok) {
        setLoadError(data.error ?? "Could not start the attempt.");
        return;
      }
      setPayload(data);
      setRemainingSec(Math.max(0, Math.round((new Date(data.deadline).getTime() - Date.now()) / 1000)));
      startRef.current = Date.now();
    } catch {
      setLoadError("Network error while starting the attempt.");
    }
  }, [paperId]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // ---- Violation ledger (ref + state mirror) --------------------------------
  // Root cause of "tab-switch/copy-paste don't show an alert": every
  // violation WAS being recorded correctly (proof: the counter climbed) but
  // nothing rendered a visible signal except one hardcoded fullscreen-exit
  // path. Every violation now shows a brief on-screen toast.
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const recordViolation = useCallback((type: string, detail: string) => {
    const entry: Violation = { type, detail, occurredAt: new Date().toISOString() };
    violationsRef.current = [...violationsRef.current, entry];
    setViolations(violationsRef.current);

    setToast(detail);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);

    const attemptId = payloadRef.current?.attempt.id;
    if (attemptId) {
      void fetch(`/api/placement/attempts/${attemptId}/violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, detail }),
      }).catch(() => undefined);
    }
  }, []);
  const payloadRef = useRef<AttemptPayload | null>(null);
  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  // ---- Fullscreen lock ------------------------------------------------------
  const requestFullscreen = useCallback(() => {
    if (document.fullscreenElement) return;
    // requestFullscreen() usually rejects its promise when denied, but some
    // browsers/embedded contexts (no user-gesture trigger, Permissions-Policy
    // blocking it, or the API missing entirely) throw synchronously instead —
    // that throw happens inside a useEffect and would otherwise crash the
    // whole exam page straight to the error boundary.
    try {
      document.documentElement.requestFullscreen?.().catch(() => {
        recordViolation("fullscreen_failed", "Fullscreen request was denied");
      });
    } catch {
      recordViolation("fullscreen_failed", "Fullscreen request was denied");
    }
  }, [recordViolation]);

  useEffect(() => {
    if (!secureModeEntered) return;
    const onFullscreenChange = () => {
      const inFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(inFullscreen);
      // No banner here on purpose — losing fullscreen (which switching tabs
      // or windows also does, since only one document can be fullscreen at
      // a time) now renders a full-screen BLOCK below instead of a
      // dismissible banner the student could just ignore and keep working
      // around.
      if (!inFullscreen) {
        recordViolation("fullscreen_exit", "Left fullscreen or switched away during the exam");
        setNeedsResume(true);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [secureModeEntered, recordViolation]);

  /** Called from a real click — the one context browsers allow fullscreen to
   * actually engage in. Reused both for the initial "Begin" button and the
   * "Resume Exam" recovery button after a fullscreen/tab-switch violation. */
  const enterSecureMode = () => {
    requestFullscreen();
    setSecureModeEntered(true);
    setNeedsResume(false);
  };

  // ---- Tab-switch / focus loss ---------------------------------------------
  useEffect(() => {
    if (!secureModeEntered) return;
    const onVisibility = () => {
      if (document.hidden) {
        recordViolation("tab_switch", "Tab switched or window hidden");
        setNeedsResume(true);
      }
    };
    const onBlur = () => {
      if (!document.hidden) recordViolation("blur", "Window lost focus");
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [secureModeEntered, recordViolation]);

  // ---- Input blocking: copy / paste / cut / context menu / printscreen ------
  useEffect(() => {
    if (!secureModeEntered) return;
    const block = (event: Event) => {
      event.preventDefault();
      recordViolation("input_blocked", `Blocked: ${event.type}`);
    };
    const events: (keyof DocumentEventMap)[] = ["copy", "paste", "cut", "contextmenu"];
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ["c", "v", "x", "a", "s", "p"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        recordViolation("shortcut_blocked", `Blocked shortcut: ${event.key}`);
      }
      if (event.key === "PrintScreen") {
        event.preventDefault();
        recordViolation("printscreen", "PrintScreen attempted");
      }
    };
    events.forEach((name) => document.addEventListener(name, block));
    document.addEventListener("keydown", onKeyDown);
    return () => {
      events.forEach((name) => document.removeEventListener(name, block));
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [secureModeEntered, recordViolation]);

  // ---- Webcam motion + microphone monitoring ---------------------------------
  useEffect(() => {
    if (!secureModeEntered) return;
    let stopped = false;
    let motionTimer: ReturnType<typeof setInterval> | undefined;
    let audioTimer: ReturnType<typeof setInterval> | undefined;
    let audioContext: AudioContext | undefined;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
          audio: true,
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (webcamRef.current) webcamRef.current.srcObject = stream;

        const video = webcamRef.current;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d", { willReadFrequently: true }) ?? null;

        if (video && context) {
          motionTimer = setInterval(() => {
            if (video.readyState < 2) return;
            context.drawImage(video, 0, 0, 320, 240);
            const frame = context.getImageData(0, 0, 320, 240);

            if (lastFrameRef.current) {
              const diff = meanFrameDiff(lastFrameRef.current, frame);
              if (diff < 0.02) {
                if (noMotionSinceRef.current === null) noMotionSinceRef.current = Date.now();
                const idleSec = (Date.now() - noMotionSinceRef.current) / 1000;
                if (idleSec > NO_MOTION_AFTER_SEC) {
                  recordViolation("no_motion", "No motion detected on camera for over 30 seconds");
                  noMotionSinceRef.current = Date.now();
                }
              } else {
                noMotionSinceRef.current = null;
              }
            }
            lastFrameRef.current = frame;
          }, 4000);
        }

        // Voice detection: flag sustained talking, not brief blips.
        if (stream.getAudioTracks().length > 0) {
          try {
            audioContext = new AudioContext();
            // A freshly-constructed AudioContext created outside a direct
            // user-gesture call stack (this runs inside an effect, one tick
            // removed from the click that started secure mode) commonly
            // starts "suspended" under browser autoplay policy. Suspended
            // means getByteTimeDomainData() never returns real samples —
            // RMS reads ~0 forever and talking can never be detected. This
            // was the actual root cause of audio detection never firing.
            if (audioContext.state === "suspended") {
              await audioContext.resume();
            }
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            const samples = new Uint8Array(analyser.frequencyBinCount);

            audioTimer = setInterval(() => {
              analyser.getByteTimeDomainData(samples);
              let sumSquares = 0;
              for (let i = 0; i < samples.length; i++) {
                const normalized = (samples[i] - 128) / 128;
                sumSquares += normalized * normalized;
              }
              const rms = Math.sqrt(sumSquares / samples.length);

              if (rms > TALKING_RMS_THRESHOLD) {
                if (loudSinceRef.current === null) loudSinceRef.current = Date.now();
                const loudSec = (Date.now() - loudSinceRef.current) / 1000;
                if (loudSec > TALKING_SUSTAINED_SEC) {
                  recordViolation("audio_detected", "Voice detected — talking during the exam is not allowed");
                  loudSinceRef.current = null; // cooldown: needs another sustained stretch to re-flag
                }
              } else {
                loudSinceRef.current = null;
              }
            }, 500);
          } catch {
            // Audio graph failed to set up (e.g. no AudioContext support) —
            // video monitoring still runs, just without voice detection.
          }
        }
      } catch {
        recordViolation("camera_unavailable", "Webcam/microphone access denied or unavailable");
      }
    };
    void start();

    return () => {
      stopped = true;
      if (motionTimer) clearInterval(motionTimer);
      if (audioTimer) clearInterval(audioTimer);
      void audioContext?.close().catch(() => undefined);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [secureModeEntered, recordViolation]);

  // ---- Countdown + auto-submit ----------------------------------------------
  useEffect(() => {
    if (remainingSec === null) return;
    if (remainingSec <= 0) {
      void submit(true);
      return;
    }
    const timer = setInterval(() => {
      setRemainingSec((sec) => (sec === null ? null : Math.max(0, sec - 1)));
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec]);

  // ---- Answer bookkeeping ----------------------------------------------------
  const selectOption = (paperQuestionId: string, index: number) => {
    const previous = answersRef.current[paperQuestionId];
    const entry: AnswerState = {
      selectedIndex: index,
      markedForReview: previous?.markedForReview ?? false,
      timeTakenSec: Math.round((Date.now() - startRef.current) / 1000),
    };
    answersRef.current = { ...answersRef.current, [paperQuestionId]: entry };
    setAnswers(answersRef.current);
  };

  const toggleMark = (paperQuestionId: string) => {
    const previous = answersRef.current[paperQuestionId] ?? {
      selectedIndex: null,
      markedForReview: false,
      timeTakenSec: 0,
    };
    const entry: AnswerState = { ...previous, markedForReview: !previous.markedForReview };
    answersRef.current = { ...answersRef.current, [paperQuestionId]: entry };
    setAnswers(answersRef.current);
  };

  // ---- Submit ----------------------------------------------------------------
  const submit = useCallback(
    async (autoSubmitted: boolean) => {
      const attemptId = payloadRef.current?.attempt.id;
      if (!attemptId || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);

      try {
        const body = {
          answers: Object.entries(answersRef.current).map(([paperQuestionId, state]) => ({
            paperQuestionId,
            selectedIndex: state.selectedIndex,
            markedForReview: state.markedForReview,
            timeTakenSec: state.timeTakenSec,
          })),
          violations: violationsRef.current,
          autoSubmitted,
        };
        const response = await fetch(`/api/placement/attempts/${attemptId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as { ok?: boolean; error?: string };
        if (!response.ok || !data.ok) {
          submittedRef.current = false;
          setSubmitting(false);
          setWarning(data.error ?? "Submission failed — try again.");
          return;
        }
        window.location.href = `/placement-portal/result/${attemptId}`;
      } catch {
        submittedRef.current = false;
        setSubmitting(false);
        setWarning("Network error during submission — try again.");
      }
    },
    []
  );

  // ---- Auto-submit once violations pile up too high --------------------------
  useEffect(() => {
    if (violations.length < VIOLATION_MAX || submittedRef.current) return;
    setWarning("Too many proctoring violations — auto-submitting your attempt.");
    void submit(true);
  }, [violations, submit]);

  // ---- Derived UI state -------------------------------------------------------
  const question = payload?.questions[currentIndex];
  const answeredCount = useMemo(
    () => Object.values(answers).filter((a) => a.selectedIndex !== null).length,
    [answers]
  );
  const markedCount = useMemo(
    () => Object.values(answers).filter((a) => a.markedForReview).length,
    [answers]
  );
  const minutes = remainingSec === null ? 0 : Math.floor(remainingSec / 60);
  const seconds = remainingSec === null ? 0 : remainingSec % 60;
  const lowTime = remainingSec !== null && remainingSec <= 300;
  const watermarkLabel = payload
    ? [payload.student.rollNumber, payload.student.name].filter(Boolean).join(" · ") || "BVCITS Candidate"
    : "";

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-semibold text-red-700">{loadError}</p>
        <a href="/placement-portal/exams" className="mt-3 inline-block text-sm font-semibold text-crimson hover:underline">
          Back to exam dashboard
        </a>
      </div>
    );
  }

  if (!payload || !question) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-ink-muted">
        Preparing your exam environment…
      </div>
    );
  }

  if (!secureModeEntered) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <h1 className="font-display text-2xl font-extrabold text-navy">{payload.paper.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {payload.paper.durationMinutes} min · {payload.questions.length} questions · {payload.paper.totalMarks} marks
        </p>
        <div className="mt-6 w-full space-y-2.5 rounded-2xl border border-surface-border bg-white p-5 text-left shadow-card">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            This is a secure, proctored exam. Starting requires:
          </p>
          <p className="text-sm text-ink-soft">🔒 Fullscreen — exiting is logged as a violation</p>
          <p className="text-sm text-ink-soft">📷 Camera + microphone access — monitored throughout</p>
          <p className="text-sm text-ink-soft">🚫 Copy, paste, screenshots and tab-switching are blocked</p>
          <p className="text-sm text-ink-soft">⚠️ {VIOLATION_MAX} violations auto-submits your attempt</p>
        </div>
        <button
          onClick={enterSecureMode}
          className="mt-6 rounded-xl bg-gold px-8 py-3 font-display text-sm font-bold text-navy transition hover:-translate-y-0.5 hover:bg-gold-400"
        >
          Begin Secure Exam →
        </button>
        <p className="mt-3 text-xs text-ink-muted">Your browser will ask to allow fullscreen and camera/microphone access.</p>
      </div>
    );
  }

  const questionState = answers[question.paperQuestionId];

  return (
    <div className="min-h-screen bg-surface-grey pb-24">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-surface-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-display text-sm font-extrabold text-navy">{payload.paper.title}</p>
            <p className="text-xs text-ink-muted">
              Question {currentIndex + 1} of {payload.questions.length} · {payload.paper.totalMarks} marks
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-3 sm:flex">
              <span className="text-xs text-ink-muted">
                <span className="font-semibold text-emerald-700">{answeredCount}</span> answered ·{" "}
                <span className="font-semibold text-gold-700">{markedCount}</span> marked ·{" "}
                <span className="font-semibold text-red-600">{violations.length}</span> alerts
              </span>
            </div>
            <span
              className={`rounded-xl px-4 py-1.5 font-display text-sm font-extrabold tabular-nums ${
                lowTime ? "animate-pulse bg-red-600 text-white" : "bg-navy text-white"
              }`}
            >
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </span>
            <button
              onClick={() => void submit(false)}
              disabled={submitting}
              className="rounded-xl bg-gold px-5 py-2 text-sm font-bold text-navy transition hover:bg-gold-400 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-surface-border bg-surface-grey/60 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          <span className={isFullscreen ? "text-emerald-700" : "text-red-600"}>
            {isFullscreen ? "🔒 Fullscreen locked" : "🔓 Fullscreen NOT active"}
          </span>
          <span>📷 Camera + mic monitored</span>
          <span>🚫 Tab switch &amp; copy/paste blocked</span>
          <span className="ml-auto normal-case tracking-normal text-red-600">
            {violations.length} / {VIOLATION_MAX} violations logged
          </span>
        </div>
        {warning && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
            {warning}
          </div>
        )}
      </header>

      {/* Webcam */}
      <div className="fixed bottom-4 left-4 z-20 overflow-hidden rounded-xl border border-surface-border bg-black shadow-card">
        <video ref={webcamRef} autoPlay muted playsInline className="h-24 w-32 object-cover" />
        <canvas ref={canvasRef} className="hidden" width={320} height={240} />
        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          {violations.some((v) => ["no_motion", "camera_unavailable", "audio_detected"].includes(v.type))
            ? "⚠️"
            : "●"}{" "}
          audio + video
        </span>
      </div>

      {/* Question palette */}
      <aside className="fixed right-4 top-20 z-10 hidden w-44 rounded-2xl border border-surface-border bg-white p-3 shadow-card lg:block">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Palette</p>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {payload.questions.map((q, index) => {
            const state = answers[q.paperQuestionId];
            const isAnswered = typeof state?.selectedIndex === "number";
            const isMarked = state?.markedForReview ?? false;
            const cls = isAnswered
              ? isMarked
                ? "bg-gold-400 text-navy"
                : "bg-emerald-600 text-white"
              : isMarked
                ? "bg-gold-200 text-navy"
                : "bg-surface-grey text-ink-soft";
            return (
              <button
                key={q.paperQuestionId}
                onClick={() => setCurrentIndex(index)}
                className={`rounded-md py-1.5 text-xs font-bold transition hover:ring-2 hover:ring-crimson/40 ${cls} ${
                  index === currentIndex ? "ring-2 ring-crimson" : ""
                }`}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
        <div className="mt-3 space-y-1 border-t border-surface-border pt-3 text-[10px] text-ink-muted">
          <p><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-600" /> Answered</p>
          <p><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-gold-400" /> Answered + marked</p>
          <p><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-gold-200" /> Marked only</p>
          <p><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-surface-grey" /> Unseen</p>
        </div>
      </aside>

      {/* Question card */}
      <main className="relative z-[1] mx-auto max-w-3xl px-4 pt-8">
        <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card sm:p-8">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-navy px-2.5 py-1 font-semibold text-white">Q{question.orderNo}</span>
            <span className="rounded-full bg-surface-grey px-2.5 py-1 text-ink-soft">{question.topic}</span>
            <span className="rounded-full bg-surface-grey px-2.5 py-1 text-ink-soft capitalize">{question.difficulty}</span>
            <span className="rounded-full bg-surface-grey px-2.5 py-1 text-ink-soft">{question.marks} mark{question.marks > 1 ? "s" : ""}</span>
          </div>
          <h2 className="mt-4 text-base font-semibold leading-relaxed text-navy sm:text-lg">{question.questionText}</h2>

          <div className="mt-6 space-y-2.5">
            {question.options.map((option, index) => {
              const selected = questionState?.selectedIndex === index;
              return (
                <button
                  key={index}
                  onClick={() => selectOption(question.paperQuestionId, index)}
                  className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                    selected
                      ? "border-navy bg-navy text-white shadow-card"
                      : "border-surface-border bg-surface-form hover:border-navy/40"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                      selected ? "border-white bg-white text-navy" : "border-ink-muted/40 text-ink-muted"
                    }`}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="leading-relaxed">{option}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => toggleMark(question.paperQuestionId)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                questionState?.markedForReview
                  ? "border-gold-300 bg-gold-50 text-gold-700"
                  : "border-surface-border text-ink-soft hover:bg-surface-grey"
              }`}
            >
              {questionState?.markedForReview ? "✓ Marked for review" : "Mark for review"}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm font-semibold text-ink-soft transition hover:bg-surface-grey disabled:opacity-40"
              >
                ← Previous
              </button>
              <button
                onClick={() => setCurrentIndex((i) => Math.min(payload.questions.length - 1, i + 1))}
                disabled={currentIndex === payload.questions.length - 1}
                className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        </div>

        {submitting && (
          <div className="mt-4 rounded-xl border border-gold-300 bg-gold-50 px-4 py-3 text-center text-sm font-medium text-gold-700">
            Submitting your attempt…
          </div>
        )}
      </main>

      {/* Violation toast — every recordViolation() call surfaces here now,
          not just fullscreen exits. */}
      {toast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
          ⚠️ Violation logged: {toast}
        </div>
      )}

      {/* Watermark — painted LAST and above everything (including the opaque
          white question card) so it survives a photo of the actual exam
          content, not just the empty page margins around it. Server-supplied
          identity, randomised per session so a photo can't be reliably
          cropped to dodge it the same way twice. */}
      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
        {Array.from({ length: 14 }).map((_, index) => (
          <div
            key={index}
            className="absolute select-none whitespace-nowrap text-2xl font-bold text-navy/[0.10]"
            style={{
              left: `${(index * 23 + watermarkSeed) % 95}%`,
              top: `${(index * 37 + watermarkSeed * 2) % 92}%`,
              transform: `rotate(${-30 + (watermarkSeed % 20) - 10}deg)`,
            }}
          >
            {watermarkLabel} · BVCITS
          </div>
        ))}
      </div>

      {/* Hard block — freezes the whole exam behind an opaque overlay the
          instant fullscreen is lost or the tab/window is switched away from.
          Answering is impossible until the student explicitly clicks back
          in, instead of the old soft banner they could ignore while
          continuing to work in another window. */}
      {needsResume && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-navy/95 px-4 text-center backdrop-blur-sm">
          <p className="font-display text-2xl font-extrabold text-white">⚠️ You left the exam</p>
          <p className="mt-2 max-w-sm text-sm text-white/80">
            Switching tabs, windows, or exiting fullscreen is logged as a violation. Your timer keeps running —
            {" "}
            <span className="font-semibold text-gold">{violations.length} / {VIOLATION_MAX}</span> logged so far.
          </p>
          <button
            onClick={enterSecureMode}
            className="mt-6 rounded-xl bg-gold px-8 py-3 font-display text-sm font-bold text-navy transition hover:-translate-y-0.5 hover:bg-gold-400"
          >
            Resume Exam →
          </button>
        </div>
      )}
    </div>
  );
}

/** Mean absolute difference of two grayscale frames, 0..1. */
function meanFrameDiff(a: ImageData, b: ImageData): number {
  const size = a.width * a.height;
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const offset = i * 4;
    sum += Math.abs(a.data[offset] - b.data[offset]);
  }
  return sum / (size * 255);
}