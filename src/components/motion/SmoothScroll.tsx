"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/lib/gsap";

/**
 * Buttery inertial scrolling (the single biggest "premium" tell).
 * Disabled automatically when the user prefers reduced motion.
 *
 * Lenis and GSAP ScrollTrigger are synced on ONE rAF loop (GSAP's ticker):
 * - `lenis.on("scroll", ScrollTrigger.update)` keeps trigger math in lockstep
 *   with the smoothed scroll position — without it, every pinned/scrubbed
 *   timeline (ScrollPin, HorizontalScroll) drifts and jitters against Lenis.
 * - Lenis' own loop is skipped; GSAP's ticker drives `lenis.raf()` instead.
 * - `lagSmoothing(0)` removes GSAP's delay compensation so scrubs map 1:1.
 * This is the canonical pattern from the Lenis docs — the exact integration
 * every Awwwards-level marketing site ships.
 */
/**
 * iOS and desktop Safari stutter on Lenis' duration/easing model and on
 * `syncTouch`. Both get the simpler lerp integrator instead.
 */
function isAppleWebkit() {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
  return isIos || isSafari;
}

export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = isAppleWebkit()
      ? new Lenis({ lerp: 0.1, smoothWheel: true, syncTouch: false, touchMultiplier: 1.4 })
      : new Lenis({
          duration: 1.05,
          easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expo-out
          smoothWheel: true,
          touchMultiplier: 1.6,
        });

    // Keep ScrollTrigger's measurements in sync with Lenis' smoothed scroll.
    lenis.on("scroll", ScrollTrigger.update);

    // Drive Lenis from GSAP's single ticker instead of its own rAF loop,
    // so smooth scroll and all scroll-bound animations share one frame clock.
    const tick = (time: number) => lenis.raf(time * 1000); // gsap: seconds → lenis: ms
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // keep anchor links working with Lenis
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return;
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el as HTMLElement, { offset: -110 });
    };
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      gsap.ticker.remove(tick);
      lenis.destroy();
      ScrollTrigger.refresh(); // recalibrate triggers against native scroll
    };
  }, []);

  return null;
}
