"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { gsap, ScrollTrigger } from "@/lib/gsap";

/**
 * Pins its container and scrubs a GSAP timeline to scroll position. This is
 * what Motion's useScroll/useTransform cannot do cleanly — a real "hold in
 * place, play a sequence, then release" section. Used for the hero intro and
 * the placements stat reveal.
 *
 * `build` receives the GSAP timeline and the container element; add tweens
 * to the timeline exactly as you would with plain GSAP. Everything is
 * cleaned up via gsap.context().revert() on unmount, so route changes never
 * leak a stale ScrollTrigger (the exact class of bug flagged in the GSAP
 * React forum threads this pattern was researched from).
 */
export function ScrollTimeline({
  children,
  build,
  pinSpacing = true,
  start = "top top",
  end = "+=100%",
  className,
}: {
  children: ReactNode;
  build: (tl: gsap.core.Timeline, el: HTMLDivElement) => void;
  pinSpacing?: boolean;
  start?: string;
  end?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start,
          end,
          scrub: 0.6, // slight lag = "buttery", not 1:1 rigid to scroll
          pin: true,
          pinSpacing,
          anticipatePin: 1,
        },
      });
      build(tl, el);
    }, el);

    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      ctx.revert(); // kills the timeline + its ScrollTrigger + resets inline styles
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `build` is expected to be stable per call site
  }, [reduce, start, end, pinSpacing]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * Lower-level hook for one-off ScrollTrigger use that isn't a pinned
 * timeline (e.g. tracking which child is centered, for the department
 * mini-map). Returns nothing — callers read state via their own callback.
 */
export function useScrollObserver(
  ref: React.RefObject<HTMLElement | null>,
  onUpdate: (progress: number) => void,
  deps: unknown[] = []
) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: "top bottom",
        end: "bottom top",
        onUpdate: (self) => onUpdate(self.progress),
      });
    }, el);
    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, ...deps]);
}
