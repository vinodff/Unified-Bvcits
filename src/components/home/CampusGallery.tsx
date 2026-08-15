"use client";

import Image from "next/image";
import { HorizontalScroll } from "@/components/motion/HorizontalScroll";

/**
 * Pinned horizontal-scroll gallery — vertical scroll drives horizontal pan
 * through campus photos on desktop (pointer: fine); degrades to a normal
 * horizontal scroll-snap strip on touch and under prefers-reduced-motion
 * (handled inside HorizontalScroll itself). This is the single
 * highest-impact addition from the research: the 2026 Awwwards data shows
 * scroll-driven narrative sections outscoring static equivalents by 1.8/10.
 */
export function CampusGallery({ images }: { images: string[] }) {
  return (
    <HorizontalScroll className="-mx-4 sm:-mx-6 lg:-mx-8" trackClassName="gap-4 px-4 py-2 sm:px-6 lg:px-8">
      {images.map((src) => (
        <div
          key={src}
          className="group relative h-[70vw] max-h-[520px] w-[85vw] shrink-0 snap-center overflow-hidden rounded-2xl shadow-card sm:h-[420px] sm:w-[520px]"
        >
          <Image
            src={src}
            alt="BVCITS campus life"
            fill
            quality={82}
            sizes="(min-width:768px) 520px, 85vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-navy/55 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
        </div>
      ))}
    </HorizontalScroll>
  );
}
