"use client";

import React from "react";
import { Volume2 } from "lucide-react";

interface AvatarProps {
  size?: "sm" | "md" | "lg" | "xl";
  isSpeaking?: boolean;
  isListening?: boolean;
  showStatus?: boolean;
  className?: string;
}

export default function BvcitsAiAvatar({
  size = "md",
  isSpeaking = false,
  isListening = false,
  showStatus = true,
  className = "",
}: AvatarProps) {
  const sizeMap = {
    sm: "w-10 h-10",
    md: "w-13 h-13",
    lg: "w-16 h-16",
    xl: "w-24 h-24",
  };

  const ringSizeMap = {
    sm: "w-12 h-12 -inset-1",
    md: "w-16 h-16 -inset-1.5",
    lg: "w-20 h-20 -inset-2",
    xl: "w-28 h-28 -inset-2",
  };

  const imgSizeMap = {
    sm: 40,
    md: 52,
    lg: 64,
    xl: 96,
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      {/* Outer Pulse Glowing Aura */}
      <div
        className={`absolute rounded-full transition-all duration-700 pointer-events-none ${
          isSpeaking
            ? "bg-gradient-to-r from-crimson via-gold-400 to-crimson opacity-85 blur-md animate-spin-slow scale-115"
            : isListening
            ? "bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 opacity-90 blur-md animate-pulse scale-120"
            : "bg-gradient-to-r from-navy via-crimson to-gold-500 opacity-40 blur-sm scale-100"
        } ${ringSizeMap[size]}`}
      />

      {/* Main Avatar Container — now shows real BVCITS logo */}
      <div
        className={`relative ${sizeMap[size]} rounded-full bg-gradient-to-br from-navy-900 via-navy to-crimson p-0.5 shadow-xl transition-transform duration-300 hover:scale-105 flex items-center justify-center overflow-hidden border-2 border-white/30`}
      >
        {/* Subtle Ambient Shimmer */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/10 via-transparent to-white/20 pointer-events-none z-10" />

        {/* Real BVCITS College Logo */}
        <div className="relative w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logos/cropped-logo.png"
            alt="BVCITS Logo"
            width={imgSizeMap[size]}
            height={imgSizeMap[size]}
            className="w-full h-full object-cover rounded-full"
          />

          {/* Speaking equalizer bars overlay */}
          {isSpeaking && (
            <div className="absolute inset-0 flex items-end justify-center pb-1 bg-navy/30 rounded-full">
              <div className="flex items-end gap-0.5">
                <span className="w-1 bg-gold-400 rounded-full animate-bounce h-2" style={{ animationDelay: "0ms" }} />
                <span className="w-1 bg-crimson-400 rounded-full animate-bounce h-3.5" style={{ animationDelay: "150ms" }} />
                <span className="w-1 bg-gold-300 rounded-full animate-bounce h-2.5" style={{ animationDelay: "300ms" }} />
                <span className="w-1 bg-white rounded-full animate-bounce h-3" style={{ animationDelay: "75ms" }} />
              </div>
            </div>
          )}

          {/* Listening pulse overlay */}
          {isListening && (
            <div className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-60" />
          )}
        </div>
      </div>

      {/* Online / Active Status Badge */}
      {showStatus && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white ${
            isSpeaking
              ? "bg-gold-400 shadow-md shadow-gold-500/50"
              : isListening
              ? "bg-emerald-500 shadow-md shadow-emerald-500/50 animate-ping"
              : "bg-emerald-500"
          }`}
          title={isSpeaking ? "Speaking" : isListening ? "Listening" : "Online"}
        >
          {isSpeaking ? (
            <Volume2 className="w-2.5 h-2.5 text-navy font-bold" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
          )}
        </span>
      )}
    </div>
  );
}
