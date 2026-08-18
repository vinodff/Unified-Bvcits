"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, MotionValue } from "motion/react";
import { Globe } from "lucide-react";

interface WhiteAICanvasSequenceProps {
  scrollYProgress: MotionValue<number>;
  frameCount?: number;
}

export default function WhiteAICanvasSequence({ scrollYProgress, frameCount = 180 }: WhiteAICanvasSequenceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Preload images
  useEffect(() => {
    const images: HTMLImageElement[] = [];
    let loadedCount = 0;
    let failedCount = 0;

    for (let i = 1; i <= frameCount; i++) {
      const img = new Image();
      const paddedIndex = i.toString().padStart(3, "0");
      // Expecting files like /whiteai-sequence/ezgif-frame-001.jpg
      img.src = `/whiteai-sequence/ezgif-frame-${paddedIndex}.jpg`;
      img.onload = () => {
        loadedCount++;
        if (loadedCount + failedCount === frameCount) {
          if (failedCount === frameCount) {
            setFailed(true);
          } else {
            setLoaded(true);
            drawFrame(0);
          }
        }
      };
      img.onerror = () => {
        failedCount++;
        if (loadedCount + failedCount === frameCount && failedCount === frameCount) {
          setFailed(true);
        }
      };
      if (i === 1) {
        img.addEventListener('load', () => drawFrame(0), { once: true });
      }
      images.push(img);
    }
    imagesRef.current = images;
    
    // Handle resize
    const handleResize = () => {
      if (loaded || imagesRef.current[0]?.complete) {
        drawFrame(Math.floor(scrollYProgress.get() * (frameCount - 1)));
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameCount]);

  const drawFrame = (frameIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = imagesRef.current[frameIndex];
    if (!img || !img.complete) return;

    // Adjust canvas internal resolution to match physical pixels for crispness
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    // "object-fit: contain" sizing logic to show full globe
    const hRatio = canvas.width / img.width;
    const vRatio = canvas.height / img.height;
    const ratio = Math.min(hRatio, vRatio); // contain
    const centerShift_x = (canvas.width - img.width * ratio) / 2;
    const centerShift_y = (canvas.height - img.height * ratio) / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      img,
      0,
      0,
      img.width,
      img.height,
      centerShift_x,
      centerShift_y,
      img.width * ratio,
      img.height * ratio
    );
  };

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (!imagesRef.current.length || failed) return;
    const frameIndex = Math.min(
      frameCount - 1,
      Math.max(0, Math.floor(latest * (frameCount - 1)))
    );
    requestAnimationFrame(() => drawFrame(frameIndex));
  });

  return (
    <div className="absolute inset-0 h-full w-full">
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gold-600/30">
          <Globe className="mb-4 h-24 w-24 opacity-20" />
          <p className="font-display font-bold uppercase tracking-[0.3em]">Awaiting White AI Sequence</p>
          <p className="mt-2 text-xs opacity-50">Drop frames into /public/whiteai-sequence/</p>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full object-contain mix-blend-multiply"
        />
      )}
    </div>
  );
}
