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
import { BtechGrid } from "@/components/home/BtechGrid";
import HomeHeroScene from "@/components/home/HomeHeroScene";
import { PlacementsRadials } from "@/components/home/PlacementsRadials";
import { CampusGallery } from "@/components/home/CampusGallery";
import {
  A, aboutBlurb, accreditations, btechBranches, careerSteps, glance,
  instituteHighlights, notices, placementStats,
  programGroups, recognitions, recruiterOffers, topRecruiters, toppers, whyPillars,
} from "@/data/home-content";
import { portals } from "@/data/portals";

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

      {/* ---------- AUDIENCE ROUTER ----------
          The front door of a multi-stakeholder platform: eight different groups
          arrive here wanting eight different things, so the first real section
          asks who you are instead of making everyone hunt the same mega-menu. */}
      <section className="section bg-surface-light">
        <div className="container-page">
          <div className="max-w-2xl">
            <Reveal><p className="eyebrow">One platform, every stakeholder</p></Reveal>
            <TextReveal
              text="Tell us who you are."
              className="mt-3 font-display text-3xl font-extrabold tracking-[-0.015em] text-navy md:text-[2.5rem]"
            />
            <Reveal delay={0.15}>
              <p className="mt-5 max-w-prose text-ink-soft">
                Every audience gets its own entry point — the forms, records and contacts that
                actually matter to you, without wading through the rest of the institute.
              </p>
            </Reveal>
          </div>

          <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" gap={0.07}>
            {portals.map((p, i) => (
              <StaggerItem key={p.slug} className={i === 0 ? "sm:col-span-2" : undefined}>
                <Link href={`/${p.slug}`} className="block h-full">
                  <SpotlightCard
                    className={`flex h-full flex-col rounded-2xl border p-6 shadow-card transition-colors ${
                      i === 0
                        ? "border-gold/30 bg-gradient-to-br from-gold-50 to-white hover:border-gold"
                        : "border-surface-border bg-white hover:border-crimson/25"
                    }`}
                  >
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                        i === 0 ? "bg-gold text-black" : "bg-crimson-50 text-crimson"
                      }`}
                    >
                      <p.icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-5 font-display text-lg font-extrabold text-navy">{p.navLabel}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">{p.summary}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-crimson">
                      Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </SpotlightCard>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal>
            <Magnetic strength={0.2}>
              <Link href="/others" className="btn-outline group mt-10">
                Browse the full site index
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Magnetic>
          </Reveal>
        </div>
      </section>

      {/* ---------- ABOUT + At a glance ---------- */}
      <section className="section relative overflow-hidden bg-white">
        <div className="container-page grid items-center gap-14 lg:grid-cols-2">
          <ClipReveal className="rounded-[1.75rem]">
            <Parallax amount={22}>
              <ZoomFrame className="relative aspect-[4/3] rounded-[1.75rem] shadow-lift">
                <Image
                  src={A.about}
                  alt="BVCITS students on campus"
                  fill
                  quality={88}
                  sizes="(min-width:1024px) 46vw, 92vw"
                  className="object-cover"
                />
              </ZoomFrame>
            </Parallax>
          </ClipReveal>

          <div>
            <Reveal><p className="eyebrow">About BVCITS</p></Reveal>
            <TextReveal
              text="Shaping confident engineers, innovators and future leaders."
              className="mt-3 max-w-[18ch] font-display text-3xl font-extrabold leading-[1.1] tracking-[-0.015em] text-navy md:text-[2.5rem]"
            />
            <Reveal delay={0.15}>
              <p className="mt-6 max-w-prose leading-relaxed text-ink-soft">{aboutBlurb}</p>
            </Reveal>
            <Stagger className="mt-9 grid grid-cols-2 gap-4" gap={0.09}>
              {glance.map((g) => (
                <StaggerItem key={g.label}>
                  <SpotlightCard className="h-full rounded-2xl border border-surface-border bg-surface-light p-6">
                    <div className="font-display text-3xl font-extrabold leading-none text-navy">
                      <CountUp value={g.v} />
                      <span className="text-gold-500">{g.suffix}</span>
                    </div>
                    <div className="mt-2 text-sm text-ink-soft">{g.label}</div>
                  </SpotlightCard>
                </StaggerItem>
              ))}
            </Stagger>
            <Reveal delay={0.2}>
              <Magnetic strength={0.2}>
                <Link href="/about-us" className="btn-outline group mt-9">
                  Explore the institution
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Magnetic>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------- Career-ready learning ecosystem ---------- */}
      <section className="section bg-surface-light">
        <div className="container-page">
          <div className="max-w-2xl">
            <Reveal><p className="eyebrow">Career-ready learning ecosystem</p></Reveal>
            <TextReveal text="What makes BVCITS different" className="mt-3 font-display text-3xl font-extrabold tracking-[-0.015em] text-navy md:text-[2.5rem]" />
          </div>
          <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" gap={0.1}>
            {whyPillars.map((p, i) => {
              const Icon = pillarIcons[i];
              return (
                <StaggerItem key={p.title}>
                  <SpotlightCard className="flex h-full flex-col rounded-2xl border border-surface-border bg-white p-7 shadow-card">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-50 text-gold-600 transition-colors group-hover:bg-gold group-hover:text-black">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="mt-5 font-display text-xs font-extrabold tracking-[0.2em] text-gold-500">0{i + 1}</span>
                    <h3 className="mt-1.5 text-lg">{p.title}</h3>
                    <p className="mt-2.5 flex-1 text-sm leading-relaxed text-ink-soft">{p.body}</p>
                    <span className="mt-5 block h-px w-full origin-left scale-x-0 bg-gradient-to-r from-crimson to-gold-400 transition-transform duration-500 group-hover:scale-x-100" />
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

      {/* ---------- PLACEMENTS ---------- */}
      <section className="section relative overflow-hidden bg-navy text-white">
        <div aria-hidden className="pointer-events-none absolute -right-40 top-1/4 h-[30rem] w-[30rem] rounded-full bg-crimson/20 blur-[130px]" />
        <div aria-hidden className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
        <div className="container-page relative">
          <div className="max-w-2xl">
            <Reveal><p className="eyebrow text-gold-300">2026 Placement Highlights</p></Reveal>
            <TextReveal text="Strong placements. Clear career direction." className="mt-3 font-display text-3xl font-extrabold leading-[1.1] tracking-[-0.015em] text-white md:text-[2.5rem]" />
            <Reveal delay={0.15}>
              <p className="mt-5 max-w-prose text-white/70">
                Celebrating BVCITS placement success with strong recruiter offers, guided career support, and industry-ready student talent.
              </p>
            </Reveal>
          </div>

          <PlacementsRadials stats={placementStats} />

          {/* Toppers — real photos, real names */}
          <Stagger className="mt-14 grid gap-6 md:grid-cols-2" gap={0.14}>
            {toppers.map((t) => (
              <StaggerItem key={t.name}>
                <SpotlightCard tint="245,184,0" className="flex items-center gap-5 rounded-[1.5rem] border border-white/10 bg-white/[0.07] p-6 backdrop-blur-md">
                  <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-xl ring-2 ring-gold-400/40">
                    <Image src={t.img} alt={t.name} fill quality={90} sizes="112px" className="object-cover object-top transition-transform duration-500 group-hover:scale-105" />
                  </div>
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold-400 px-2.5 py-0.5 text-[11px] font-bold text-navy">
                      <Trophy className="h-3 w-3" /> {t.tag}
                    </span>
                    <p className="mt-2 font-display text-lg font-extrabold text-white">{t.name}</p>
                    <p className="text-xs text-white/55">{t.roll}</p>
                    <p className="mt-1.5 font-display text-xl font-extrabold text-gold-300">{t.package}</p>
                    <p className="text-xs text-white/65">Top Recruiter · {t.recruiter}</p>
                  </div>
                </SpotlightCard>
              </StaggerItem>
            ))}
          </Stagger>

          <div className="mt-14 grid gap-10 lg:grid-cols-2">
            <Reveal direction="right">
              <h3 className="flex items-center gap-2 text-white">
                <BadgeCheck className="h-5 w-5 text-gold-300" /> More Recruiter Offers
              </h3>
              <ul className="mt-5">
                {recruiterOffers.map((r, i) => (
                  <li key={r.company} className="group/row flex items-center justify-between border-b border-white/10 py-3 text-sm transition-colors hover:border-gold-400/40">
                    <span className="flex items-center gap-3">
                      <span className="font-display text-[11px] text-white/35">{String(i + 1).padStart(2, "0")}</span>
                      <span className="font-medium text-white/90 transition-transform duration-300 group-hover/row:translate-x-1">{r.company}</span>
                    </span>
                    <span className="font-display font-semibold text-gold-300">{r.pkg}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal direction="left" delay={0.1}>
              <h3 className="flex items-center gap-2 text-white">
                <Target className="h-5 w-5 text-gold-300" /> Career Support
              </h3>
              <Stagger className="mt-5 space-y-3" gap={0.09}>
                {careerSteps.map((c, i) => {
                  const Icon = careerIcons[i];
                  return (
                    <StaggerItem key={c.no}>
                      <SpotlightCard tint="245,184,0" className="flex gap-4 rounded-2xl border border-white/5 bg-white/[0.05] p-5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-400/15 text-gold-300">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="font-display text-xs font-extrabold tracking-widest text-gold-300">{c.no}</span>
                          <p className="font-display font-bold text-white">{c.title}</p>
                          <p className="mt-1.5 text-sm leading-relaxed text-white/65">{c.body}</p>
                        </span>
                      </SpotlightCard>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            </Reveal>
          </div>

          <Reveal>
            <div className="mt-12 flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-white/50">Top Recruiters:</span>
              {topRecruiters.map((r) => (
                <span key={r} className="rounded-lg border border-white/10 bg-white/[0.07] px-4 py-2 text-sm font-semibold text-white/85 transition-all hover:-translate-y-0.5 hover:border-gold-400/50 hover:text-gold-200">
                  {r}
                </span>
              ))}
            </div>
            <Magnetic>
              <Link href="/placements-cell" className="btn-primary group mt-9 shadow-lg shadow-gold/25">
                Explore Placements <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Magnetic>
          </Reveal>
        </div>
      </section>

      {/* ---------- CAMPUS LIFE (bento, aspect-driven) ---------- */}
      <section className="section bg-white">
        <div className="container-page">
          <div className="max-w-2xl">
            <Reveal><p className="eyebrow">Campus Life</p></Reveal>
            <TextReveal text="Not Just Confined To Classrooms" className="mt-3 font-display text-3xl font-extrabold tracking-[-0.015em] text-navy md:text-[2.5rem]" />
            <Reveal delay={0.15}><p className="mt-5 text-ink-soft">Experience campus beyond classrooms.</p></Reveal>
          </div>

          <ClipReveal className="mt-12">
            <CampusGallery images={A.gallery} />
          </ClipReveal>

          <Reveal>
            <Magnetic strength={0.2}>
              <Link href="/campus-life" className="btn-outline group mt-10">
                Explore Campus Life
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Magnetic>
          </Reveal>
        </div>
      </section>

      {/* ---------- Institution highlights ---------- */}
      <section className="section bg-surface-light">
        <div className="container-page">
          <Reveal><p className="eyebrow">Institution Highlights</p></Reveal>
          <TextReveal text="Autonomous · NAAC 'A' Grade · BVTS" className="mt-3 font-display text-2xl font-extrabold tracking-[-0.015em] text-navy md:text-[2rem]" />
          <Stagger className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4" gap={0.09}>
            {instituteHighlights.map((h, i) => {
              const Icon = statIcons[i];
              return (
                <StaggerItem key={h.label}>
                  <SpotlightCard className="h-full rounded-2xl border border-surface-border bg-white p-7 text-center shadow-card">
                    <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gold-50 text-gold-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <CountUp value={h.v} className="mt-4 block font-display text-2xl font-extrabold leading-none text-navy md:text-[1.75rem]" />
                    <div className="mt-2 text-sm text-ink-soft">{h.label}</div>
                  </SpotlightCard>
                </StaggerItem>
              );
            })}
          </Stagger>
          <Reveal>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-ink-muted">Recognitions:</span>
              {recognitions.map((r) => (
                <span key={r} className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-white px-4 py-2 text-sm font-semibold text-navy transition-all hover:-translate-y-0.5 hover:border-crimson/40 hover:text-crimson">
                  <BadgeCheck className="h-4 w-4 text-gold-500" /> {r}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="relative overflow-hidden bg-navy">
        <div aria-hidden className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-gold-400/25 blur-[90px] motion-safe:animate-drift" />
        <div aria-hidden className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="container-page relative flex flex-col items-center justify-between gap-7 py-14 text-center md:flex-row md:text-left">
          <Reveal direction="right">
            <h2 className="font-display text-2xl font-extrabold text-white md:text-[2rem]">Admissions Open 2026–27</h2>
            <p className="mt-2 text-white/85">Start your journey with BVCITS Amalapuram.</p>
          </Reveal>
          <Reveal direction="left" delay={0.1}>
            <div className="flex flex-wrap justify-center gap-3">
              <Magnetic>
                <Link href={site.applyUrl} className="btn-primary group shadow-lg shadow-gold/25">
                  Apply for Admissions
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Magnetic>
              <Magnetic strength={0.25}>
                <Link href="/contact-us" className="btn border border-white/60 text-white hover:bg-white/10">Contact Us</Link>
              </Magnetic>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
