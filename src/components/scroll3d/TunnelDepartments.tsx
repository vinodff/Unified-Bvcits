"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import { frameSequences } from "@/lib/frame-manifest";
import { ArrowRight } from "@/components/ui/icons";
import { FrameLoader } from "./FrameLoader";
import {
  clamp01, diffVisibleZones, frameIndexFor, useCanvasRenderer, useFramePreloader,
  useNearViewport, useScrollProgress, type VisibilityZone,
} from "./useScrollCanvas";

const SEQUENCE = frameSequences.corridor;

const INTRO_FADE_END = 0.06;
const CTA_THRESHOLD = 0.82;
const STATIC_FRAME_RATIO = 0.3;

type DepartmentCard = VisibilityZone & {
  code: string;
  name: string;
  slug: string;
  body: string;
};

// Names, codes and slugs mirror `btechBranches` in src/data/home-content.ts.
const DEPARTMENTS: readonly DepartmentCard[] = [
  {
    id: "cse",
    show: 0.04,
    hide: 0.17,
    code: "CSE",
    name: "Computer Science & Engineering",
    slug: "computer-science-engineering",
    body: "The largest branch on campus, and the one behind the ₹38 LPA offer in 2026.",
  },
  {
    id: "aiml",
    show: 0.2,
    hide: 0.33,
    code: "AIML",
    name: "CSE — Artificial Intelligence & Machine Learning",
    slug: "cse-artificial-intelligence-machine-learning",
    body: "Applied ML, data engineering and model deployment, taught against real datasets.",
  },
  {
    id: "ece",
    show: 0.36,
    hide: 0.49,
    code: "ECE",
    name: "Electronics & Communication Engineering",
    slug: "electronics-communication-engineering",
    body: "Embedded systems, VLSI and communications — with an active FDP calendar.",
  },
  {
    id: "eee",
    show: 0.52,
    hide: 0.64,
    code: "EEE",
    name: "Electrical & Electronics Engineering",
    slug: "electrical-electronics-engineering",
    body: "Power systems and control, backed by an ABB recruitment pipeline.",
  },
  {
    id: "mech",
    show: 0.67,
    hide: 0.78,
    code: "MECH",
    name: "Mechanical Engineering",
    slug: "mechanical-engineering",
    body: "Design, thermal and manufacturing, with workshop hours that actually count.",
  },
];

export default function TunnelDepartments() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const introRef = useRef<HTMLDivElement | null>(null);
  const introOpacityRef = useRef(1);
  const visibleKeyRef = useRef("");

  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [isCtaVisible, setIsCtaVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // The hero sequence owns first paint; this one starts a viewport ahead.
  const shouldPreload = useNearViewport(sectionRef);
  const { framesRef, loadProgress, isReady, failedCount } = useFramePreloader(
    SEQUENCE.path,
    SEQUENCE.frameCount,
    shouldPreload,
  );
  const { canvasRef, drawFrame } = useCanvasRenderer(framesRef);

  const handleProgress = useCallback(
    (progress: number) => {
      drawFrame(frameIndexFor(progress, SEQUENCE.frameCount));

      const opacity = clamp01(1 - progress / INTRO_FADE_END);
      if (introRef.current && Math.abs(opacity - introOpacityRef.current) > 0.008) {
        introOpacityRef.current = opacity;
        introRef.current.style.opacity = String(opacity);
        introRef.current.style.visibility = opacity < 0.01 ? "hidden" : "visible";
      }

      const nextVisible = diffVisibleZones(DEPARTMENTS, progress, visibleKeyRef);
      if (nextVisible) setVisibleIds(nextVisible);

      const shouldShowCta = progress >= CTA_THRESHOLD;
      setIsCtaVisible((current) => (current === shouldShowCta ? current : shouldShowCta));
    },
    [drawFrame],
  );

  useScrollProgress(sectionRef, handleProgress, !prefersReducedMotion && isReady);

  useEffect(() => {
    if (!prefersReducedMotion || !isReady) return;
    drawFrame(frameIndexFor(STATIC_FRAME_RATIO, SEQUENCE.frameCount));
  }, [prefersReducedMotion, isReady, drawFrame]);

  const sequenceMissing = isReady && failedCount === SEQUENCE.frameCount;

  return (
    <section
      ref={sectionRef}
      id="departments"
      className="scroll-animation-long relative bg-[#050506]"
      aria-label="Departments"
    >
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

        {sequenceMissing && (
          <p className="absolute inset-x-0 top-1/2 z-20 px-6 text-center text-sm text-gold-200">
            Tunnel sequence not found. Run <code className="font-mono">npm run frames</code> to render it.
          </p>
        )}

        {/* ---------- Intro copy ---------- */}
        <div
          ref={introRef}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center"
        >
          <p className="eyebrow text-gold-300">Ten departments</p>
          <h2 className="mt-3 max-w-[18ch] font-display text-[2.2rem] font-extrabold leading-[1.06] tracking-tight text-white md:text-5xl xl:text-[3.6rem]">
            Pick a direction. Keep going.
          </h2>
          <p className="mt-5 max-w-[50ch] text-base leading-relaxed text-white/65">
            Nine undergraduate and five postgraduate programmes, all on one campus.
          </p>
        </div>

        {/* ---------- Department cards ---------- */}
        {DEPARTMENTS.map((department) => {
          const isVisible = visibleIds.includes(department.id);
          return (
            <div
              key={department.id}
              className={`absolute left-1/2 top-1/2 z-20 w-[min(26rem,calc(100vw-2.5rem))] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-white/10 bg-black/55 p-7 backdrop-blur-2xl transition-all duration-500 ease-out ${
                isVisible ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
              }`}
            >
              <span className="font-display text-[11px] font-extrabold uppercase tracking-[0.24em] text-gold-300">
                {department.code}
              </span>
              <h3 className="mt-3 font-display text-xl font-extrabold leading-snug text-white md:text-2xl">
                {department.name}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/65">{department.body}</p>
              <Link
                href={`/departments/${department.slug}`}
                className="group mt-5 inline-flex items-center gap-2 font-display text-sm font-bold text-gold-300 transition-colors hover:text-gold-200"
              >
                Open department
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          );
        })}

        {/* ---------- End-of-corridor CTA ---------- */}
        <div
          className={`absolute inset-x-0 bottom-0 z-20 flex flex-col items-center px-6 pb-16 text-center transition-all duration-700 ease-out ${
            isCtaVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-8 opacity-0"
          }`}
        >
          <p className="max-w-[36ch] font-display text-2xl font-extrabold leading-tight text-white md:text-3xl">
            Still deciding? Talk to the admissions team.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/departments" className="btn bg-white text-navy shadow-lg hover:bg-gold-50">
              See all ten departments
            </Link>
            <Link href="/contact-us" className="btn glass-dark text-white hover:bg-white/10">
              Contact us
            </Link>
          </div>
        </div>

        <FrameLoader progress={loadProgress} isReady={isReady} label="Entering the corridor" />
      </div>
    </section>
  );
}
