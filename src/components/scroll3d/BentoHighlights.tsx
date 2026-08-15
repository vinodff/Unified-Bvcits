import Link from "next/link";

import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { CountUp } from "@/components/motion/Primitives";
import { ArrowRight, Award, Handshake, Leaf, TrendingUp, Trophy, Users } from "@/components/ui/icons";
import { topRecruiters } from "@/data/home-content";

/** Every figure here comes from src/data/home-content.ts. */
const TILES = [
  {
    id: "campus",
    icon: Leaf,
    value: "40",
    suffix: " acres",
    label: "Green residential campus",
    body: "Hostels, labs, library and grounds inside one walkable boundary.",
    span: "md:col-span-1",
  },
  {
    id: "faculty",
    icon: Users,
    value: "195",
    suffix: "+",
    label: "Faculty members",
    body: "Across ten departments, from Science & Humanities to AI & ML.",
    span: "md:col-span-1",
  },
  {
    id: "recruiters",
    icon: Handshake,
    value: "58",
    suffix: "+",
    label: "Top MNC recruiters",
    body: "ServiceNow, DBS Bank, Infosys, TCS, ABB, Accenture and more.",
    span: "md:col-span-1",
  },
  {
    id: "mous",
    icon: Award,
    value: "30",
    suffix: "+",
    label: "Industry MoUs",
    body: "Plus a Cisco Networking Academy and a Pearson VUE test centre.",
    span: "md:col-span-1",
  },
] as const;

export default function BentoHighlights() {
  return (
    <section className="relative px-6 py-24 md:px-8 md:py-32" style={{ background: "var(--exp-bg)" }}>
      <div className="mx-auto w-full max-w-[1400px]">
        <Reveal>
          <p className="eyebrow">By the numbers</p>
          <h2 className="mt-3 max-w-[20ch] font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-navy md:text-5xl">
            The parts of BVCITS that compound.
          </h2>
          <p className="mt-5 max-w-[55ch] leading-relaxed text-ink-soft">
            An autonomous institute with NAAC &lsquo;A&rsquo; grading and NBA accreditation — measured
            by what its graduates go on to do.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-[3fr_2fr]">
          {/* ---- Lead tile: placements ---- */}
          <Reveal direction="right">
            <article className="card-surface flex h-full flex-col justify-between p-8 md:p-10">
              <div>
                <span className="pill-surface inline-flex items-center gap-2 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-crimson">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Placements 2026
                </span>
                <div className="mt-7 flex items-baseline gap-2">
                  <CountUp
                    value="1256"
                    className="font-display text-6xl font-extrabold tracking-tighter text-navy md:text-7xl"
                  />
                  <span className="font-display text-4xl font-extrabold text-gold-500 md:text-5xl">+</span>
                </div>
                <p className="mt-2 max-w-[30ch] text-lg text-ink-soft">
                  students placed, with a highest offer of{" "}
                  <span className="font-display font-bold text-navy">₹38 lakhs per annum</span>.
                </p>
              </div>

              <div className="mt-9">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Recruiting on campus</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {topRecruiters.map((recruiter) => (
                    <span
                      key={recruiter}
                      className="pill-surface px-3.5 py-1.5 text-xs font-semibold text-navy"
                    >
                      {recruiter}
                    </span>
                  ))}
                </div>
                <Link
                  href="/placements-cell"
                  className="group mt-7 inline-flex items-center gap-2 font-display text-sm font-bold text-crimson transition-colors hover:text-crimson-700"
                >
                  See the placements dashboard
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </article>
          </Reveal>

          {/* ---- Supporting tiles ---- */}
          <Stagger className="grid gap-5 sm:grid-cols-2" gap={0.09} delay={0.1}>
            {TILES.map((tile) => {
              const Icon = tile.icon;
              return (
                <StaggerItem key={tile.id} className={tile.span}>
                  <article className="card-surface flex h-full flex-col p-7">
                    <span className="inset-surface flex h-11 w-11 items-center justify-center rounded-xl text-crimson">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="mt-5 flex items-baseline">
                      <CountUp value={tile.value} className="font-display text-3xl font-extrabold text-navy" />
                      <span className="font-display text-3xl font-extrabold text-gold-500">{tile.suffix}</span>
                    </div>
                    <p className="mt-1 font-display text-sm font-bold text-navy">{tile.label}</p>
                    <p className="mt-2 text-sm leading-relaxed text-ink-soft">{tile.body}</p>
                  </article>
                </StaggerItem>
              );
            })}

            {/* ---- Wide tile: the 38 LPA story ---- */}
            <StaggerItem className="sm:col-span-2">
              <article className="card-surface flex items-center gap-5 p-7">
                <span className="inset-surface flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-gold-500">
                  <Trophy className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-lg font-extrabold text-navy">₹38 LPA — ServiceNow</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                    K. Naga Satya Rajesh, CSE. The highest package in the 2026 cohort.
                  </p>
                </div>
              </article>
            </StaggerItem>
          </Stagger>
        </div>
      </div>
    </section>
  );
}
