"use client";

/**
 * Covers a pinned canvas until its frame sequence has finished preloading.
 * Progress is real (one tick per decoded frame) — a fake bar is worse than none,
 * because the first scroll would land on an undrawn canvas.
 */
export function FrameLoader({
  progress,
  isReady,
  label,
}: {
  progress: number;
  isReady: boolean;
  label: string;
}) {
  const percent = Math.round(progress * 100);

  return (
    <div
      aria-hidden={isReady}
      className={`absolute inset-0 z-30 flex flex-col items-center justify-center bg-navy-800 transition-opacity duration-700 ${
        isReady ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "26px 26px" }}
      />
      <div className="relative flex w-[min(22rem,calc(100vw-3rem))] flex-col items-center">
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-gold-300">
          {label}
        </span>

        <div
          className="mt-5 h-[3px] w-full overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`Loading ${label}`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-crimson via-gold-400 to-gold-300 transition-[width] duration-200 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        <span className="mt-3 font-display text-xs tabular-nums text-white/45">{percent}%</span>
      </div>
    </div>
  );
}
