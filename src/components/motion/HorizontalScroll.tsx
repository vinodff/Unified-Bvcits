"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";

/**
 * Vertical scroll drives a horizontal pan through the children.
 *
 * Implemented with `position: sticky` inside a deliberately tall wrapper —
 * NOT with GSAP ScrollTrigger `pin: true`.
 *
 * Why: `pin: true` sets the pinned element to `position: fixed`. Any ancestor
 * with a `transform`, `filter`, `backdrop-filter`, `perspective` or `clip-path`
 * becomes the containing block for fixed descendants, so the pinned track
 * anchors to that ancestor instead of the viewport and disappears — while the
 * pin-spacer still reserves its full height. That produced a ~3000px void with
 * an invisible gallery on the home page, because `<ClipReveal>` (which animates
 * `clip-path`) wrapped this component. Every `motion.div` animating x/y/scale
 * in this codebase creates the same trap, so pinning was a landmine here.
 *
 * Sticky has no such dependency on an untransformed ancestor chain, needs no
 * spacer element, and stays in sync with Lenis for free because Lenis animates
 * real window scroll.
 *
 * Degrades to a native scroll-snap strip when: the pointer is coarse (pinning
 * fights momentum scroll on iOS/Android), the user prefers reduced motion, or
 * the content is not actually wider than the viewport. That fallback is also
 * the server-rendered state, so first paint is always real, scrollable content.
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Distance the track must travel. 0 means "don't take over the scroll".
  const [pan, setPan] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    const wrap = wrapRef.current;
    if (!track || !wrap || reduce) return;

    const measure = () => {
      const finePointer = window.matchMedia("(pointer: fine)").matches;
      // Measure against the wrapper, NOT window.innerWidth: this component sits
      // inside a max-width container, so the visible panel is narrower than the
      // viewport and innerWidth would under-scroll, hiding the last cards.
      // scrollWidth is the full content width in both modes.
      const distance = track.scrollWidth - wrap.clientWidth;
      setPan(finePointer && distance > 0 ? distance : 0);
    };

    measure();

    // Images settle after mount and change scrollWidth — without re-measuring,
    // the pan distance is short and the last cards never come into view.
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    observer.observe(wrap);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [reduce]);

  const isActive = pan > 0 && !reduce;

  // start start → end end over a (100vh + pan) tall wrapper gives exactly `pan`
  // pixels of scroll while the inner panel is stuck to the viewport.
  const { scrollYProgress } = useScroll({
    target: wrapRef,
    offset: ["start start", "end end"],
  });
  const rawX = useTransform(scrollYProgress, [0, 1], [0, -pan]);
  const x = useSpring(rawX, { stiffness: 140, damping: 30, mass: 0.35 });

  return (
    <div
      ref={wrapRef}
      className={className}
      style={isActive ? { height: `calc(100vh + ${pan}px)` } : undefined}
    >
      <div className={isActive ? "sticky top-0 flex h-screen items-center overflow-hidden" : ""}>
        <motion.div
          ref={trackRef}
          style={isActive ? { x } : undefined}
          className={`flex ${isActive ? "will-change-transform" : "snap-x snap-mandatory overflow-x-auto"} ${
            trackClassName || ""
          }`}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
