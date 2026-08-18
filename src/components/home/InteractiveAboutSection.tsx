"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useTransform, useSpring } from "motion/react";
import { ArrowRight } from "@/components/ui/icons";
import { A, aboutBlurb, glance } from "@/data/home-content";
import { CountUp } from "@/components/motion/Primitives";

export function InteractiveAboutSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const smoothScroll = useSpring(scrollYProgress, {
    stiffness: 70,
    damping: 25,
    restDelta: 0.001,
  });

  // Background Image Scale and Dimming
  const bgScale = useTransform(smoothScroll, [0, 1], [1, 1.15]);
  const overlayOpacity = useTransform(smoothScroll, [0, 0.3, 0.8], [0.3, 0.7, 0.85]);

  // Phase 1: Intro Text (0.1 to 0.4)
  const introOpacity = useTransform(smoothScroll, [0.05, 0.15, 0.35, 0.45], [0, 1, 1, 0]);
  const introY = useTransform(smoothScroll, [0.05, 0.15, 0.35, 0.45], [100, 0, -20, -100]);

  // Phase 2: Stats Grid (0.45 to 0.8)
  const statsContainerOpacity = useTransform(smoothScroll, [0.4, 0.5, 0.85, 0.95], [0, 1, 1, 0]);
  
  // Staggered Stats
  const stat1Y = useTransform(smoothScroll, [0.4, 0.5], [100, 0]);
  const stat2Y = useTransform(smoothScroll, [0.45, 0.55], [100, 0]);
  const stat3Y = useTransform(smoothScroll, [0.5, 0.6], [100, 0]);
  const stat4Y = useTransform(smoothScroll, [0.55, 0.65], [100, 0]);

  // Phase 3: CTA (0.8 to 1.0)
  const ctaOpacity = useTransform(smoothScroll, [0.85, 0.95], [0, 1]);
  const ctaY = useTransform(smoothScroll, [0.85, 0.95], [50, 0]);

  return (
    <section ref={sectionRef} className="relative bg-navy text-white h-[400vh]">
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        
        {/* Full-bleed cinematic background image */}
        <motion.div style={{ scale: bgScale }} className="absolute inset-0 w-full h-full">
          <Image
            src={A.about}
            alt="BVCITS Campus"
            fill
            quality={95}
            className="object-cover"
            priority
          />
        </motion.div>

        {/* Dynamic Dark Overlay */}
        <motion.div 
          style={{ opacity: overlayOpacity }} 
          className="absolute inset-0 bg-black mix-blend-multiply"
        />
        
        {/* Cinematic Ambient Gold Glow */}
        <div aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none mix-blend-screen opacity-50">
          <div className="w-[800px] h-[800px] bg-gold-600/20 rounded-full blur-[150px]" />
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 sm:p-12 lg:p-24 overflow-hidden">
          
          {/* ----- PHASE 1: INTRO TEXT ----- */}
          <motion.div 
            style={{ opacity: introOpacity, y: introY }}
            className="absolute max-w-5xl text-center pointer-events-none z-10"
          >
            <p className="eyebrow text-gold-400 mb-6 drop-shadow-md">About BVCITS</p>
            <h2 className="font-display text-5xl font-extrabold tracking-tight text-white md:text-[5rem] leading-[1.1] drop-shadow-2xl">
              Shaping confident engineers,<br/>innovators and future leaders.
            </h2>
            <p className="mt-8 text-xl md:text-2xl leading-relaxed text-white/90 drop-shadow-lg font-medium max-w-4xl mx-auto">
              {aboutBlurb}
            </p>
          </motion.div>

          {/* ----- PHASE 2: GLOWING STATS GRID ----- */}
          <motion.div 
            style={{ opacity: statsContainerOpacity }}
            className="absolute w-full max-w-5xl pointer-events-auto z-20 grid grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {[stat1Y, stat2Y, stat3Y, stat4Y].map((yTransform, i) => (
              <motion.div 
                key={glance[i].label}
                style={{ y: yTransform }}
                className="flex flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-black/40 p-8 backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] ring-1 ring-white/10 transition-transform hover:-translate-y-2 hover:border-gold-500/50 hover:bg-black/60 group"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-gold-500/10 to-transparent mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="font-display text-5xl font-extrabold leading-none text-white drop-shadow-lg z-10">
                  <CountUp value={glance[i].v} />
                  <span className="text-gold-400 ml-1">{glance[i].suffix}</span>
                </div>
                <div className="mt-4 text-sm font-semibold tracking-wider uppercase text-white/70 text-center z-10 group-hover:text-white transition-colors">{glance[i].label}</div>
              </motion.div>
            ))}
          </motion.div>

          {/* ----- PHASE 3: CTA ----- */}
          <motion.div 
            style={{ opacity: ctaOpacity, y: ctaY }}
            className="absolute w-full pointer-events-auto z-30 flex flex-col items-center justify-center text-center mt-32"
          >
            <Link href="/about-us" className="btn group mt-14 bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:bg-gold-500 hover:border-gold-400 hover:-translate-y-1 hover:text-navy px-10 py-5 text-xl font-extrabold transition-all duration-300 rounded-[1.5rem]">
              Explore the institution <ArrowRight className="h-6 w-6 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
