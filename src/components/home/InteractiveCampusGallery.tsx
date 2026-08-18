"use client";

import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform, useSpring } from "motion/react";
import { ArrowRight } from "@/components/ui/icons";
import Link from "next/link";

export function InteractiveCampusGallery({ images }: { images: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const smoothScroll = useSpring(scrollYProgress, {
    stiffness: 50,
    damping: 20,
    restDelta: 0.001,
  });

  // Duplicate images to ensure the columns are long enough so we never see empty space at the bottom
  const extendedImages = [...images, ...images];

  // Break images into 3 long columns
  const col1 = extendedImages.slice(0, 7);
  const col2 = extendedImages.slice(7, 13);
  const col3 = extendedImages.slice(13, 20);

  // Parallax transforms - Adjusted limits so they don't scroll off-screen completely
  // Column 1 moves UP slowly
  const y1 = useTransform(smoothScroll, [0, 1], ["0%", "-15%"]);
  // Column 2 moves DOWN (reverse parallax - very premium feel)
  const y2 = useTransform(smoothScroll, [0, 1], ["-20%", "5%"]);
  // Column 3 moves UP faster
  const y3 = useTransform(smoothScroll, [0, 1], ["5%", "-25%"]);

  // Overlay text fade in
  const textOpacity = useTransform(smoothScroll, [0, 0.1, 0.9, 1], [1, 0, 0, 1]);
  const textY = useTransform(smoothScroll, [0, 0.1], ["0%", "-50%"]);

  return (
    <section ref={containerRef} className="relative h-[200vh] bg-navy overflow-hidden">
      <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
        
        {/* Background gradient for depth - only behind text to ensure readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-navy/90 via-navy/30 to-transparent z-10 pointer-events-none" />

        {/* Dynamic Text Overlay */}
        <motion.div 
          style={{ opacity: textOpacity, y: textY }}
          className="absolute z-20 flex flex-col items-center text-center pointer-events-none px-4"
        >
          <p className="eyebrow text-gold-500 mb-6 tracking-[0.2em] font-bold uppercase drop-shadow-md">Campus Life</p>
          <h2 className="font-display text-5xl sm:text-7xl font-extrabold tracking-tight text-white drop-shadow-2xl max-w-4xl leading-[1.1]">
            Not Just Confined To Classrooms
          </h2>
          <p className="mt-6 text-xl text-white/80 max-w-2xl drop-shadow-md font-medium">
            Experience campus beyond boundaries. A vibrant ecosystem of culture, technology, and connection.
          </p>
          <div className="mt-12 pointer-events-auto">
            <Link href="/campus-life" className="btn bg-gold-500 text-navy hover:bg-gold-400 hover:-translate-y-1 transition-all duration-300 px-8 py-4 rounded-full font-bold shadow-xl shadow-gold-500/20 group flex items-center gap-2">
              Explore Campus Life <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </motion.div>

        {/* Masonry Parallax Grid - Removed opacity constraints so images are vibrant */}
        <div className="relative w-full max-w-[1400px] h-full mx-auto px-4 sm:px-8 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8 transition-opacity duration-700">
          
          {/* Column 1 */}
          <motion.div style={{ y: y1 }} className="flex flex-col gap-4 sm:gap-8 pt-[20vh]">
            {col1.map((src, i) => (
              <div key={`${src}-c1-${i}`} className="relative w-full rounded-2xl sm:rounded-[2rem] overflow-hidden shadow-2xl group cursor-pointer aspect-[4/5] sm:aspect-auto sm:h-[400px]">
                <Image 
                  src={src} 
                  alt="Campus Life" 
                  fill 
                  className="object-cover transition-transform duration-1000 group-hover:scale-110" 
                />
                <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500" />
              </div>
            ))}
          </motion.div>

          {/* Column 2 (Reverse Parallax) */}
          <motion.div style={{ y: y2 }} className="hidden sm:flex flex-col gap-8 -mt-[20vh]">
            {col2.map((src, i) => (
              <div key={`${src}-c2-${i}`} className="relative w-full rounded-[2.5rem] overflow-hidden shadow-2xl group cursor-pointer h-[500px]">
                <Image 
                  src={src} 
                  alt="Campus Life" 
                  fill 
                  className="object-cover transition-transform duration-1000 group-hover:scale-110" 
                />
                <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500" />
              </div>
            ))}
          </motion.div>

          {/* Column 3 */}
          <motion.div style={{ y: y3 }} className="hidden sm:flex flex-col gap-8 pt-[40vh]">
            {col3.map((src, i) => (
              <div key={`${src}-c3-${i}`} className="relative w-full rounded-[2rem] overflow-hidden shadow-2xl group cursor-pointer h-[450px]">
                <Image 
                  src={src} 
                  alt="Campus Life" 
                  fill 
                  className="object-cover transition-transform duration-1000 group-hover:scale-110" 
                />
                <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500" />
              </div>
            ))}
          </motion.div>

        </div>
      </div>
    </section>
  );
}
