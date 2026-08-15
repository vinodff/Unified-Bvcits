"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

type Dir = "up" | "down" | "left" | "right" | "none";

const offset: Record<Dir, { x?: number; y?: number }> = {
  up: { y: 28 },
  down: { y: -28 },
  left: { x: 34 },
  right: { x: -34 },
  none: {},
};

/** Scroll-triggered reveal. Wrap any block. */
export function Reveal({
  children,
  delay = 0,
  direction = "up",
  className,
  once = true,
  id,
}: {
  children: ReactNode;
  delay?: number;
  direction?: Dir;
  className?: string;
  once?: boolean;
  id?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div id={id} className={className}>{children}</div>;

  return (
    <motion.div
      id={id}
      className={className}
      initial={{ opacity: 0, ...offset[direction] }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once, amount: 0.25 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Staggered container — children animate in sequence. */
export function Stagger({
  children,
  className,
  delay = 0,
  gap = 0.08,
  ref,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  gap?: number;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div ref={ref} className={className}>{children}</div>;

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: gap, delayChildren: delay } },
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

/** Child of <Stagger>. */
export function StaggerItem({
  children,
  className,
  direction = "up",
}: {
  children: ReactNode;
  className?: string;
  direction?: Dir;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  const item: Variants = {
    hidden: { opacity: 0, ...offset[direction] },
    show: { opacity: 1, x: 0, y: 0, transition: { duration: 0.65, ease: EASE } },
  };
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}
