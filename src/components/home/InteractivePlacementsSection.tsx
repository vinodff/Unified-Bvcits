"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useTransform, useSpring } from "motion/react";
import {
  ArrowRight,
  BadgeCheck,
  Target,
  Trophy,
  Handshake,
  UserCheck,
  Building2,
} from "@/components/ui/icons";
import WhiteAICanvasSequence from "./WhiteAICanvasSequence";
import {
  placementStats,
  toppers,
  recruiterOffers,
  careerSteps,
  topRecruiters,
} from "@/data/home-content";

const careerIcons = [Target, Handshake, UserCheck];

export function InteractivePlacementsSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const smoothScroll = useSpring(scrollYProgress, {
    stiffness: 70,
    damping: 25,
    restDelta: 0.001
  });

  // --- Phase 1: Intro (0 to 0.2) ---
  const introOpacity = useTransform(smoothScroll, [0, 0.05, 0.15, 0.2], [0, 1, 1, 0]);
  const introY = useTransform(smoothScroll, [0, 0.05, 0.15, 0.2], [50, 0, -20, -50]);

  // --- Phase 2: Stats & Toppers (0.2 to 0.55) ---
  const p2ContainerOpacity = useTransform(smoothScroll, [0.2, 0.25, 0.5, 0.55], [0, 1, 1, 0]);
  
  // Staggered stats
  const stat1Y = useTransform(smoothScroll, [0.2, 0.25], [40, 0]);
  const stat2Y = useTransform(smoothScroll, [0.21, 0.26], [40, 0]);
  const stat3Y = useTransform(smoothScroll, [0.22, 0.27], [40, 0]);
  const stat4Y = useTransform(smoothScroll, [0.23, 0.28], [40, 0]);

  // Staggered toppers
  const topper1Y = useTransform(smoothScroll, [0.24, 0.29], [60, 0]);
  const topper2Y = useTransform(smoothScroll, [0.26, 0.31], [60, 0]);

  // --- Phase 3: Recruiters & Ecosystem (0.55 to 0.9) ---
  const p3ContainerOpacity = useTransform(smoothScroll, [0.55, 0.6, 0.85, 0.9], [0, 1, 1, 0]);
  const p3Y = useTransform(smoothScroll, [0.55, 0.65], [60, 0]);

  // --- Phase 4: Network CTA (0.9 to 1.0) ---
  const ctaOpacity = useTransform(smoothScroll, [0.9, 0.95], [0, 1]);
  const ctaY = useTransform(smoothScroll, [0.9, 0.95], [40, 0]);

  return (
    <section ref={sectionRef} className="relative bg-white text-navy h-[450vh]">
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <WhiteAICanvasSequence scrollYProgress={scrollYProgress} frameCount={180} />
        
        {/* Core Gradients for readability on White AI */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-white/90 via-white/50 to-white" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-white/95 via-transparent to-white/95" />
        
        {/* Cinematic Ambient Soft Glow */}
        <div aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
          <div className="w-[800px] h-[800px] bg-cyan-200/50 rounded-full blur-[150px]" />
        </div>

        <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8 lg:p-16 overflow-hidden">
          
          {/* ----- PHASE 1: INTRO ----- */}
          <motion.div 
            style={{ opacity: introOpacity, y: introY }}
            className="absolute w-[90%] max-w-4xl text-center pointer-events-none z-10"
          >
            <p className="eyebrow text-gold-600 mb-6 drop-shadow-sm tracking-[0.2em] font-bold uppercase">Global Network & Scale</p>
            <h2 className="font-display text-4xl sm:text-5xl lg:text-[5rem] font-extrabold tracking-tight text-navy leading-[1.1] drop-shadow-xl">
              Strong placements.<br/>Clear career direction.
            </h2>
          </motion.div>

          {/* ----- PHASE 2: STATS & PREMIUM TOPPERS ----- */}
          <motion.div 
            style={{ opacity: p2ContainerOpacity }}
            className="absolute w-[95%] max-w-5xl pointer-events-auto z-20 flex flex-col gap-8 lg:gap-12"
          >
            {/* Dashboard Radials */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {[stat1Y, stat2Y, stat3Y, stat4Y].map((yTransform, i) => (
                <motion.div 
                  key={placementStats[i].label}
                  style={{ y: yTransform }}
                  className="flex flex-col items-center justify-center rounded-[2rem] border border-navy/5 bg-white/90 p-6 lg:p-8 backdrop-blur-xl shadow-xl ring-1 ring-black/5 relative overflow-hidden transition-transform hover:-translate-y-1 hover:shadow-2xl"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-gold-500/5 to-cyan-500/5" />
                  <span className="font-display text-3xl lg:text-4xl font-extrabold text-navy drop-shadow-sm z-10">{placementStats[i].v}</span>
                  <span className="mt-2 text-xs lg:text-sm font-semibold text-navy/60 text-center z-10 uppercase tracking-wider">{placementStats[i].label}</span>
                </motion.div>
              ))}
            </div>

            {/* Premium Portrait Toppers */}
            <div className="grid gap-6 md:grid-cols-2">
              {[topper1Y, topper2Y].map((yTransform, i) => (
                <motion.div 
                  key={toppers[i].name}
                  style={{ y: yTransform }}
                  className="group relative flex flex-col h-[400px] lg:h-[480px] overflow-hidden rounded-[2.5rem] border border-navy/10 bg-white shadow-lg transition-all hover:border-gold-500/40 hover:-translate-y-3 hover:shadow-[0_30px_60px_rgba(245,184,0,0.15)] ring-1 ring-black/5"
                >
                  {/* Portrait Image Background - Top Half */}
                  <div className="relative flex-1 bg-surface-light overflow-hidden">
                    <Image 
                      src={toppers[i].img} 
                      alt={toppers[i].name} 
                      fill 
                      quality={95} 
                      className="object-cover object-top transition-transform duration-1000 group-hover:scale-105" 
                    />
                  </div>
                  
                  {/* Content Card - Bottom Half (Solid White for perfect readability) */}
                  <div className="relative z-10 flex flex-col p-6 lg:p-8 bg-white border-t border-navy/5 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
                    <div className="absolute -top-5 left-6 lg:left-8 rounded-full border border-gold-500/30 bg-gold-100 px-4 py-1.5 text-xs font-bold tracking-wide text-gold-700 shadow-md">
                      <Trophy className="inline h-3.5 w-3.5 mr-1 -mt-0.5" /> {toppers[i].tag}
                    </div>
                    <div className="pt-2">
                      <h3 className="font-display text-2xl lg:text-3xl font-extrabold text-navy drop-shadow-sm">{toppers[i].name}</h3>
                      <p className="text-sm font-medium text-navy/60 mb-2">{toppers[i].roll}</p>
                      <div className="flex items-center justify-between">
                        <p className="font-display text-2xl lg:text-3xl font-extrabold text-gold-600 drop-shadow-sm">{toppers[i].package}</p>
                        <p className="text-xs font-semibold text-navy/50 uppercase tracking-wide text-right">
                          <span className="block text-[10px] opacity-70">Placed at</span>
                          {toppers[i].recruiter}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* ----- PHASE 3: CASCADING RECRUITERS & ECOSYSTEM ----- */}
          <motion.div 
            style={{ opacity: p3ContainerOpacity, y: p3Y }}
            className="absolute w-[95%] max-w-6xl pointer-events-auto z-20 flex flex-col gap-6 lg:gap-8 lg:flex-row"
          >
            {/* Cascading Recruiter Grid */}
            <div className="flex-1 flex flex-col rounded-[2.5rem] border border-navy/10 bg-white/90 p-6 lg:p-10 backdrop-blur-xl shadow-2xl relative overflow-hidden h-[450px] lg:h-[500px]">
              <div className="absolute -top-40 -right-40 w-96 h-96 bg-gold-500/10 blur-[100px] rounded-full pointer-events-none" />
              <h3 className="flex items-center gap-3 text-xl lg:text-2xl font-display font-extrabold text-navy mb-6 shrink-0 drop-shadow-sm">
                <BadgeCheck className="h-7 w-7 lg:h-8 lg:w-8 text-gold-500" /> Elite Placements
              </h3>
              
              {/* Scrollable list to prevent overflowing the container */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {recruiterOffers.map((r, i) => (
                  <div key={r.company} className="group relative flex items-center gap-4 lg:gap-5 overflow-hidden rounded-2xl border border-navy/5 bg-navy/[0.01] p-3 lg:p-4 transition-all hover:border-gold-500/30 hover:bg-gold-50 hover:-translate-y-1 hover:shadow-md cursor-default">
                    {/* Replaced broken clearbit logos with premium animated icons */}
                    <div className="flex h-12 w-12 lg:h-14 lg:w-14 shrink-0 items-center justify-center rounded-xl bg-surface-light text-navy/40 shadow-inner border border-navy/5 group-hover:bg-gold-500 group-hover:text-white group-hover:border-gold-600 transition-colors duration-500">
                      <Building2 className="h-5 w-5 lg:h-6 lg:w-6 transition-transform duration-500 group-hover:scale-110" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-base lg:text-lg font-bold text-navy group-hover:text-navy/90 transition-colors">{r.company}</div>
                      <div className="mt-0.5 font-display text-lg lg:text-xl font-extrabold text-gold-600 drop-shadow-sm">{r.pkg}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gold-500 opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 mr-2" />
                  </div>
                ))}
              </div>
            </div>

            {/* Glowing Career Nodes */}
            <div className="flex-1 flex flex-col rounded-[2.5rem] border border-navy/10 bg-white/90 p-6 lg:p-10 backdrop-blur-xl shadow-2xl relative overflow-hidden h-[450px] lg:h-[500px]">
              <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />
              <h3 className="flex items-center gap-3 text-xl lg:text-2xl font-display font-extrabold text-navy mb-8 shrink-0 drop-shadow-sm">
                <Target className="h-7 w-7 lg:h-8 lg:w-8 text-gold-500" /> Career Ecosystem
              </h3>
              
              <div className="relative flex-1 flex flex-col justify-between before:absolute before:inset-y-0 before:left-[1.35rem] lg:before:left-[1.65rem] before:w-px before:bg-gradient-to-b before:from-gold-500/30 before:to-transparent">
                {careerSteps.map((c, i) => {
                  const Icon = careerIcons[i];
                  return (
                    <div key={c.no} className="relative flex gap-4 lg:gap-6 group">
                      <div className="relative flex h-12 w-12 lg:h-14 lg:w-14 shrink-0 items-center justify-center rounded-2xl bg-white border border-gold-500/30 text-gold-600 shadow-sm transition-all duration-500 group-hover:bg-gold-500 group-hover:text-white group-hover:border-gold-600 group-hover:shadow-[0_0_20px_rgba(245,184,0,0.3)] z-10">
                        <Icon className="h-5 w-5 lg:h-6 lg:w-6 transition-transform duration-500 group-hover:scale-110" />
                      </div>
                      <div className="min-w-0 pt-0.5 lg:pt-1">
                        <span className="font-display text-[9px] lg:text-[10px] font-extrabold tracking-widest text-gold-600 uppercase">{c.no}</span>
                        <p className="mt-0.5 lg:mt-1 font-display text-xl lg:text-2xl font-bold text-navy drop-shadow-sm group-hover:text-gold-600 transition-colors">{c.title}</p>
                        <p className="mt-1 lg:mt-2 text-sm lg:text-base leading-relaxed text-navy/60 group-hover:text-navy/80 transition-colors line-clamp-2">{c.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>

          {/* ----- PHASE 4: NETWORK & CTA ----- */}
          <motion.div 
            style={{ opacity: ctaOpacity, y: ctaY }}
            className="absolute w-[90%] pointer-events-auto z-30 flex flex-col items-center justify-center text-center mt-32"
          >
            <span className="text-sm font-bold text-navy/50 uppercase tracking-widest mb-6">Connected With</span>
            <div className="flex flex-wrap justify-center gap-2 lg:gap-3 max-w-4xl">
              {topRecruiters.map((r) => (
                <span key={r} className="rounded-xl border border-navy/10 bg-white/90 backdrop-blur-md px-5 lg:px-6 py-2 lg:py-3 text-xs lg:text-sm font-semibold text-navy shadow-md transition-all hover:-translate-y-1 hover:border-gold-300 hover:bg-gold-50 hover:text-gold-700 ring-1 ring-black/5">
                  {r}
                </span>
              ))}
            </div>
            <Link href="/placements-cell" className="btn group mt-10 lg:mt-14 bg-navy text-white shadow-[0_0_40px_rgba(11,11,12,0.2)] hover:bg-navy/90 hover:-translate-y-1 px-8 lg:px-10 py-4 lg:py-5 text-lg lg:text-xl font-extrabold transition-all duration-300 rounded-[1.5rem]">
              Explore Placements Cell <ArrowRight className="h-5 w-5 lg:h-6 lg:w-6 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
          
        </div>
      </div>
    </section>
  );
}
