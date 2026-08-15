"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { gsap, ScrollTrigger } from "@/lib/gsap";

/**
 * Pins the section and converts vertical scroll into horizontal motion
 * through its children — the single highest-impact pattern from the 2026
 * Awwwards research (scroll-driven narratives vs. static equivalents).
 * Used for the campus-life gallery.
 *
 * On touch devices ScrollTrigger's own gsap.matchMedia guard (below) swaps
 * to a plain horizontal-scroll-snap track instead of scroll-jacking —
 * pinning fights momentum scroll on iOS/Android, a documented failure mode
 * from the GSAP forum research.
 */
export function HorizontalScroll({
  children,
  className,
  trackClassName,
}: {
  children: ReactNode;
  className?: string;
  trackClassName?: string;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track || reduce) return;

    const mm = gsap.matchMedia();

    mm.add("(pointer: fine)", () => {
      // Desktop takes over the pan itself — kill the native scrollbar so
      // there's exactly one scroll mechanism, not two fighting each other.
      track.style.overflowX = "visible";
      const ctx = gsap.context(() => {
        const distance = track.scrollWidth - section.clientWidth;
        if (distance <= 0) return;
        gsap.to(track, {
          x: -distance,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: () => `+=${distance}`,
            scrub: 0.6,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });
      }, section);
      return () => {
        track.style.overflowX = "";
        ctx.revert();
      };
    });

    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      mm.revert();
    };
  }, [reduce]);

  // Reduced-motion / touch fallback: a normal horizontal scroll-snap strip.
  // Real content, real scrollability — never a broken half-pinned state.
  return (
    <div ref={sectionRef} className={className}>
      <div
        ref={trackRef}
        className={`flex snap-x snap-mandatory overflow-x-auto ${trackClassName || ""}`}
      >
        {children}
      </div>
    </div>
  );
}
