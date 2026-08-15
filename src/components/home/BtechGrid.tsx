"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  ArrowRight, Building2, CircuitBoard, Cog, Cpu, GraduationCap, Sparkles,
} from "@/components/ui/icons";
import { Stagger, StaggerItem } from "@/components/motion/Reveal";
import { TiltCard } from "@/components/motion/TiltCard";
import { DeptMiniMap } from "@/components/motion/DeptMiniMap";
import type { btechBranches as BranchList } from "@/data/home-content";

// Defined here, not passed as a prop: icon COMPONENT REFERENCES (Lucide's
// forwardRef objects) are not serializable across the Server->Client
// boundary — only JSX/primitives are. page.tsx (a Server Component) cannot
// hand this map down as a prop, so the lookup lives inside this "use
// client" file instead.
const branchIcons: Record<string, typeof Cpu> = {
  CSE: Cpu, AIML: Sparkles, IT: Cpu, ECE: CircuitBoard,
  EEE: CircuitBoard, CIV: Building2, MECH: Cog,
};

/**
 * B.Tech branch grid with 3D tilt cards + a sticky mini-map. Its own client
 * component because DeptMiniMap needs a real DOM ref (useRef doesn't exist
 * in Server Components) to track scroll position against.
 */
export function BtechGrid({
  branches,
}: {
  branches: (typeof BranchList extends (infer T)[] ? T : never)[];
}) {
  const gridRef = useRef<HTMLDivElement>(null);

  return (
    <div className="mt-7 flex gap-6">
      <div ref={gridRef} className="flex-1">
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" gap={0.06}>
          {branches.map((b) => {
            const Icon = branchIcons[b.code] ?? GraduationCap;
            return (
              <StaggerItem key={b.code}>
                <Link href={`/departments/${b.slug}`} className="block h-full">
                  <TiltCard className="h-full rounded-2xl border border-surface-border bg-white shadow-card transition-colors hover:border-crimson/30">
                    <div className="group flex h-full items-center gap-4 p-5">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-600 transition-colors group-hover:bg-gold group-hover:text-black">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-[15px] font-bold leading-snug text-navy transition-colors group-hover:text-gold-600">{b.name}</span>
                        <span className="text-xs text-ink-muted">Branch Code: {b.code}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-crimson transition-transform group-hover:translate-x-1" />
                    </div>
                  </TiltCard>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
      <DeptMiniMap containerRef={gridRef} count={branches.length} labels={branches.map((b) => b.code)} />
    </div>
  );
}
