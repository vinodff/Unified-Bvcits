"use client";

import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

/* ------------------------------------------------------------------ */
/* Scroll progress bar (top of viewport)                               */
/* ------------------------------------------------------------------ */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 260, damping: 40, restDelta: 0.001 });
  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed left-0 top-0 z-[60] h-[3px] w-full origin-left bg-gradient-to-r from-crimson via-gold-400 to-crimson"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Count-up number that respects real strings like "1256+", "38 Lakhs" */
/* ------------------------------------------------------------------ */
/**
 * A string is safe to digit-animate only if it has exactly ONE number and
 * that number has no leading zero (Math.round() strips leading zeros, so
 * animating "09" settles to "9" — a permanent, silent data bug).
 * "09 UG · 05 PG" fails both checks (two numbers, first has a leading
 * zero) — those render as static text instead, fading in rather than
 * counting, which is also what protects them from ever showing a broken
 * intermediate value if captured mid-animation (e.g. a screenshot/export).
 */
function isSafeToAnimate(value: string, match: RegExpMatchArray | null): boolean {
  if (!match) return false;
  const [, , numStr, post] = match;
  const hasLeadingZero = numStr.length > 1 && numStr[0] === "0" && numStr[1] !== ".";
  const hasSecondNumber = /\d/.test(post);
  return !hasLeadingZero && !hasSecondNumber;
}

export function CountUp({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    // Parsed inside the effect on purpose: `value.match()` returns a fresh
    // array every render, so keeping it in the dep array restarted the
    // count-up on every re-render and it never reached the target.
    const match = value.match(/^([^\d]*)([\d,.]+)(.*)$/);
    if (!isSafeToAnimate(value, match) || reduce || !inView) {
      // Always render the real, final, correct value — never a partial or
      // stripped one. Only the reveal is animated (opacity/scale), never
      // the digits themselves, so there is no intermediate wrong state to
      // be caught mid-flight.
      setDisplay(value);
      setSettled(true);
      return;
    }
    const [, pre, numStr, post] = match!;
    const decimals = (numStr.split(".")[1] || "").length;
    const target = parseFloat(numStr.replace(/,/g, ""));
    if (!isFinite(target)) { setDisplay(value); setSettled(true); return; }
    const hasComma = numStr.includes(",");
    const start = performance.now();
    const dur = 1500;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const n = target * eased;
      const s = decimals ? n.toFixed(decimals) : Math.round(n).toString();
      setDisplay(pre + (hasComma ? Number(s).toLocaleString("en-US") : s) + post);
      if (p >= 1) setSettled(true);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, reduce]);

  return (
    <span
      ref={ref}
      className={`inline-block transition-all duration-500 ${settled || reduce ? "opacity-100" : "opacity-0"} ${className || ""}`}
    >
      {display}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Word-by-word headline reveal                                        */
/* ------------------------------------------------------------------ */
export function TextReveal({
  text,
  className,
  delay = 0,
  as: Tag = "h2",
}: {
  text: string;
  className?: string;
  delay?: number;
  as?: "h1" | "h2" | "h3" | "p";
}) {
  const reduce = useReducedMotion();
  if (reduce) return <Tag className={className}>{text}</Tag>;

  const words = text.split(" ");
  return (
    <Tag className={className}>
      <motion.span
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.055, delayChildren: delay } } }}
        style={{ display: "inline" }}
      >
        {words.map((w, i) => (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom" }}>
            <motion.span
              style={{ display: "inline-block" }}
              variants={{
                hidden: { y: "110%", opacity: 0 },
                show: { y: "0%", opacity: 1, transition: { duration: 0.75, ease: EASE } },
              }}
            >
              {w}
              {i < words.length - 1 ? " " : ""}
            </motion.span>
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/* Parallax wrapper — subtle depth on scroll                           */
/* ------------------------------------------------------------------ */
export function Parallax({
  children,
  amount = 60,
  className,
}: {
  children: ReactNode;
  amount?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [amount, -amount]);
  const smooth = useSpring(y, { stiffness: 120, damping: 30, mass: 0.4 });

  return (
    <div ref={ref} className={className}>
      <motion.div style={reduce ? undefined : { y: smooth }} className="h-full w-full">
        {children}
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Magnetic button — cursor attraction                                 */
/* ------------------------------------------------------------------ */
export function Magnetic({ children, strength = 0.35 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.4 });

  if (reduce) return <>{children}</>;

  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy, display: "inline-block" }}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onMouseLeave={() => { x.set(0); y.set(0); }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Spotlight card — cursor-follow glow + lift                          */
/* ------------------------------------------------------------------ */
export function SpotlightCard({
  children,
  className = "",
  tint = "174,21,45", // crimson rgb
}: {
  children: ReactNode;
  className?: string;
  tint?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: -999, y: -999 });
  const reduce = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={`group relative overflow-hidden ${className}`}
      whileHover={reduce ? undefined : { y: -6 }}
      transition={{ duration: 0.35, ease: EASE }}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onMouseLeave={() => setPos({ x: -999, y: -999 })}
    >
      {!reduce && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `radial-gradient(340px circle at ${pos.x}px ${pos.y}px, rgba(${tint},0.10), transparent 65%)`,
          }}
        />
      )}
      <div className="relative">{children}</div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Ken-Burns / zoom-on-scroll image frame                              */
/* ------------------------------------------------------------------ */
export function ZoomFrame({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1.16, 1.04, 1.16]);
  const smooth = useSpring(scale, { stiffness: 110, damping: 30 });

  return (
    <div ref={ref} className={`overflow-hidden ${className || ""}`}>
      <motion.div style={reduce ? undefined : { scale: smooth }} className="h-full w-full">
        {children}
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Clip-path "curtain" reveal — deliberate editorial wipe (Awwwards   */
/* staple). Parent owns the clip, children own transforms/parallax,   */
/* so the wipe and inner motion never fight each other.               */
/* ------------------------------------------------------------------ */
export function ClipReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ clipPath: "inset(100% 0% 0% 0%)" }}
      whileInView={{ clipPath: "inset(0% 0% 0% 0%)" }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 1.1, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
