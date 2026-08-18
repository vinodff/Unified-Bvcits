"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, useSpring } from "motion/react";
import { ArrowRight } from "@/components/ui/icons";
import { portals } from "@/data/portals";

export function InteractivePortalsSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  // Use a longer section height since there are many portals to scroll through
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const smoothScroll = useSpring(scrollYProgress, {
    stiffness: 60,
    damping: 20,
    restDelta: 0.001,
  });

  // Background Split Wipe (Wipes the white background from right to left)
  const splitWidth = useTransform(smoothScroll, [0, 0.2], ["0%", "50%"]);

  // Header transform (Starts centered, scales down and moves to the left)
  const headerX = useTransform(smoothScroll, [0.05, 0.2], ["50%", "0%"]);
  const headerScale = useTransform(smoothScroll, [0.05, 0.2], [1.2, 1]);
  const headerOpacity = useTransform(smoothScroll, [0, 0.1], [0, 1]);

  // The entire grid on the right scrolls up as you scrub down the 400vh section.
  // It starts below the screen ("50vh") and scrolls way past the top ("-150vh") to show all 10 cards.
  const gridY = useTransform(smoothScroll, [0.1, 1], ["50vh", "-150vh"]);

  return (
    <section ref={sectionRef} className="relative bg-navy text-white h-[400vh]">
      <div className="sticky top-0 h-screen w-full overflow-hidden flex">
        
        {/* Dynamic Split Background */}
        <motion.div 
          style={{ width: splitWidth }}
          className="absolute right-0 top-0 h-full bg-surface-light origin-right z-0"
        />

        <div className="container-page relative z-10 flex h-full items-center w-full">
          
          {/* ----- LEFT: HEADER ----- */}
          <motion.div 
            style={{ x: headerX, scale: headerScale, opacity: headerOpacity }}
            className="w-1/2 pr-12 origin-left flex flex-col justify-center"
          >
            <p className="eyebrow text-gold-500 mb-6 tracking-[0.2em] uppercase font-bold">One platform, every stakeholder</p>
            <h2 className="font-display text-5xl font-extrabold tracking-tight text-white md:text-[5.5rem] leading-[1.05] drop-shadow-lg">
              Tell us who<br/>you are.
            </h2>
            <p className="mt-8 text-xl leading-relaxed text-white/70 max-w-lg font-medium">
              Every audience gets its own entry point — the forms, records and contacts that actually matter to you, without wading through the rest of the institute.
            </p>
            <div className="mt-12">
              <Link href="/sitemap" className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/10 hover:border-gold-500 transition-all">
                Browse the full site index <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>

          {/* ----- RIGHT: CARDS GRID SCROLL ----- */}
          <div className="w-1/2 pl-12 h-full overflow-hidden">
            <motion.div style={{ y: gridY }} className="grid grid-cols-2 gap-6 w-full max-w-2xl py-32">
              {portals.map((p) => (
                <Link key={p.slug} href={`/${p.slug}`} className="block h-full group">
                  <div className="flex h-full min-h-[300px] flex-col justify-between rounded-[2rem] border border-black/5 bg-white p-8 shadow-[0_20px_40px_rgba(0,0,0,0.05)] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_30px_60px_rgba(245,184,0,0.15)] ring-1 ring-black/5">
                    <div>
                      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-form text-navy shadow-inner transition-colors duration-500 group-hover:bg-gold-500 group-hover:text-white">
                        <p.icon className="h-6 w-6" />
                      </span>
                      <h3 className="mt-8 font-display text-2xl font-extrabold text-navy">{p.navLabel}</h3>
                      <p className="mt-3 text-base leading-relaxed text-ink-soft">{p.summary}</p>
                    </div>
                    <div className="mt-8 flex items-center gap-2 font-display text-sm font-bold text-gold-500 uppercase tracking-widest transition-colors group-hover:text-gold-600">
                      Open Portal <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-2" />
                    </div>
                  </div>
                </Link>
              ))}
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}
