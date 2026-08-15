"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice loop for the campus assistant — listen, think, speak, listen again.
 *
 * ── Why it is built this way ──────────────────────────────────────────────────
 *
 * 1. HALF-DUPLEX BY DESIGN. The microphone is never open while the assistant is
 *    speaking. The Web Speech API owns its own capture, so we cannot attach
 *    acoustic echo cancellation to it; if we listened during playback the
 *    recogniser would transcribe the assistant's own voice and answer itself.
 *    Interrupting is still supported — tapping the mic cancels playback first
 *    (see `startListening`) — it is just driven by a tap rather than by audio.
 *
 * 2. `continuous = false` PLUS AN EXPLICIT RESTART. Chrome ends a recognition
 *    session after a few seconds of silence and caps sessions at around a
 *    minute, so `continuous = true` is not a reliable conversation loop. The
 *    supported approach is a short session restarted deliberately in `onend`,
 *    which is what `maybeScheduleNextTurn` does.
 *
 * 3. RESTARTS ARE STATE-GUARDED. Every restart checks that conversation mode is
 *    still on, the hook is mounted, and nothing is playing. A bare
 *    `recognition.start()` inside `onend` is how these loops become infinite.
 */

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";
export type VoiceLang = "te-IN" | "en-IN";

/** Silent turns tolerated before the loop stops on its own. */
const MAX_SILENT_TURNS = 2;

/** Pause after playback before reopening the mic, so the audio tail is not captured. */
const TURN_GAP_MS = 350;

/** Longest chunk sent to the TTS route in one request. */
const TTS_CHUNK_LIMIT = 200;

interface UseCampusVoiceOptions {
  /** Fired once per turn with the final transcript. */
  onUtterance: (text: string) => void;
  /** Fired when the loop stops for a reason worth surfacing. */
  onNotice?: (notice: VoiceNotice) => void;
}

export type VoiceNotice =
  | "unsupported"
  | "mic-denied"
  | "network"
  | "silent-timeout"
  | "tts-failed";

interface SpeakOptions {
  lang?: VoiceLang;
  /** When false, the loop will not reopen the mic after this utterance. */
  continueConversation?: boolean;
}

/** Splits text into speakable chunks at sentence boundaries. */
function chunkForSpeech(text: string): string[] {
  const clean = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // markdown links → label
    .replace(/[*_#`~>•]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "") // emoji
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return [];
  if (clean.length <= TTS_CHUNK_LIMIT) return [clean];

  // Keep sentences intact; only split a sentence that is itself over the limit.
  const sentences = clean.split(/(?<=[.!?।])\s+/);
  const chunks: string[] = [];
  let buffer = "";

  for (const sentence of sentences) {
    if ((buffer + " " + sentence).trim().length <= TTS_CHUNK_LIMIT) {
      buffer = (buffer + " " + sentence).trim();
      continue;
    }
    if (buffer) chunks.push(buffer);
    buffer = sentence.length > TTS_CHUNK_LIMIT ? sentence.slice(0, TTS_CHUNK_LIMIT) : sentence;
  }
  if (buffer) chunks.push(buffer);

  return chunks;
}

export function useCampusVoice({ onUtterance, onNotice }: UseCampusVoiceOptions) {
  const [state, setState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Refs mirror state that callbacks registered once on the recogniser must read.
  // Reading React state there would capture the value from the first render.
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  const conversationModeRef = useRef(false);
  const stateRef = useRef<VoiceState>("idle");
  const mountedRef = useRef(true);
  const silentTurnsRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onUtteranceRef = useRef(onUtterance);
  const onNoticeRef = useRef(onNotice);
  /** Resolves the promise returned by the in-flight `speak()` call. */
  const speakResolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onUtteranceRef.current = onUtterance;
    onNoticeRef.current = onNotice;
  }, [onUtterance, onNotice]);

  const applyState = useCallback((next: VoiceState) => {
    stateRef.current = next;
    if (mountedRef.current) setState(next);
  }, []);

  // ── Visualiser ────────────────────────────────────────────────────────────
  // A synthesised level, not a real meter: the recogniser holds the microphone,
  // and opening a second getUserMedia stream purely to draw bars would trigger
  // another permission prompt. Purely decorative — nothing branches on it.
  const startLevelAnimation = useCallback(() => {
    if (levelTimerRef.current) return;
    let tick = 0;
    levelTimerRef.current = setInterval(() => {
      tick += 1;
      const base = 0.45 + Math.sin(tick * 0.4) * 0.3;
      setAudioLevel(Math.min(1, Math.max(0.15, base + Math.random() * 0.25)));
    }, 90);
  }, []);

  const stopLevelAnimation = useCallback(() => {
    if (levelTimerRef.current) {
      clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // ── Playback control ──────────────────────────────────────────────────────
  const stopSpeaking = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load(); // release the previous stream so the next play() starts clean
    }
    synthRef.current?.cancel();

    // Release any awaiting speak() so callers never hang on an interrupted turn.
    speakResolveRef.current?.();
    speakResolveRef.current = null;

    stopLevelAnimation();
    if (stateRef.current === "speaking") applyState("idle");
  }, [applyState, stopLevelAnimation]);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  // ── Listening ─────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || !mountedRef.current) return;

    // Tapping the mic mid-answer is the interruption path: cut playback first.
    stopSpeaking();
    clearRestartTimer();
    setInterimTranscript("");

    if (stateRef.current === "listening") return;

    try {
      recognition.start();
    } catch {
      // start() throws if a session is still winding down. onend will restart it
      // when conversation mode is on, so this is safe to ignore.
    }
  }, [clearRestartTimer, stopSpeaking]);

  const stopListening = useCallback(() => {
    clearRestartTimer();
    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }
    if (stateRef.current === "listening") applyState("idle");
  }, [applyState, clearRestartTimer]);

  /** Reopens the mic after a completed turn, if the loop should continue. */
  const maybeScheduleNextTurn = useCallback(() => {
    if (!conversationModeRef.current || !mountedRef.current) return;
    clearRestartTimer();
    restartTimerRef.current = setTimeout(() => {
      if (!conversationModeRef.current || !mountedRef.current) return;
      if (stateRef.current === "speaking" || stateRef.current === "thinking") return;
      startListening();
    }, TURN_GAP_MS);
  }, [clearRestartTimer, startListening]);

  // ── One-time setup ────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    if (typeof window === "undefined") return;

    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    if ("speechSynthesis" in window) synthRef.current = window.speechSynthesis;

    const Ctor =
      window.SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition;

    if (!Ctor) {
      setIsSupported(false);
      onNoticeRef.current?.("unsupported");
      return;
    }

    setIsSupported(true);
    const recognition = new Ctor();
    // Short sessions restarted deliberately — see the header note.
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = "te-IN";

    recognition.onstart = () => {
      applyState("listening");
      startLevelAnimation();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalText = "";

      // Start at resultIndex, not 0: the results list accumulates across the
      // session, so iterating from zero re-reads and re-fires earlier finals.
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }

      if (interim) setInterimTranscript(interim);

      const trimmed = finalText.trim();
      if (!trimmed) return;

      silentTurnsRef.current = 0;
      setInterimTranscript("");
      // The consumer moves us to "thinking" and then calls speak().
      applyState("thinking");
      onUtteranceRef.current(trimmed);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      stopLevelAnimation();

      if (event.error === "no-speech") {
        silentTurnsRef.current += 1;
        if (silentTurnsRef.current >= MAX_SILENT_TURNS) {
          // Stop rather than reopen forever — an always-hot mic is both a
          // battery drain and a privacy surprise.
          conversationModeRef.current = false;
          if (mountedRef.current) setConversationMode(false);
          onNoticeRef.current?.("silent-timeout");
        }
        return;
      }

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        conversationModeRef.current = false;
        if (mountedRef.current) setConversationMode(false);
        onNoticeRef.current?.("mic-denied");
        return;
      }

      if (event.error === "network") onNoticeRef.current?.("network");
      // "aborted" is what our own stop() produces — not worth surfacing.
    };

    recognition.onend = () => {
      stopLevelAnimation();
      if (stateRef.current === "listening") applyState("idle");
      // Only self-restart on an empty turn. When speech was captured we are in
      // "thinking", and the restart is driven by speak() finishing instead.
      if (stateRef.current === "idle") maybeScheduleNextTurn();
    };

    recognitionRef.current = recognition;

    return () => {
      mountedRef.current = false;
      conversationModeRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (levelTimerRef.current) clearInterval(levelTimerRef.current);
      speakResolveRef.current?.();
      speakResolveRef.current = null;
      try {
        recognition.abort();
      } catch {
        // ignore
      }
      audio.pause();
      audio.removeAttribute("src");
      synthRef.current?.cancel();
    };
  }, [applyState, maybeScheduleNextTurn, startLevelAnimation, stopLevelAnimation]);

  // ── Speaking ──────────────────────────────────────────────────────────────

  /** Browser voice fallback used when the TTS route cannot serve audio. */
  const speakWithSynthesis = useCallback(
    (text: string, lang: VoiceLang) =>
      new Promise<void>((resolve) => {
        const synth = synthRef.current;
        if (!synth) {
          resolve();
          return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.95;
        utterance.pitch = 1.05;

        const voices = synth.getVoices();
        const wanted = lang.startsWith("te")
          ? voices.find((v) => v.lang.toLowerCase().startsWith("te"))
          : voices.find((v) => v.lang === "en-IN") ?? voices.find((v) => v.lang.startsWith("en"));
        if (wanted) utterance.voice = wanted;

        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        synth.speak(utterance);
      }),
    [],
  );

  /** Plays one chunk through the neural TTS route, falling back to the browser voice. */
  const playChunk = useCallback(
    (chunk: string, lang: VoiceLang) =>
      new Promise<void>((resolve) => {
        const audio = audioRef.current;
        if (!audio) {
          void speakWithSynthesis(chunk, lang).then(resolve);
          return;
        }

        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          audio.onended = null;
          audio.onerror = null;
          resolve();
        };

        audio.onended = finish;
        audio.onerror = () => {
          if (settled) return;
          settled = true;
          audio.onended = null;
          audio.onerror = null;
          void speakWithSynthesis(chunk, lang).then(resolve);
        };

        audio.src = `/api/speech/telugu?text=${encodeURIComponent(chunk)}&lang=${lang}`;
        audio.play().catch(() => {
          if (settled) return;
          settled = true;
          audio.onended = null;
          audio.onerror = null;
          // Autoplay refusal or a failing route — fall back rather than go silent.
          void speakWithSynthesis(chunk, lang).then(resolve);
        });
      }),
    [speakWithSynthesis],
  );

  /**
   * Speaks `text`, then hands the turn back to the user when conversation mode is on.
   * Resolves when playback finishes (or is interrupted).
   */
  const speak = useCallback(
    async (text: string, options: SpeakOptions = {}) => {
      const { lang = "te-IN", continueConversation = true } = options;
      const chunks = chunkForSpeech(text);

      if (chunks.length === 0) {
        applyState("idle");
        if (continueConversation) maybeScheduleNextTurn();
        return;
      }

      // Mic must be closed before playback: half-duplex, per the header note.
      stopListening();
      applyState("speaking");
      startLevelAnimation();

      await new Promise<void>((resolve) => {
        speakResolveRef.current = resolve;
        void (async () => {
          for (const chunk of chunks) {
            // stopSpeaking() clears the resolver; that is the interrupt signal.
            if (speakResolveRef.current !== resolve || !mountedRef.current) break;
            await playChunk(chunk, lang);
          }
          if (speakResolveRef.current === resolve) {
            speakResolveRef.current = null;
            resolve();
          }
        })();
      });

      stopLevelAnimation();
      if (!mountedRef.current) return;
      if (stateRef.current === "speaking") applyState("idle");
      if (continueConversation) maybeScheduleNextTurn();
    },
    [
      applyState,
      maybeScheduleNextTurn,
      playChunk,
      startLevelAnimation,
      stopListening,
      stopLevelAnimation,
    ],
  );

  // ── Conversation control ──────────────────────────────────────────────────
  const startConversation = useCallback(
    (lang: VoiceLang = "te-IN") => {
      if (!recognitionRef.current) {
        onNoticeRef.current?.("unsupported");
        return;
      }
      recognitionRef.current.lang = lang;
      silentTurnsRef.current = 0;
      conversationModeRef.current = true;
      setConversationMode(true);
      startListening();
    },
    [startListening],
  );

  const stopConversation = useCallback(() => {
    conversationModeRef.current = false;
    setConversationMode(false);
    clearRestartTimer();
    stopListening();
    stopSpeaking();
    applyState("idle");
  }, [applyState, clearRestartTimer, stopListening, stopSpeaking]);

  /** Updates the recognition language without tearing down the instance. */
  const setLanguage = useCallback((lang: VoiceLang) => {
    if (recognitionRef.current) recognitionRef.current.lang = lang;
  }, []);

  return {
    state,
    isListening: state === "listening",
    isSpeaking: state === "speaking",
    isThinking: state === "thinking",
    interimTranscript,
    audioLevel,
    isSupported,
    conversationMode,
    startConversation,
    stopConversation,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    setLanguage,
    /** Lets the consumer mark the thinking phase for a typed (non-voice) turn. */
    setThinking: useCallback(() => applyState("thinking"), [applyState]),
  };
}
