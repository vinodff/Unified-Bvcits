"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * The frame-sequence engine shared by every scroll-driven canvas section.
 *
 * Three hooks, composed by the section components:
 *   useFramePreloader  — loads the JPG sequence, reports real progress
 *   useCanvasRenderer  — DPR-correct sizing + cover-fit drawImage
 *   useScrollProgress  — RAF-throttled, passive scroll -> 0..1 progress
 *
 * The hard rule everywhere below: nothing that changes on every scroll tick may
 * go through React state. Canvas pixels and inline styles are written straight
 * to the DOM via refs.
 */

const MOBILE_BREAKPOINT = 768;
/** On phones the subject reads better slightly cropped in. */
const MOBILE_ZOOM = 1.3;

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/* ------------------------------------------------------------------ */
/* Frame preloading                                                    */
/* ------------------------------------------------------------------ */

export type PreloadState = {
  framesRef: RefObject<HTMLImageElement[]>;
  loadProgress: number;
  isReady: boolean;
  /** Non-zero means some frames 404'd — the sequence needs re-rendering. */
  failedCount: number;
};

/**
 * @param enabled defer loading until the section is worth paying for — a page
 *   with two sequences should not pull both megabyte payloads on first paint.
 */
export function useFramePreloader(
  basePath: string,
  frameCount: number,
  enabled = true,
): PreloadState {
  const framesRef = useRef<HTMLImageElement[]>([]);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let settled = 0;
    let failed = 0;
    const images: HTMLImageElement[] = [];

    const settle = () => {
      if (cancelled) return;
      settled += 1;
      setLoadProgress(settled / frameCount);
      if (settled === frameCount) {
        setFailedCount(failed);
        setIsReady(true);
      }
    };

    for (let index = 1; index <= frameCount; index++) {
      const image = new Image();
      image.decoding = "async";
      image.onload = settle;
      // A missing frame must never stall the loader — degrade, don't hang.
      image.onerror = () => {
        failed += 1;
        settle();
      };
      image.src = `${basePath}/frame_${String(index).padStart(4, "0")}.jpg`;
      images.push(image);
    }
    framesRef.current = images;

    return () => {
      cancelled = true;
      for (const image of images) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [basePath, frameCount, enabled]);

  return { framesRef, loadProgress, isReady, failedCount };
}

/**
 * True once `ref` comes within `rootMargin` of the viewport, and stays true.
 * Used to start a frame preload just before the section is reached.
 */
export function useNearViewport(ref: RefObject<HTMLElement | null>, rootMargin = "150% 0px") {
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || isNear) return;

    // Without IntersectionObserver, load eagerly rather than never.
    if (typeof IntersectionObserver === "undefined") {
      setIsNear(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setIsNear(true);
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, isNear]);

  return isNear;
}

/* ------------------------------------------------------------------ */
/* Canvas rendering                                                    */
/* ------------------------------------------------------------------ */

export type CanvasRenderer = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Draws a frame by index. Cheap to call every tick — repeats are skipped. */
  drawFrame: (index: number) => void;
};

export function useCanvasRenderer(framesRef: RefObject<HTMLImageElement[]>): CanvasRenderer {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastDrawnRef = useRef(-1);

  const drawFrame = useCallback(
    (index: number) => {
      const canvas = canvasRef.current;
      const context = contextRef.current;
      if (!canvas || !context) return;

      const image = framesRef.current[index];
      // `naturalWidth === 0` catches frames that failed to decode.
      if (!image || !image.complete || image.naturalWidth === 0) return;
      if (index === lastDrawnRef.current) return;
      lastDrawnRef.current = index;

      // Context is pre-scaled by DPR, so we work in CSS pixels here.
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const imageRatio = image.naturalWidth / image.naturalHeight;
      const canvasRatio = width / height;

      let drawWidth: number;
      let drawHeight: number;
      if (canvasRatio > imageRatio) {
        drawWidth = width;
        drawHeight = width / imageRatio;
      } else {
        drawHeight = height;
        drawWidth = height * imageRatio;
      }

      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        drawWidth *= MOBILE_ZOOM;
        drawHeight *= MOBILE_ZOOM;
      }

      context.clearRect(0, 0, width, height);
      context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    },
    [framesRef],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // Render at native device resolution, then scale the context back so all
      // drawing math stays in CSS pixels. Without this, retina output is blurry.
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);

      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      contextRef.current = context;

      // Invalidate the repeat-frame guard so the next draw actually repaints.
      const lastDrawn = lastDrawnRef.current;
      lastDrawnRef.current = -1;
      if (lastDrawn >= 0) drawFrame(lastDrawn);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("orientationchange", resize, { passive: true });
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
    };
  }, [drawFrame]);

  return { canvasRef, drawFrame };
}

/* ------------------------------------------------------------------ */
/* Scroll progress                                                     */
/* ------------------------------------------------------------------ */

/**
 * Reports 0..1 progress through a tall pinned section. The handler is passive
 * and RAF-throttled with a ticking guard, so a burst of scroll events collapses
 * into a single frame of work.
 */
export function useScrollProgress(
  sectionRef: RefObject<HTMLElement | null>,
  onProgress: (progress: number) => void,
  enabled = true,
) {
  const tickingRef = useRef(false);
  const callbackRef = useRef(onProgress);

  // Keep the latest callback without resubscribing the listener each render.
  useEffect(() => {
    callbackRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    if (!enabled) return;

    const update = () => {
      const section = sectionRef.current;
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const scrollable = section.offsetHeight - window.innerHeight;
      callbackRef.current(scrollable > 0 ? clamp01(-rect.top / scrollable) : 0);
    };

    const handleScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        update();
        tickingRef.current = false;
      });
    };

    // Paint the correct frame immediately, including on a mid-page reload.
    update();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [sectionRef, enabled]);
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Maps 0..1 progress onto a frame index. */
export function frameIndexFor(progress: number, frameCount: number) {
  return Math.min(frameCount - 1, Math.max(0, Math.floor(progress * frameCount)));
}

export type VisibilityZone = { id: string; show: number; hide: number };

/**
 * Returns the ids visible at `progress`, or `null` when the set is unchanged —
 * letting callers skip setState on the vast majority of scroll ticks.
 */
export function diffVisibleZones(
  zones: readonly VisibilityZone[],
  progress: number,
  previousKeyRef: RefObject<string>,
): string[] | null {
  const visible = zones.filter((zone) => progress >= zone.show && progress < zone.hide).map((zone) => zone.id);
  const key = visible.join(",");
  if (key === previousKeyRef.current) return null;
  previousKeyRef.current = key;
  return visible;
}
