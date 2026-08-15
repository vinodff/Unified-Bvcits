"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { site } from "@/lib/site";
import { ArrowRight, GraduationCap, Sparkles, Trophy } from "@/components/ui/icons";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { CountUp, Magnetic, SpotlightCard, TextReveal } from "@/components/motion/Primitives";
import { A, heroHighlights, heroPills } from "@/data/home-content";

const heroIcons = [GraduationCap, Trophy, Sparkles];

/**
 * Homepage hero with layered scroll depth:
 * - background image drifts down + scales as you scroll (slowest layer)
 * - glow blobs float away at their own rates
 * - content slides up and softens (fastest layer)
 * Three independent rates = the "3D" parallax feel of premium sites.
 * All layers only animate transform/opacity (compositor-only, Lenis-safe).
 */
export default function HomeHeroScene() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  const imgY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1.05, 1.16]);
  const blobAY = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const blobBY = useTransform(scrollYProgress, [0, 1], [0, -110]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0.25]);

  return (
    <section ref={ref} className="relative isolate overflow-hidden bg-navy text-white">
      {/* Slowest layer: background photo, parallax drift + subtle zoom */}
      <motion.div
        className="absolute inset-0"
        style={reduce ? undefined : { y: imgY, scale: imgScale }}
      >
        <Image
          src={A.hero}
          alt=""
          fill
          priority
          quality={88}
          sizes="100vw"
          className="object-cover object-center opacity-[0.28]"
        />
      </motion.div>
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-navy via-navy/94 to-navy-800/80" />
      {/* Middle layers: glow blobs floating away at independent rates */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-crimson/25 blur-[110px] motion-safe:animate-drift"
        style={reduce ? undefined : { y: blobAY }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-0 h-[26rem] w-[26rem] rounded-full bg-gold-500/20 blur-[120px] motion-safe:animate-drift-slow"
        style={reduce ? undefined : { y: blobBY }}
      />
      <div aria-hidden className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "26px 26px" }} />

      {/* Fastest layer: content exits up + softens */}
      <motion.div style={reduce ? undefined : { y: contentY, opacity: contentOpacity }}>
        <div className="container-page relative grid items-center gap-14 py-20 md:py-28 lg:grid-cols-[1.08fr_.92fr]">
          <div>
            <Reveal>
              <div className="inline-flex items-center gap-2 rounded-full border border-gold-400/40 bg-white/10 px-4 py-1.5 text-xs font-semibold text-gold-200 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Admissions Open 2026–27 · Code: {site.counsellingCode}
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="eyebrow mt-7 text-gold-300">Why BVCITS?</p>
            </Reveal>
            <TextReveal
              as="h1"
              text="Built for future-ready careers"
              delay={0.12}
              className="mt-3 max-w-[14ch] font-display text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.02em] text-white sm:text-5xl md:text-6xl xl:text-[4.25rem]"
            />
            <Reveal delay={0.3}>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/75">
                Shaping confident engineers, innovators and future leaders.
              </p>
            </Reveal>
            <Reveal delay={0.4}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Magnetic>
                  <Link href={site.applyUrl} className="btn-primary group text-base shadow-lg shadow-gold/25">
                    Apply Now
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Magnetic>
                <Magnetic strength={0.25}>
                  <Link href="/placements-cell" className="btn border border-white/30 text-white backdrop-blur transition-colors hover:bg-white/10">
                    Placements
                  </Link>
                </Magnetic>
              </div>
            </Reveal>
            <Reveal delay={0.5}>
              <div className="mt-7 flex flex-wrap gap-2 text-xs">
                {heroPills.slice(2).map((p) => (
                  <span key={p} className="rounded-full border border-white/15 px-3 py-1 text-white/60 transition-colors hover:border-gold-400/50 hover:text-gold-200">
                    {p}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          <Stagger className="grid gap-4" delay={0.35} gap={0.12}>
            {heroHighlights.map((h, i) => {
              const Icon = heroIcons[i];
              return (
                <StaggerItem key={h.k} direction="left">
                  <SpotlightCard
                    tint="245,184,0"
                    className="flex items-center justify-between gap-4 rounded-2xl border border-white/12 bg-white/[0.07] p-6 backdrop-blur-md transition-colors hover:border-gold-400/40"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-400/15 text-gold-300">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="font-display text-sm font-bold uppercase tracking-wider text-gold-300">{h.k}</span>
                    </span>
                    <span className="text-right">
                      <CountUp value={h.v} className="block font-display text-xl font-extrabold text-white md:text-[1.6rem]" />
                      <span className="text-xs text-white/60">{h.sub}</span>
                    </span>
                  </SpotlightCard>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </motion.div>
    </section>
  );
}
