"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * SVG progress ring. Pure presentational — the parent `ScrollTimeline`
 * `build()` callback drives the actual fill via `data-radial="<dataKey>"`,
 * tweening `strokeDashoffset` directly (idiomatic GSAP+React: target DOM
 * nodes from the timeline builder, not React state on every scrub frame).
 *
 * The number is ALWAYS rendered as real text at full opacity — the ring is
 * decorative reinforcement, never the only place the data lives. This is
 * the direct fix for the CEO-review finding: charts must not obscure the
 * actual number the way the old CountUp mid-animation state could.
 *
 * Default (pre-JS / reduced-motion) state is a FULLY DRAWN ring — always
 * correct, never empty/broken. JS only flips it to "start empty, scrub to
 * full" after mount, so there's no flash of a wrong state.
 */
export function RadialStat({
  dataKey,
  value,
  displayValue,
  label,
  size = 96,
  strokeWidth = 8,
  color = "#F5B800", // signature gold
  trackColor = "rgba(255,255,255,0.12)",
}: {
  dataKey: string;
  value: number; // 0..1
  displayValue: string;
  label: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
}) {
  const circleRef = useRef<SVGCircleElement>(null);
  const reduce = useReducedMotion();
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const filledOffset = circumference * (1 - Math.max(0, Math.min(1, value)));

  useEffect(() => {
    if (reduce) return; // stays fully drawn — the safe default
    const el = circleRef.current;
    if (el) el.style.strokeDashoffset = String(circumference); // start empty, JS-only
  }, [reduce, circumference]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
          <circle
            ref={circleRef}
            data-radial={dataKey}
            data-target-offset={filledOffset}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={0} // default: fully drawn (safe, correct, no-JS baseline)
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-lg font-extrabold text-white">{displayValue}</span>
        </div>
      </div>
      <span className="text-center text-xs text-white/70">{label}</span>
    </div>
  );
}
