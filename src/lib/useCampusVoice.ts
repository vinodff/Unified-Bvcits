"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { chunkForSpeech } from "./speech-limits";

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

/**
 * Longest a single chunk may take to play before the loop gives up on it.
 *
 * `<audio>` fires neither `ended` nor `error` when a stream stalls — the element simply
 * sits there. Without this ceiling the promise below never settles, `speak()` never
 * returns, and the loop is stranded in "speaking" with the microphone shut: the
 * conversation is dead but the UI still says the assistant is talking. Generous enough
 * that a slow network is not mistaken for a stall.
 */
const CHUNK_PLAYBACK_TIMEOUT_MS = 20_000;

/**
 * Playback speed for the synthesised voice. The TTS services return audio at a flat,
 * slow reading pace that sounds like a recorded announcement rather than a person, so
 * playback is sped up on the client where we actually have the control.
 *
 * `PRESERVE_PITCH = false` lets pitch rise with the rate. That coupling is the point:
 * it lifts the voice out of the dull low register and reads as livelier. Above about
 * 1.3 it starts to sound comical, so keep changes small.
 */
const VOICE_RATE = 1.22;
const PRESERVE_PITCH = false;

/** Rate and pitch for the browser fallback voice, which takes both independently. */
const BROWSER_VOICE_RATE = 1.15;
const BROWSER_VOICE_PITCH = 1.15;

/**
 * Which engine speaks. Chosen once and then held, because the two engines have audibly
 * different voices — switching between them mid-answer is heard as the assistant
 * changing character partway through a sentence.
 */
type SpeechEngine = "route" | "browser";

/** Applies playback tuning. `preservesPitch` is still prefixed on some engines. */
function applyPlaybackTuning(audio: HTMLAudioElement): void {
  audio.playbackRate = VOICE_RATE;
  const tunable = audio as HTMLAudioElement & {
    preservesPitch?: boolean;
    mozPreservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
  };
  tunable.preservesPitch = PRESERVE_PITCH;
  tunable.mozPreservesPitch = PRESERVE_PITCH;
  tunable.webkitPreservesPitch = PRESERVE_PITCH;
}

function ttsUrl(chunk: string, lang: VoiceLang): string {
  return `/api/speech/telugu?text=${encodeURIComponent(chunk)}&lang=${lang}`;
}

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

export function useCampusVoice({ onUtterance, onNotice }: UseCampusVoiceOptions) {
  const [state, setState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Refs mirror state that callbacks registered once on the recogniser must read.
  // Reading React state there would capture the value from the first render.
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  /**
   * Two elements, alternated: one plays while the other buffers the next chunk. A single
   * element has to finish, load a new src, and buffer before it can speak again, which
   * put an audible pause between every chunk and made the delivery sound halting.
   */
  const audioPoolRef = useRef<HTMLAudioElement[]>([]);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  /** Held for the session so the voice never changes character between answers. */
  const engineRef = useRef<SpeechEngine | null>(null);

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
    for (const audio of audioPoolRef.current) {
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

    const pool = [new Audio(), new Audio()];
    for (const audio of pool) {
      audio.preload = "auto";
      applyPlaybackTuning(audio);
    }
    audioPoolRef.current = pool;

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
      for (const audio of pool) {
        audio.pause();
        audio.removeAttribute("src");
      }
      synthRef.current?.cancel();
    };
  }, [applyState, maybeScheduleNextTurn, startLevelAnimation, stopLevelAnimation]);

  // ── Speaking ──────────────────────────────────────────────────────────────

  /**
   * Browser voice fallback used when the TTS route cannot serve audio.
   *
   * Resolves true when it actually spoke. False means this browser has no usable voice for
   * the language, which matters because desktop Chrome commonly ships no Telugu voice at
   * all — left unchecked it reads Telugu text with an English voice, which is worse than
   * silence. The caller surfaces that as a notice rather than pretending it spoke.
   *
   * Timed for the same reason as route playback: `onend` is not guaranteed to fire.
   */
  const speakWithSynthesis = useCallback(
    (text: string, lang: VoiceLang) =>
      new Promise<boolean>((resolve) => {
        const synth = synthRef.current;
        if (!synth) {
          resolve(false);
          return;
        }

        const voices = synth.getVoices();
        const wanted = lang.startsWith("te")
          ? voices.find((v) => v.lang.toLowerCase().startsWith("te"))
          : voices.find((v) => v.lang === "en-IN") ?? voices.find((v) => v.lang.startsWith("en"));

        // No voice for this language: speaking anyway produces the wrong-accent gibberish
        // described above, so report the failure instead.
        if (!wanted) {
          resolve(false);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = BROWSER_VOICE_RATE;
        utterance.pitch = BROWSER_VOICE_PITCH;
        utterance.voice = wanted;

        let settled = false;
        const settle = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(ok);
        };
        const timer = setTimeout(() => settle(true), CHUNK_PLAYBACK_TIMEOUT_MS);

        utterance.onend = () => settle(true);
        utterance.onerror = () => settle(false);
        synth.speak(utterance);
      }),
    [],
  );

  /**
   * Plays one chunk through the TTS route.
   * Resolves true when it played, false when the route could not serve it.
   * Never falls back on its own — that decision belongs to `speak`, so a fallback can
   * never take effect halfway through an utterance and change the voice mid-sentence.
   */
  const playViaRoute = useCallback(
    (element: HTMLAudioElement, chunk: string, lang: VoiceLang) =>
      new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          element.onended = null;
          element.onerror = null;
          element.onstalled = null;
          resolve(ok);
        };

        // A stalled stream fires neither `ended` nor `error`, so without this the loop
        // hangs in "speaking" forever. See CHUNK_PLAYBACK_TIMEOUT_MS.
        const timer = setTimeout(() => settle(false), CHUNK_PLAYBACK_TIMEOUT_MS);

        element.onended = () => settle(true);
        element.onerror = () => settle(false);
        element.onstalled = () => settle(false);

        // src may already be set by the prefetch below; only assign when it is not.
        const wanted = ttsUrl(chunk, lang);
        if (!element.src.endsWith(encodeURIComponent(chunk) + `&lang=${lang}`)) {
          element.src = wanted;
        }
        applyPlaybackTuning(element);

        element.play().then(
          () => applyPlaybackTuning(element), // Chrome resets rate when a new src loads.
          () => settle(false),
        );
      }),
    [],
  );

  /** Starts fetching the next chunk while the current one plays, to remove the gap. */
  const prefetchChunk = useCallback(
    (element: HTMLAudioElement, chunk: string, lang: VoiceLang) => {
      element.src = ttsUrl(chunk, lang);
      element.load();
    },
    [],
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
          // The engine is chosen once per session and then held, so every chunk of every
          // answer is spoken in the same voice. Only the very first chunk of the session
          // may switch engines; after that the decision is fixed.
          // Tracks whether any chunk of this answer reached the listener at all, so a
          // total failure can be surfaced instead of passing as silence.
          let spokeSomething = false;

          for (let i = 0; i < chunks.length; i += 1) {
            // stopSpeaking() clears the resolver; that is the interrupt signal.
            if (speakResolveRef.current !== resolve || !mountedRef.current) break;

            const chunk = chunks[i];
            const next = chunks[i + 1];

            const pool = audioPoolRef.current;
            // Pool is empty until the mount effect runs; browser speech is the only
            // option that early, and committing to it keeps the voice consistent.
            if (engineRef.current === "browser" || pool.length < 2) {
              if (await speakWithSynthesis(chunk, lang)) spokeSomething = true;
              continue;
            }

            const active = pool[i % 2];
            const standby = pool[(i + 1) % 2];
            // Buffer the next chunk while this one plays, so playback is continuous.
            if (next) prefetchChunk(standby, next, lang);

            const played = await playViaRoute(active, chunk, lang);
            if (played) {
              engineRef.current = "route";
              spokeSomething = true;
              continue;
            }

            // The route failed. Commit to the browser voice for the rest of THIS answer
            // and re-speak this chunk there, so no part of it is lost and the voice does
            // not change character mid-sentence. The commitment is deliberately not
            // permanent: a single transient failure used to downgrade every later answer
            // in the session, even after the route recovered.
            engineRef.current = "browser";
            if (speakResolveRef.current !== resolve || !mountedRef.current) break;
            if (await speakWithSynthesis(chunk, lang)) spokeSomething = true;
          }

          // Nothing was audible: neither the route nor a browser voice could speak. Say so
          // rather than leaving the visitor watching a reply they were meant to hear.
          if (!spokeSomething && chunks.length > 0 && mountedRef.current) {
            onNoticeRef.current?.("tts-failed");
          }
          // Re-probe the route on the next answer instead of staying on the browser voice
          // for the rest of the page's life.
          engineRef.current = null;

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
      playViaRoute,
      prefetchChunk,
      speakWithSynthesis,
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

  /**
   * Closes a turn that produced no speech, handing the microphone back.
   *
   * Needed because `speak()` is what normally moves the loop out of "thinking" and
   * reschedules the mic. Any path that answers without speaking — voice replies muted, or
   * the panel closed before the answer arrived — must call this instead, or the loop is
   * stranded in "thinking" with the mic shut and conversation mode only apparently on.
   */
  const endTurn = useCallback(
    (continueConversation = true) => {
      if (!mountedRef.current) return;
      if (stateRef.current !== "idle") applyState("idle");
      if (continueConversation) maybeScheduleNextTurn();
    },
    [applyState, maybeScheduleNextTurn],
  );

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
    endTurn,
    setLanguage,
    /** Lets the consumer mark the thinking phase for a typed (non-voice) turn. */
    setThinking: useCallback(() => applyState("thinking"), [applyState]),
  };
}
