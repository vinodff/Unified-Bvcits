"use client";

import Image from "next/image";
import Link from "next/link";
import { site } from "@/lib/site";
import {
  ArrowRight, Award, BadgeCheck, Bell, BookOpen, Building2,
  GraduationCap, Handshake, Leaf, Rocket, Target, TrendingUp, Trophy,
  UserCheck, Users, Wrench,
} from "@/components/ui/icons";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { ClipReveal, CountUp, Magnetic, Parallax, SpotlightCard, TextReveal, ZoomFrame } from "@/components/motion/Primitives";
import { TiltCard } from "@/components/motion/TiltCard";
import CustomCursor from "@/components/motion/CustomCursor";
import { useScroll } from "motion/react";
import { BtechGrid } from "@/components/home/BtechGrid";
import HomeHeroScene from "@/components/home/HomeHeroScene";
import { InteractivePlacementsSection } from "@/components/home/InteractivePlacementsSection";
import { InteractiveCampusGallery } from "@/components/home/InteractiveCampusGallery";
import { InteractivePortalsSection } from "@/components/home/InteractivePortalsSection";
import { InteractiveAboutSection } from "@/components/home/InteractiveAboutSection";
import {
  A, accreditations, btechBranches, careerSteps,
  instituteHighlights, notices, placementStats,
  programGroups, recognitions, recruiterOffers, topRecruiters, toppers, whyPillars,
} from "@/data/home-content";

/* Icon maps — keep data files free of JSX. */
const pillarIcons = [BookOpen, TrendingUp, Rocket, Leaf];
const programIcons = [GraduationCap, BookOpen, Award, Wrench];
const careerIcons = [Target, Handshake, UserCheck];
const statIcons = [Trophy, Building2, TrendingUp, Users];

export default function HomePage() {
  
  return (
    <>
      <CustomCursor />

      {/* ---------- Notifications ticker ---------- */}
      <div className="flex items-stretch overflow-hidden border-b border-surface-border bg-surface-light">
        <span className="z-10 flex shrink-0 items-center gap-2 bg-gold px-4 font-display text-xs font-bold uppercase tracking-wider text-black">
          <Bell className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Notifications</span>
        </span>
        <div className="flex overflow-hidden py-2.5">
          <div className="flex animate-marquee whitespace-nowrap">
            {[...notices, ...notices].map((t, i) => (
              <span key={i} className="mx-8 text-sm text-navy">• {t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- HERO (layered parallax scene) ---------- */}
      <HomeHeroScene />

      {/* ---------- PLACEMENTS (Global Network) ---------- */}
      <InteractivePlacementsSection />

      {/* ---------- Accreditation badges (small plates: sources are low-res) ---------- */}
      <section className="border-b border-surface-border bg-white py-10">
        <Stagger className="container-page grid grid-cols-2 items-stretch gap-4 md:grid-cols-4" gap={0.07}>
          {accreditations.map((a) => (
            <StaggerItem key={a.label}>
              <div className="flex h-full items-center gap-3 rounded-2xl border border-surface-border bg-surface-light px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:border-crimson/25 hover:bg-white">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                  <Image src={a.src} alt={a.alt} width={112} height={112} quality={95} className="h-9 w-9 object-contain" />
                </span>
                <span className="text-[13px] font-semibold leading-tight text-ink-soft">{a.label}</span>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>


      {/* ---------- ABOUT + At a glance ---------- */}
      <InteractiveAboutSection />

      {/* ---------- Career-ready learning ecosystem ---------- */}
      <section className="section bg-surface-light">
        <div className="container-page">
          <div className="max-w-2xl">
            <Reveal><p className="eyebrow text-gold-600">Career-ready learning ecosystem</p></Reveal>
            <TextReveal text="What makes BVCITS different" className="mt-3 font-display text-3xl font-extrabold tracking-tight text-navy md:text-[2.5rem]" />
          </div>
          <Stagger className="mt-12 grid gap-5 grid-cols-1 md:grid-cols-3 lg:grid-cols-4" gap={0.1}>
            {whyPillars.map((p, i) => {
              const Icon = pillarIcons[i];
              // Bento Box Grid Logic
              const bentoClasses = 
                i === 0 ? "md:col-span-2 md:row-span-2" :
                i === 1 ? "md:col-span-1 lg:col-span-2" :
                "md:col-span-1 lg:col-span-1";

              return (
                <StaggerItem key={p.title} className={bentoClasses}>
                  <SpotlightCard className={`group flex h-full flex-col rounded-[1.5rem] border border-surface-border bg-white p-8 shadow-card transition-all duration-300 hover:border-gold-500/40 hover:shadow-2xl hover:shadow-gold-500/10 ${i === 0 ? 'justify-between' : ''}`}>
                    <div>
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-form text-navy transition-colors duration-300 group-hover:bg-gold-500 group-hover:text-white">
                        <Icon className="h-6 w-6" />
                      </span>
                      <span className="mt-6 block font-display text-xs font-extrabold tracking-[0.2em] text-gold-500">0{i + 1}</span>
                      <h3 className={`mt-2 font-display font-bold text-navy ${i === 0 ? 'text-2xl md:text-3xl max-w-sm' : 'text-lg'}`}>{p.title}</h3>
                      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{p.body}</p>
                    </div>
                    {i === 0 && (
                       <div className="mt-8 flex justify-end">
                         {/* Hardware-like LED decorative elements */}
                         <div className="flex gap-1.5 items-center">
                           <span className="block h-1 w-6 rounded-full bg-surface-border transition-colors group-hover:bg-gold-200" />
                           <span className="block h-1.5 w-1.5 rounded-full bg-surface-border transition-colors group-hover:bg-gold-500" />
                         </div>
                       </div>
                    )}
                  </SpotlightCard>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </section>

      {/* ---------- PROGRAMMES ---------- */}
      <section className="section bg-white">
        <div className="container-page">
          <div className="max-w-2xl">
            <Reveal><p className="eyebrow">Programmes</p></Reveal>
            <TextReveal text="Find the programme that fits your ambition." className="mt-3 font-display text-3xl font-extrabold leading-[1.1] tracking-[-0.015em] text-navy md:text-[2.5rem]" />
            <Reveal delay={0.15}>
              <p className="mt-5 max-w-prose text-ink-soft">
                Explore future-focused programmes across engineering, diploma, degree and postgraduate education,
                designed to help students build skills, confidence and career direction.
              </p>
            </Reveal>
          </div>

          <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" gap={0.09}>
            {programGroups.map((g, i) => {
              const Icon = programIcons[i];
              return (
                <StaggerItem key={g.no}>
                  <TiltCard className="h-full rounded-2xl border border-surface-border bg-surface-light shadow-card">
                    <div className="p-7">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-crimson shadow-sm">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="mt-5 block font-display text-xs font-extrabold tracking-[0.2em] text-crimson">{g.no}</span>
                      <h3 className="mt-1.5 text-xl">{g.title}</h3>
                      <p className="mt-1.5 text-sm text-ink-soft">{g.sub}</p>
                    </div>
                  </TiltCard>
                </StaggerItem>
              );
            })}
          </Stagger>

          <Reveal>
            <h3 className="mt-16 text-xl">B.Tech Programmes</h3>
            <p className="mt-1.5 max-w-prose text-sm text-ink-soft">
              Four-year engineering programmes with strong fundamentals, practical learning and industry-oriented career preparation.
            </p>
          </Reveal>
          <BtechGrid branches={btechBranches} />
        </div>
      </section>

      {/* ---------- PORTALS ---------- */}
      <InteractivePortalsSection />

      {/* ---------- CAMPUS LIFE (Interactive Parallax Gallery) ---------- */}
      <InteractiveCampusGallery images={A.gallery} />

      {/* ---------- Institution highlights ---------- */}
      <section className="section relative overflow-hidden bg-navy text-white">
        <div aria-hidden className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-gold-500/10 blur-[120px]" />
        
        <div className="container-page relative z-10">
          <Reveal><p className="eyebrow text-gold-400">Institution Highlights</p></Reveal>
          <TextReveal text="Autonomous · NAAC 'A' Grade · BVTS" className="mt-3 font-display text-2xl font-extrabold tracking-tight text-white md:text-[2rem]" />
          
          <Stagger className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-4" gap={0.09}>
            {instituteHighlights.map((h, i) => {
              const Icon = statIcons[i];
              return (
                <StaggerItem key={h.label}>
                  <SpotlightCard tint="245,184,0" className="h-full flex flex-col items-center justify-center rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-7 text-center backdrop-blur-md transition-all hover:border-gold-500/40 hover:-translate-y-1 hover:shadow-xl hover:shadow-gold-500/5">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gold-500/10 text-gold-400 border border-gold-500/20">
                      <Icon className="h-6 w-6" />
                    </span>
                    <CountUp value={h.v} className="mt-5 block font-display text-3xl font-extrabold leading-none text-white md:text-[2rem]" />
                    <div className="mt-2 text-sm font-medium text-white/60">{h.label}</div>
                  </SpotlightCard>
                </StaggerItem>
              );
            })}
          </Stagger>
          
          <Reveal>
            <div className="mt-12 flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold uppercase tracking-wider text-white/40 mr-2">Recognitions:</span>
              {recognitions.map((r) => (
                <span key={r} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/80 transition-all hover:-translate-y-0.5 hover:border-gold-400/50 hover:bg-white/[0.08] hover:text-white">
                  <BadgeCheck className="h-4 w-4 text-gold-400" /> {r}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- MEGA-CTA ---------- */}
      <section className="relative overflow-hidden bg-gold-500 text-white">
        <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-gold-600 via-gold-500 to-white/30 mix-blend-overlay" />
        {/* Glows and atmospheric light */}
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-white/40 blur-[120px] motion-safe:animate-drift" />
        <div aria-hidden className="pointer-events-none absolute -left-20 -bottom-20 h-96 w-96 rounded-full bg-navy/30 blur-[120px] motion-safe:animate-drift" style={{ animationDelay: "2s" }} />
        
        <div className="container-page relative flex flex-col items-center justify-between gap-10 py-24 text-center md:flex-row md:text-left lg:py-32">
          <Reveal direction="right" className="max-w-2xl">
            <h2 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-[3.5rem] leading-[1.1] drop-shadow-sm">
              Ready to build the future?
            </h2>
            <p className="mt-5 text-lg font-medium text-white/95 drop-shadow-sm">
              Admissions Open 2026–27. Start your journey with BVCITS Amalapuram.
            </p>
          </Reveal>
          <Reveal direction="left" delay={0.1}>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Magnetic strength={0.2}>
                <Link href="/admissions" className="btn group bg-white text-gold-600 shadow-xl shadow-navy/20 hover:bg-surface-form hover:text-gold-500 hover:shadow-2xl hover:-translate-y-1 px-8 py-4 text-lg font-extrabold transition-all duration-300">
                  Apply Now <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Magnetic>
              <Magnetic strength={0.25}>
                <Link href="/contact-us" className="btn border border-white/60 text-white hover:bg-white/10 px-6 py-4">Contact Us</Link>
              </Magnetic>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
