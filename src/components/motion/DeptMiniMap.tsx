"use client";

import { useRef, useState } from "react";
import { useScrollObserver } from "@/components/motion/ScrollPin";

/**
 * Sticky wayfinding dots for the B.Tech branch grid — highlights which
 * card is roughly centered in the viewport as the user scrolls past.
 * Lowest-priority of the three accepted extras; purely additive, degrades
 * to "just don't render the active state" if JS/scroll observation fails.
 */
export function DeptMiniMap({
  containerRef,
  count,
  labels,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  count: number;
  labels: string[];
}) {
  const [active, setActive] = useState(0);
  const markerRef = useRef<HTMLDivElement>(null);

  useScrollObserver(
    containerRef,
    (progress) => {
      const idx = Math.min(count - 1, Math.floor(progress * count));
      setActive(idx);
    },
    [count]
  );

  return (
    <div ref={markerRef} className="hidden flex-col items-center gap-2.5 lg:flex" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          title={labels[i]}
          className={`block rounded-full transition-all duration-300 ${
            i === active ? "h-6 w-1.5 bg-crimson" : "h-1.5 w-1.5 bg-surface-border"
          }`}
        />
      ))}
    </div>
  );
}
