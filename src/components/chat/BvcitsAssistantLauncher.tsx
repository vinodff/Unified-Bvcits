"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, X, ChevronRight } from "lucide-react";
import BvcitsAiAvatar from "./BvcitsAiAvatar";
import BvcitsAssistantModal from "./BvcitsAssistantModal";

export default function BvcitsAssistantLauncher() {
  const [isOpen, setIsOpen] = useState(false);
  const [showBubble, setShowBubble] = useState(false);

  // Show greeting after 2s
  useEffect(() => {
    const t = setTimeout(() => setShowBubble(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // Unlock browser audio autoplay restriction on user click
  const handleOpenModal = () => {
    if (typeof window !== "undefined") {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          ctx.resume().then(() => ctx.close());
        }
      } catch {
        // ignore
      }
      try {
        const dummy = new Audio();
        dummy.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
        dummy.play().catch(() => {});
      } catch {
        // ignore
      }
      try {
        if ("speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance("");
          window.speechSynthesis.speak(u);
        }
      } catch {
        // ignore
      }
    }
    setIsOpen(true);
    setShowBubble(false);
  };

  return (
    <>
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2.5 sm:bottom-6 sm:right-6">
        {/* Simple greeting bubble */}
        <AnimatePresence>
          {showBubble && !isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.92 }}
              className="relative max-w-[240px] rounded-2xl bg-white border border-gray-200 p-3 shadow-xl"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBubble(false);
                }}
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3 w-3" />
              </button>

              <p className="text-sm font-semibold text-navy pr-4">
                నమస్కారం! 🙏
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                ఫీజులు, అడ్మిషన్ సమాచారం కావాలా?
              </p>

              <button
                type="button"
                onClick={handleOpenModal}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-navy to-crimson py-2 text-xs font-bold text-white hover:brightness-110"
              >
                మాట్లాడండి <ChevronRight className="h-3 w-3" />
              </button>

              <div className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-r border-b border-gray-200 bg-white" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Button */}
        <motion.button
          type="button"
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
            } else {
              handleOpenModal();
            }
          }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          className="group relative flex items-center justify-center rounded-full bg-gradient-to-br from-navy to-crimson p-1 text-white shadow-xl shadow-navy/25 hover:shadow-2xl"
          aria-label="BVCITS సహాయకుడు"
        >
          {/* Glow */}
          <span className="absolute -inset-1 rounded-full bg-gradient-to-r from-gold-400 via-crimson to-gold-400 opacity-50 blur-sm group-hover:opacity-80" />

          <div className="relative flex items-center gap-2 rounded-full bg-navy-900 px-3.5 py-2.5">
            <BvcitsAiAvatar size="sm" showStatus={false} />
            <span className="hidden sm:block text-xs font-bold text-gold-300">AI సహాయకుడు</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-crimson">
              <Mic className="h-4 w-4" />
            </span>
          </div>
        </motion.button>
      </div>

      <BvcitsAssistantModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
