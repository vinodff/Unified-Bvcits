"use client";

import { ScrollTimeline } from "@/components/motion/ScrollPin";
import { RadialStat } from "@/components/motion/RadialStat";
import type { placementStats as StatsList } from "@/data/home-content";

const ICON_COLORS = ["#F5B800", "#F5B800", "#F5B800", "#F5B800"];

/**
 * Pinned scroll-scrubbed reveal for the four placement stats, replacing the
 * flat CountUp cards. IMPORTANT — honesty note: these source values are
 * counts ("1256+", "58+"...), not percentages of a known total. The ring
 * therefore always fills to 100% as a scroll-triggered REVEAL, not as a
 * literal proportion — drawing it at, say, "73%" would imply a fraction
 * that doesn't exist in the underlying data. The number is what carries
 * the information; the ring is a motion accent, never the data source.
 */
export function PlacementsRadials({ stats }: { stats: (typeof StatsList extends (infer T)[] ? T : never)[] }) {
  return (
    <ScrollTimeline
      className="mt-12"
      start="top 75%"
      // pinSpacing MUST stay on. `pin: true` takes this grid out of flow for the
      // duration of the scrub; without reserved space the toppers grid and the
      // recruiter list scroll straight up over it (measured: stats at y=457 with
      // the toppers that follow them in the DOM rendering at y=192, and recruiter
      // offer 01 fully hidden). The hold is 30% rather than 55% because half a
      // viewport of scroll-lock is a long freeze for a four-card stat row.
      end="+=30%"
      build={(tl, el) => {
        const rings = el.querySelectorAll<SVGCircleElement>("[data-radial]");
        rings.forEach((ring, i) => {
          tl.to(
            ring,
            { strokeDashoffset: Number(ring.dataset.targetOffset) || 0, ease: "power2.out" },
            i * 0.12 // slight stagger so four rings don't all draw in lockstep
          );
        });
      }}
    >
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.07] p-6 backdrop-blur-md"
          >
            <RadialStat dataKey={`placement-${i}`} value={1} displayValue={s.v} label={s.label} color={ICON_COLORS[i]} />
          </div>
        ))}
      </div>
    </ScrollTimeline>
  );
}
