"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import { site } from "@/lib/site";
import { frameSequences } from "@/lib/frame-manifest";
import { ArrowRight } from "@/components/ui/icons";
import { FrameLoader } from "./FrameLoader";
import {
  clamp01, diffVisibleZones, frameIndexFor, useCanvasRenderer, useFramePreloader,
  useScrollProgress, type VisibilityZone,
} from "./useScrollCanvas";

const SEQUENCE = frameSequences.core;

/** Hero copy is gone by 8% of the scroll, before the lattice finishes knitting. */
const TEXT_FADE_END = 0.08;
/** Frame shown when motion is reduced — the lattice fully formed, mid-rotation. */
const STATIC_FRAME_RATIO = 0.42;

type Annotation = VisibilityZone & {
  value: string;
  title: string;
  body: string;
  position: string;
};

// Figures below are the same ones the rest of the site reports (see
// src/data/home-content.ts) — the hero must not invent its own numbers.
const ANNOTATIONS: readonly Annotation[] = [
  {
    id: "campus",
    show: 0.14,
    hide: 0.36,
    value: "40 acres",
    title: "A campus you can think in",
    body: "Green, residential and quiet — built so focus is the default, not the exception.",
    position: "left-5 top-1/2 -translate-y-1/2 md:left-12 lg:left-20",
  },
  {
    id: "faculty",
    show: 0.4,
    hide: 0.62,
    value: "195+",
    title: "Faculty across 10 departments",
    body: "Doctorates and industry practitioners teaching engineering, management and computing.",
    position: "right-5 top-1/2 -translate-y-1/2 md:right-12 lg:right-20",
  },
  {
    id: "placements",
    show: 0.66,
    hide: 0.9,
    value: "1,256+",
    title: "Placements in 2026",
    body: "58+ recruiting MNCs, with a highest offer of ₹38 lakhs per annum.",
    position: "bottom-16 left-1/2 -translate-x-1/2 md:bottom-20",
  },
];

export default function HeroCore() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const heroTextRef = useRef<HTMLDivElement | null>(null);
  const textOpacityRef = useRef(1);
  const visibleKeyRef = useRef("");

  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const prefersReducedMotion = useReducedMotion();

  const { framesRef, loadProgress, isReady, failedCount } = useFramePreloader(
    SEQUENCE.path,
    SEQUENCE.frameCount,
  );
  const { canvasRef, drawFrame } = useCanvasRenderer(framesRef);

  const handleProgress = useCallback(
    (progress: number) => {
      drawFrame(frameIndexFor(progress, SEQUENCE.frameCount));

      // Direct DOM write — this value changes on every single tick.
      const opacity = clamp01(1 - progress / TEXT_FADE_END);
      if (heroTextRef.current && Math.abs(opacity - textOpacityRef.current) > 0.008) {
        textOpacityRef.current = opacity;
        heroTextRef.current.style.opacity = String(opacity);
        heroTextRef.current.style.visibility = opacity < 0.01 ? "hidden" : "visible";
      }

      // React state only when the visible set genuinely changes.
      const nextVisible = diffVisibleZones(ANNOTATIONS, progress, visibleKeyRef);
      if (nextVisible) setVisibleIds(nextVisible);
    },
    [drawFrame],
  );

  useScrollProgress(sectionRef, handleProgress, !prefersReducedMotion && isReady);

  // Reduced motion: no scrubbing, just paint one well-composed frame.
  useEffect(() => {
    if (!prefersReducedMotion || !isReady) return;
    drawFrame(frameIndexFor(STATIC_FRAME_RATIO, SEQUENCE.frameCount));
  }, [prefersReducedMotion, isReady, drawFrame]);

  const sequenceMissing = isReady && failedCount === SEQUENCE.frameCount;

  return (
    <section ref={sectionRef} className="scroll-animation relative bg-navy-800">
      <div
        className="sticky top-0 h-screen w-full overflow-hidden"
        style={{ willChange: "transform", transform: "translateZ(0)" }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className="block h-full w-full"
          style={{ willChange: "contents", transform: "translateZ(0)" }}
        />

        {/* Legibility scrim so overlaid copy always clears contrast. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-navy-900/55 via-transparent to-navy-900/70"
        />

        {sequenceMissing && (
          <p className="absolute inset-x-0 top-1/2 z-20 px-6 text-center text-sm text-gold-200">
            Frame sequence not found. Run <code className="font-mono">npm run frames</code> to render it.
          </p>
        )}

        {/* ---------- Hero copy (fades out on first scroll) ---------- */}
        <div
          ref={heroTextRef}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center"
        >
          <span className="glass-dark inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-200">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
            Autonomous · NAAC &lsquo;A&rsquo; Grade · NBA Accredited
          </span>

          <h1 className="mt-7 max-w-[19ch] font-display text-[2.6rem] font-extrabold leading-[1.04] tracking-tight text-white md:text-6xl xl:text-[4.5rem]">
            One campus, a thousand connections.
          </h1>

          <p className="mt-6 max-w-[52ch] text-base leading-relaxed text-white/70 md:text-lg">
            {site.name}, Amalapuram — engineered around what happens after you graduate.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={site.applyUrl}
              className="btn-primary group text-base shadow-lg shadow-crimson/30"
            >
              Apply for 2026–27
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="#departments"
              className="btn glass-dark text-white transition-colors hover:bg-white/10"
            >
              Explore departments
            </Link>
          </div>

          <span className="mt-14 flex flex-col items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-white/40">
            Scroll to explore
            <span aria-hidden className="h-9 w-px bg-gradient-to-b from-gold-400/70 to-transparent" />
          </span>
        </div>

        {/* ---------- Annotation cards ---------- */}
        {ANNOTATIONS.map((annotation) => {
          const isVisible = visibleIds.includes(annotation.id);
          return (
            <div
              key={annotation.id}
              // CSS transitions, not Framer Motion — these toggle during scroll.
              className={`glass-dark absolute z-20 w-[min(19rem,calc(100vw-2.5rem))] rounded-[20px] p-6 transition-all duration-500 ease-out ${
                annotation.position
              } ${isVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-5 opacity-0"}`}
            >
              <span className="font-display text-3xl font-extrabold text-gold-300">{annotation.value}</span>
              <p className="mt-2 font-display text-base font-bold text-white">{annotation.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{annotation.body}</p>
            </div>
          );
        })}

        <FrameLoader progress={loadProgress} isReady={isReady} label="Building the campus graph" />
      </div>
    </section>
  );
}
