"use client";

import { useState } from "react";

interface BlogImageProps {
  src: string | null | undefined;
  alt?: string | null;
  className?: string;
  category?: string;
  title?: string;
  aspectRatio?: "16/9" | "21/9" | "auto";
  priority?: boolean;
}

export default function BlogImage({
  src,
  alt,
  className = "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105",
  category,
  title,
  aspectRatio = "16/9",
  priority = false,
}: BlogImageProps) {
  const [error, setError] = useState(false);

  const aspectClass =
    aspectRatio === "21/9"
      ? "aspect-[21/9]"
      : aspectRatio === "16/9"
        ? "aspect-[16/9]"
        : "aspect-auto";

  if (!src || error) {
    return (
      <div
        className={`relative ${aspectClass} w-full overflow-hidden bg-gradient-to-br from-[#08142c] via-[#0f2142] to-[#2a0d18] flex flex-col items-center justify-center p-6 text-center shadow-inner`}
      >
        <div
          aria-hidden
          className="absolute -right-10 -top-10 h-40 w-40 rounded-full border border-gold/20 bg-gold/5 blur-xl pointer-events-none"
        />
        <div
          aria-hidden
          className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full border border-crimson/30 bg-crimson/10 blur-xl pointer-events-none"
        />
        {category ? (
          <span className="relative z-10 rounded-full border border-gold/40 bg-gold/15 px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-gold shadow-xs">
            {category}
          </span>
        ) : null}
        {title ? (
          <p className="relative z-10 mt-2 font-display text-xs md:text-sm font-bold leading-snug text-white/95 line-clamp-2 max-w-[85%]">
            {title}
          </p>
        ) : (
          <p className="relative z-10 font-display text-xs font-bold uppercase tracking-widest text-gold/90">
            BVCITS Knowledge Series
          </p>
        )}
        <div className="relative z-10 mt-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-white/50">
          <span>BVCITS Amalapuram</span>
          <span>·</span>
          <span className="text-gold/80">BVTS</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${aspectClass} w-full overflow-hidden bg-gradient-to-br from-[#08142c] via-[#0f2142] to-[#2a0d18] flex items-center justify-center`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || title || "BVCITS Blog"}
        loading={priority ? "eager" : "lazy"}
        className={className}
        onError={() => setError(true)}
      />
    </div>
  );
}
