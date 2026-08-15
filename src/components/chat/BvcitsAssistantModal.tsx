"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Mic,
  Send,
  Volume2,
  VolumeX,
  Phone,
  GraduationCap,
  Trophy,
  IndianRupee,
  RotateCcw,
  PhoneOff,
  AudioLines,
} from "lucide-react";
import BvcitsAiAvatar from "./BvcitsAiAvatar";
import {
  HodContactCard,
  AppointmentBookingCard,
  FeeBreakdownCard,
  PlacementsShowcaseCard,
  BusRoutesCard,
  WebsiteNavigatorCard,
  StaffAppointmentLedgerModal,
} from "./ChatActionCards";
import {
  EMPTY_CONTEXT,
  processQuery,
  welcomeReply,
  type ActionCard,
  type ConversationContext,
  type QuickReply,
} from "@/lib/campus-agent";
import { useCampusVoice, type VoiceNotice } from "@/lib/useCampusVoice";
import type { HodInfo } from "@/data/bvcits-bot-knowledge";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  textTe: string;
  textEn: string;
  /** Exact figures and links, shown under a naturally-phrased reply. */
  detailTe?: string;
  detailEn?: string;
  spokenTe?: string;
  spokenEn?: string;
  actionCards?: ActionCard[];
  quickReplies?: QuickReply[];
  timestamp: string;
}

/** Shape returned by /api/assistant. */
interface AssistantResponse {
  replyTelugu: string;
  replyEnglish: string;
  detailTelugu?: string;
  detailEnglish?: string;
  spokenTelugu: string;
  spokenEnglish: string;
  actionCards: ActionCard[];
  quickReplies: QuickReply[];
  context: ConversationContext;
}

/** Renders **bold** and [label](href) without pulling in a markdown dependency. */
function renderText(raw: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];

  raw.split("\n").forEach((line, li) => {
    if (li > 0) nodes.push(<br key={`br-${li}`} />);

    let rest = line;
    let pi = 0;

    while (rest.length > 0) {
      const bold = rest.match(/^([\s\S]*?)\*\*([\s\S]+?)\*\*([\s\S]*)/);
      if (bold) {
        if (bold[1]) nodes.push(<span key={`s-${li}-${pi++}`}>{bold[1]}</span>);
        nodes.push(
          <strong key={`b-${li}-${pi++}`} className="font-bold">
            {bold[2]}
          </strong>,
        );
        rest = bold[3];
        continue;
      }

      const link = rest.match(/^([\s\S]*?)\[([^\]]+)\]\(([^)]+)\)([\s\S]*)/);
      if (link) {
        if (link[1]) nodes.push(<span key={`s-${li}-${pi++}`}>{link[1]}</span>);
        const href = link[3];
        const isInternal = href.startsWith("/") || href.startsWith("tel:");
        nodes.push(
          <a
            key={`a-${li}-${pi++}`}
            href={href}
            className="font-semibold text-crimson underline hover:text-crimson-700"
            target={isInternal ? undefined : "_blank"}
            rel={isInternal ? undefined : "noopener noreferrer"}
          >
            {link[2]}
          </a>,
        );
        rest = link[4];
        continue;
      }

      nodes.push(<span key={`s-${li}-${pi++}`}>{rest}</span>);
      rest = "";
    }
  });

  return nodes;
}

const QUICK_TOPICS = [
  {
    id: "fees",
    icon: IndianRupee,
    labelTe: "ఫీజు వివరాలు",
    labelEn: "Fee Details",
    query: "fee structure",
    color: "from-emerald-500 to-emerald-600",
  },
  {
    id: "call",
    icon: Phone,
    labelTe: "HOD కి కాల్",
    labelEn: "Call HOD",
    query: "cse hod phone number",
    color: "from-blue-500 to-blue-600",
  },
  {
    id: "placements",
    icon: Trophy,
    labelTe: "ప్లేస్‌మెంట్స్",
    labelEn: "Placements",
    query: "placements",
    color: "from-amber-500 to-orange-500",
  },
  {
    id: "admission",
    icon: GraduationCap,
    labelTe: "అడ్మిషన్",
    labelEn: "Admission",
    query: "how to get admission",
    color: "from-purple-500 to-purple-600",
  },
];

const NOTICE_TEXT: Record<VoiceNotice, { te: string; en: string }> = {
  unsupported: {
    te: "ఈ బ్రౌజర్‌లో వాయిస్ పని చేయదు. దయచేసి Chrome వాడండి.",
    en: "Voice isn't supported in this browser. Please use Chrome.",
  },
  "mic-denied": {
    te: "మైక్ అనుమతి ఇవ్వలేదు. బ్రౌజర్ సెట్టింగ్స్‌లో అనుమతించండి.",
    en: "Microphone permission was denied. Allow it in browser settings.",
  },
  network: {
    te: "నెట్‌వర్క్ సమస్య. మళ్ళీ ప్రయత్నించండి.",
    en: "Network problem. Please try again.",
  },
  "silent-timeout": {
    te: "ఏమీ వినపడలేదు — సంభాషణ ఆపేశాను. మళ్ళీ మాట్లాడాలంటే మైక్ నొక్కండి.",
    en: "I didn't hear anything, so I've stopped listening. Tap the mic to resume.",
  },
  "tts-failed": {
    te: "వాయిస్ ప్లే కాలేదు.",
    en: "Couldn't play the voice reply.",
  },
};

function timestamp(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function BvcitsAssistantModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [preferredLang, setPreferredLang] = useState<"te" | "en">("te");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [notice, setNotice] = useState<VoiceNotice | null>(null);
  const [showStaffLedger, setShowStaffLedger] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  /** Conversation memory, so follow-ups keep the department in scope. */
  const contextRef = useRef<ConversationContext>(EMPTY_CONTEXT);
  /** Recent turns sent to the model so its replies follow the thread. */
  const historyRef = useRef<{ role: "user" | "model"; text: string }[]>([]);
  /** Read inside the voice callback, which is registered once. */
  const langRef = useRef(preferredLang);
  const voiceEnabledRef = useRef(voiceEnabled);

  useEffect(() => {
    langRef.current = preferredLang;
  }, [preferredLang]);
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  /** Declared before the voice hook so the utterance callback can reach it. */
  const handleSendRef = useRef<(text: string) => Promise<void>>(async () => {});

  const handleUtterance = useCallback((text: string) => {
    void handleSendRef.current(text);
  }, []);

  const handleNotice = useCallback((next: VoiceNotice) => {
    setNotice(next);
  }, []);

  const {
    state: voiceState,
    isListening,
    isSpeaking,
    interimTranscript,
    audioLevel,
    isSupported,
    conversationMode,
    startConversation,
    stopConversation,
    speak,
    stopSpeaking,
    setLanguage,
  } = useCampusVoice({ onUtterance: handleUtterance, onNotice: handleNotice });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, isListening, scrollToBottom]);

  useEffect(() => {
    setLanguage(preferredLang === "te" ? "te-IN" : "en-IN");
  }, [preferredLang, setLanguage]);

  /** Seeds the welcome message. Also runs after a reset, which used to blank the window. */
  const seedWelcome = useCallback(() => {
    const welcome = welcomeReply();
    contextRef.current = EMPTY_CONTEXT;
    historyRef.current = [];
    setMessages([
      {
        id: "msg-welcome",
        sender: "bot",
        textTe: welcome.replyTelugu,
        textEn: welcome.replyEnglish,
        spokenTe: welcome.spokenTelugu,
        spokenEn: welcome.spokenEnglish,
        actionCards: [],
        quickReplies: welcome.quickReplies,
        timestamp: timestamp(),
      },
    ]);
  }, []);

  useEffect(() => {
    if (isOpen && messages.length === 0) seedWelcome();
  }, [isOpen, messages.length, seedWelcome]);

  // Closing the panel must release the microphone and stop playback.
  useEffect(() => {
    if (!isOpen) {
      stopConversation();
      setNotice(null);
    }
  }, [isOpen, stopConversation]);

  /**
   * Asks the server for a naturally-phrased answer. Falls back to the local engine on any
   * failure, so the assistant still answers with no network, no API key, or a failing model.
   */
  const resolveAnswer = useCallback(async (query: string): Promise<AssistantResponse> => {
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          language: langRef.current,
          context: contextRef.current,
          history: historyRef.current,
        }),
      });
      if (!response.ok) throw new Error(`assistant responded ${response.status}`);
      return (await response.json()) as AssistantResponse;
    } catch {
      const { reply, context } = processQuery(query, contextRef.current);
      return {
        replyTelugu: reply.replyTelugu,
        replyEnglish: reply.replyEnglish,
        spokenTelugu: reply.spokenTelugu,
        spokenEnglish: reply.spokenEnglish,
        actionCards: reply.actionCards,
        quickReplies: reply.quickReplies,
        context,
      };
    }
  }, []);

  const handleSend = useCallback(
    async (rawText: string) => {
      const query = rawText.trim();
      if (!query) return;

      stopSpeaking();
      setNotice(null);

      const lang = langRef.current;

      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          sender: "user",
          textTe: query,
          textEn: query,
          timestamp: timestamp(),
        },
      ]);
      setInputText("");
      setIsTyping(true);

      const answer = await resolveAnswer(query);
      contextRef.current = answer.context;

      const spoken = lang === "te" ? answer.spokenTelugu : answer.spokenEnglish;
      // Keep the thread for the model, trimmed so prompt size stays bounded.
      historyRef.current = [
        ...historyRef.current,
        { role: "user" as const, text: query },
        { role: "model" as const, text: spoken },
      ].slice(-6);

      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: "bot",
          textTe: answer.replyTelugu,
          textEn: answer.replyEnglish,
          detailTe: answer.detailTelugu,
          detailEn: answer.detailEnglish,
          spokenTe: answer.spokenTelugu,
          spokenEn: answer.spokenEnglish,
          actionCards: answer.actionCards,
          quickReplies: answer.quickReplies,
          timestamp: timestamp(),
        },
      ]);

      if (!voiceEnabledRef.current) return;

      // Awaiting this is what makes turn-taking work: the hook reopens the mic
      // only once playback has actually finished.
      await speak(spoken, { lang: lang === "te" ? "te-IN" : "en-IN" });
    },
    [resolveAnswer, speak, stopSpeaking],
  );

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  const handleReplay = useCallback(
    (msg: ChatMessage) => {
      if (isSpeaking) {
        stopSpeaking();
        return;
      }
      const text = preferredLang === "te" ? msg.spokenTe ?? msg.textTe : msg.spokenEn ?? msg.textEn;
      // A manual replay is a one-off — it must not hand the turn back to the mic.
      void speak(text, {
        lang: preferredLang === "te" ? "te-IN" : "en-IN",
        continueConversation: false,
      });
    },
    [isSpeaking, preferredLang, speak, stopSpeaking],
  );

  const handleBookAppointment = useCallback((hod: HodInfo) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `bot-apt-${Date.now()}`,
        sender: "bot",
        textTe: `**${hod.hodName}** గారితో అపాయింట్మెంట్:`,
        textEn: `Appointment with **${hod.hodName}**:`,
        actionCards: [
          {
            type: "appointment_booking",
            payload: {
              hodInfo: hod,
              department: hod.department,
              defaultDate: "Tomorrow (రేపు)",
              availableSlots: hod.slots,
            },
          },
        ],
        timestamp: timestamp(),
      },
    ]);
  }, []);

  const handleReset = useCallback(() => {
    stopConversation();
    setNotice(null);
    seedWelcome();
  }, [seedWelcome, stopConversation]);

  const toggleConversation = useCallback(() => {
    if (conversationMode) {
      stopConversation();
      return;
    }
    setNotice(null);
    startConversation(preferredLang === "te" ? "te-IN" : "en-IN");
  }, [conversationMode, preferredLang, startConversation, stopConversation]);

  const hasConversation = messages.length > 1;

  const statusLabel = (() => {
    if (isListening) return preferredLang === "te" ? "వింటున్నాను…" : "Listening…";
    if (voiceState === "thinking") return preferredLang === "te" ? "ఆలోచిస్తున్నాను…" : "Thinking…";
    if (isSpeaking) return preferredLang === "te" ? "చెబుతున్నాను…" : "Speaking…";
    if (conversationMode) return preferredLang === "te" ? "సంభాషణ ఆన్" : "Conversation on";
    return preferredLang === "te" ? "ఆన్‌లైన్" : "Online";
  })();

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-end sm:items-center sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="pointer-events-auto fixed inset-0 bg-black/30 backdrop-blur-xs sm:hidden"
            />

            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              role="dialog"
              aria-modal="true"
              aria-label="BVCITS campus assistant"
              className="pointer-events-auto relative flex h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl border border-gray-200 bg-white shadow-2xl sm:h-[700px] sm:w-[440px] sm:rounded-3xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between bg-gradient-to-r from-navy via-navy-900 to-crimson px-4 py-3 text-white">
                <div className="flex items-center gap-3">
                  <BvcitsAiAvatar
                    size="sm"
                    isSpeaking={isSpeaking}
                    isListening={isListening}
                    showStatus
                  />
                  <div>
                    <h3 className="text-sm font-bold">BVCITS సహాయకుడు</h3>
                    <p className="text-xs" aria-live="polite">
                      <span
                        className={
                          isListening
                            ? "animate-pulse text-emerald-300"
                            : isSpeaking
                              ? "text-gold-300"
                              : "text-white/70"
                        }
                      >
                        ● {statusLabel}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreferredLang((p) => (p === "te" ? "en" : "te"))}
                    className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs font-bold hover:bg-white/20"
                    aria-label="Switch language"
                  >
                    {preferredLang === "te" ? "తె" : "En"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isSpeaking) stopSpeaking();
                      setVoiceEnabled((p) => !p);
                    }}
                    className={`rounded-full p-1.5 ${voiceEnabled ? "bg-white/15" : "text-white/40"}`}
                    aria-label={voiceEnabled ? "Turn voice replies off" : "Turn voice replies on"}
                    aria-pressed={voiceEnabled}
                  >
                    {voiceEnabled ? (
                      <Volume2 className="h-4 w-4" />
                    ) : (
                      <VolumeX className="h-4 w-4" />
                    )}
                  </button>

                  {hasConversation && (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="rounded-full p-1.5 text-white/60 hover:bg-white/15 hover:text-white"
                      aria-label="Reset conversation"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full p-1.5 text-white/70 hover:bg-white/20 hover:text-white"
                    aria-label="Close assistant"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-gray-50 to-white p-4">
                {!hasConversation && messages.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 shrink-0">
                        <BvcitsAiAvatar size="sm" showStatus={false} />
                      </div>
                      <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-gray-100 bg-white p-3.5 shadow-sm">
                        <div className="text-sm leading-relaxed text-navy">
                          {renderText(
                            preferredLang === "te" ? messages[0].textTe : messages[0].textEn,
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 px-1">
                      {QUICK_TOPICS.map((topic) => {
                        const Icon = topic.icon;
                        return (
                          <button
                            key={topic.id}
                            type="button"
                            onClick={() => void handleSend(topic.query)}
                            className={`flex flex-col items-center justify-center gap-2 rounded-2xl bg-gradient-to-br ${topic.color} p-4 text-white shadow-md transition-transform active:scale-95`}
                          >
                            <Icon className="h-7 w-7" />
                            <span className="text-center text-sm font-bold leading-tight">
                              {preferredLang === "te" ? topic.labelTe : topic.labelEn}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {hasConversation &&
                  messages.map((msg, idx) => {
                    const isBot = msg.sender === "bot";
                    const isLast = idx === messages.length - 1;

                    if (!isBot) {
                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex justify-end"
                        >
                          <div className="max-w-[80%]">
                            <div className="rounded-2xl rounded-tr-sm bg-crimson px-4 py-2.5 text-white shadow-sm">
                              <p className="text-sm">{msg.textTe}</p>
                            </div>
                            <p className="mr-1 mt-1 text-right text-[10px] text-gray-400">
                              {msg.timestamp}
                            </p>
                          </div>
                        </motion.div>
                      );
                    }

                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-start"
                      >
                        <div className="flex max-w-[88%] items-start gap-2">
                          <div className="mt-0.5 shrink-0">
                            <BvcitsAiAvatar size="sm" showStatus={false} />
                          </div>
                          <div className="min-w-0">
                            <div className="rounded-2xl rounded-tl-sm border border-gray-100 bg-white p-3.5 shadow-sm">
                              <div className="text-sm leading-relaxed text-navy">
                                {renderText(preferredLang === "te" ? msg.textTe : msg.textEn)}
                              </div>

                              {/* Exact figures and links stay verbatim from the grounded
                                  engine, under the conversational reply above. */}
                              {(preferredLang === "te" ? msg.detailTe : msg.detailEn) && (
                                <div className="mt-2.5 border-t border-dashed border-gray-200 pt-2.5 text-[13px] leading-relaxed text-ink-soft">
                                  {renderText(
                                    (preferredLang === "te" ? msg.detailTe : msg.detailEn) ?? "",
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="ml-1 mt-1.5 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleReplay(msg)}
                                className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                              >
                                <Volume2 className="h-3 w-3" />
                                {preferredLang === "te" ? "వినండి" : "Listen"}
                              </button>
                              <span className="text-[10px] text-gray-400">{msg.timestamp}</span>
                            </div>

                            {msg.actionCards && msg.actionCards.length > 0 && (
                              <div className="mt-2 space-y-2">
                                {msg.actionCards.map((card, i) => {
                                  const key = `${msg.id}-card-${i}`;
                                  /* eslint-disable @typescript-eslint/no-explicit-any */
                                  const payload = card.payload as any;
                                  switch (card.type) {
                                    case "website_navigator":
                                      return (
                                        <WebsiteNavigatorCard
                                          key={key}
                                          payload={payload}
                                          onNavigate={onClose}
                                        />
                                      );
                                    case "hod_contact":
                                      return (
                                        <HodContactCard
                                          key={key}
                                          hod={payload}
                                          onBookAppointment={handleBookAppointment}
                                        />
                                      );
                                    case "appointment_booking":
                                      return <AppointmentBookingCard key={key} payload={payload} />;
                                    case "fee_breakdown":
                                      return <FeeBreakdownCard key={key} payload={payload} />;
                                    case "placements_showcase":
                                      return <PlacementsShowcaseCard key={key} payload={payload} />;
                                    case "bus_routes":
                                      return <BusRoutesCard key={key} payload={payload} />;
                                    default:
                                      return null;
                                  }
                                  /* eslint-enable @typescript-eslint/no-explicit-any */
                                })}
                              </div>
                            )}

                            {/* Follow-up chips only on the newest reply, so old ones don't pile up. */}
                            {isLast && msg.quickReplies && msg.quickReplies.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {msg.quickReplies.map((chip) => (
                                  <button
                                    key={chip.query}
                                    type="button"
                                    onClick={() => void handleSend(chip.query)}
                                    className="rounded-full border border-crimson-200 bg-crimson-50 px-3 py-1.5 text-xs font-semibold text-crimson transition-colors hover:bg-crimson-100"
                                  >
                                    {preferredLang === "te" ? chip.te : chip.en}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}

                {isTyping && (
                  <div className="ml-1 flex items-center gap-2">
                    <BvcitsAiAvatar size="sm" showStatus={false} />
                    <div className="flex gap-1.5 rounded-2xl rounded-tl-sm border border-gray-100 bg-white px-4 py-3 shadow-sm">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {isListening && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border-2 border-emerald-400/50 bg-emerald-50 p-4 shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
                        <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white">
                          <Mic className="h-5 w-5" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-emerald-900">
                          {interimTranscript
                            ? `"${interimTranscript}"`
                            : preferredLang === "te"
                              ? "మాట్లాడండి…"
                              : "Go ahead…"}
                        </p>
                        <div className="mt-1.5 flex h-4 items-end gap-1">
                          {[0, 1, 2, 3, 4, 5].map((i) => (
                            <div
                              key={i}
                              className="w-1.5 rounded-full bg-emerald-500 transition-all duration-100"
                              style={{
                                height: `${Math.max(4, audioLevel * (10 + i * 2))}px`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {notice && (
                  <div
                    role="status"
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                  >
                    {preferredLang === "te" ? NOTICE_TEXT[notice].te : NOTICE_TEXT[notice].en}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <div className="border-t border-gray-200 bg-white p-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSend(inputText);
                  }}
                  className="flex items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={toggleConversation}
                    disabled={!isSupported}
                    aria-pressed={conversationMode}
                    aria-label={
                      conversationMode ? "End voice conversation" : "Start voice conversation"
                    }
                    className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                      conversationMode
                        ? "scale-110 bg-emerald-600 text-white ring-4 ring-emerald-200"
                        : "bg-gradient-to-br from-navy to-crimson text-white shadow-md hover:shadow-lg active:scale-95"
                    }`}
                  >
                    {conversationMode ? (
                      <PhoneOff className="h-5 w-5" />
                    ) : isSpeaking ? (
                      <AudioLines className="h-5 w-5" />
                    ) : (
                      <Mic className="h-5 w-5" />
                    )}
                  </button>

                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder={
                        preferredLang === "te"
                          ? "మీ ప్రశ్న టైప్ చేయండి…"
                          : "Type your question…"
                      }
                      aria-label="Message"
                      className="w-full rounded-full border border-gray-200 bg-gray-50 py-3 pl-4 pr-10 text-sm text-gray-800 outline-none focus:border-crimson focus:bg-white focus:ring-2 focus:ring-crimson/10"
                    />
                    {inputText && (
                      <button
                        type="button"
                        onClick={() => setInputText("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        aria-label="Clear input"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    aria-label="Send"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-crimson text-white shadow-md transition-all hover:bg-crimson-700 active:scale-95 disabled:opacity-30 disabled:shadow-none"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </form>

                <p className="mt-2 text-center text-[11px] text-gray-400">
                  {conversationMode
                    ? preferredLang === "te"
                      ? "🎙️ సంభాషణ మోడ్ — మాట్లాడండి, నేను జవాబిచ్చాక మళ్ళీ వింటాను"
                      : "🎙️ Conversation mode — I'll listen again after each answer"
                    : "📍 BVCITS అమలాపురం · 📞 +91 99854 22678"}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <StaffAppointmentLedgerModal
        isOpen={showStaffLedger}
        onClose={() => setShowStaffLedger(false)}
      />
    </>
  );
}
