"use client";

import Tilt from "react-parallax-tilt";
import { useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * 3D tilt + glare wrapper (react-parallax-tilt). Matches the site's
 * existing card shell (rounded-2xl, border, shadow-card) so it's a drop-in
 * replacement wherever a flat card currently sits.
 *
 * react-parallax-tilt already no-ops gracefully on touch (falls back to a
 * lighter gyroscope-based tilt or none), but tilt + glare on top of
 * `prefers-reduced-motion` is still an unwanted motion source, so it's
 * fully disabled there — content renders identically, just static.
 */
export function TiltCard({
  children,
  className = "",
  glareColor = "#F5B800", // signature gold — matches the crest accent
  glareOpacity = 0.18,
  tiltMax = 8,
}: {
  children: ReactNode;
  className?: string;
  glareColor?: string;
  glareOpacity?: number;
  tiltMax?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <Tilt
      tiltMaxAngleX={tiltMax}
      tiltMaxAngleY={tiltMax}
      glareEnable
      glareColor={glareColor}
      glareMaxOpacity={glareOpacity}
      glarePosition="all"
      glareBorderRadius="1rem"
      scale={1.015}
      transitionSpeed={1200}
      className={className}
      tiltEnable
      gyroscope={false} // parents already control mobile via prefers-reduced-motion + no hover surface
    >
      {children}
    </Tilt>
  );
}
