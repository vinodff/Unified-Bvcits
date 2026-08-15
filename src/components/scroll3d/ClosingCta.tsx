import Link from "next/link";

import { Reveal } from "@/components/motion/Reveal";
import { Magnetic } from "@/components/motion/Primitives";
import { ArrowRight } from "@/components/ui/icons";
import { site } from "@/lib/site";

/**
 * Circuit traces feeding the centre badge. Each path is drawn twice: a dim base
 * line, then a short travelling dash on top (see `.circuit-pulse`).
 */
const TRACES = [
  { id: "t1", d: "M 40 60 H 240 Q 260 60 260 90 V 150 Q 260 170 285 170 H 470", delay: "0s" },
  { id: "t2", d: "M 40 170 H 180 Q 205 170 205 145 V 120 Q 205 100 230 100 H 470", delay: "0.9s" },
  { id: "t3", d: "M 40 280 H 210 Q 235 280 235 250 V 205 Q 235 185 260 185 H 470", delay: "1.8s" },
  { id: "t4", d: "M 960 60 H 760 Q 740 60 740 90 V 150 Q 740 170 715 170 H 530", delay: "0.45s" },
  { id: "t5", d: "M 960 170 H 820 Q 795 170 795 145 V 120 Q 795 100 770 100 H 530", delay: "1.35s" },
  { id: "t6", d: "M 960 280 H 790 Q 765 280 765 250 V 205 Q 765 185 740 185 H 530", delay: "2.25s" },
] as const;

const NODES = [
  { id: "n1", cx: 40, cy: 60 },
  { id: "n2", cx: 40, cy: 170 },
  { id: "n3", cx: 40, cy: 280 },
  { id: "n4", cx: 960, cy: 60 },
  { id: "n5", cx: 960, cy: 170 },
  { id: "n6", cx: 960, cy: 280 },
] as const;

export default function ClosingCta() {
  return (
    <section className="relative isolate overflow-hidden bg-navy-800 px-6 py-24 md:px-8 md:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-crimson/20 blur-[120px] motion-safe:animate-drift"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-0 h-[26rem] w-[26rem] rounded-full bg-gold-500/15 blur-[130px] motion-safe:animate-drift-slow"
      />

      {/* ---- Circuit backdrop ---- */}
      <svg
        aria-hidden
        viewBox="0 0 1000 340"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
      >
        {TRACES.map((trace) => (
          <g key={trace.id}>
            <path d={trace.d} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1.5" />
            <path
              d={trace.d}
              pathLength="100"
              fill="none"
              stroke="#F5B800"
              strokeWidth="2"
              strokeLinecap="round"
              className="circuit-pulse"
              style={{ animationDelay: trace.delay }}
            />
          </g>
        ))}
        {NODES.map((node) => (
          <circle key={node.id} cx={node.cx} cy={node.cy} r="3.5" fill="rgba(242,181,29,0.55)" />
        ))}
        <rect
          x="470"
          y="140"
          width="60"
          height="60"
          rx="16"
          fill="rgba(174,21,45,0.35)"
          stroke="rgba(242,181,29,0.5)"
          strokeWidth="1.5"
        />
      </svg>

      <div className="relative mx-auto flex w-full max-w-[1400px] flex-col items-center text-center">
        <Reveal>
          <span className="glass-dark inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-200">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
            Admissions open · Code {site.counsellingCode}
          </span>
        </Reveal>

        <Reveal delay={0.1}>
          <h2 className="mt-8 max-w-[18ch] font-display text-[2.4rem] font-extrabold leading-[1.04] tracking-tight text-white md:text-6xl">
            Four years here. Decades of momentum.
          </h2>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-white/70">
            Applications for 2026–27 are open across all seven B.Tech branches and every postgraduate
            programme.
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Magnetic>
              <Link href={site.applyUrl} className="btn-primary group text-base shadow-lg shadow-crimson/30">
                Apply now
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Magnetic>
            <Magnetic strength={0.25}>
              <a href={site.phoneHref} className="btn glass-dark text-white hover:bg-white/10">
                Call {site.phone}
              </a>
            </Magnetic>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
