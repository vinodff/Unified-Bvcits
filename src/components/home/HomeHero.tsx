"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { site } from "@/lib/site";
import { ArrowRight } from "@/components/ui/icons";

const slides = [
  {
    eyebrow: "Admissions Open 2026–27",
    title: "Engineer your future at BVCITS",
    body: "An autonomous, NAAC 'A' Grade institution on a 40-acre campus — where ambition meets opportunity.",
    gradient: "linear-gradient(120deg,#0B0B0C 0%,#111113 45%,#18181B 100%)",
  },
  {
    eyebrow: "Placements 2026",
    title: "1256+ offers · 58+ MNCs",
    body: "Highest package of 38 LPA. A dedicated Training & Placement Cell that turns students into professionals.",
    gradient: "linear-gradient(120deg,#050506 0%,#0B0B0C 50%,#1a1a1e 100%)",
  },
  {
    eyebrow: "Learn · Build · Lead",
    title: "9 programs. Endless possibilities.",
    body: "From CSE and AI & Data Science to Mechanical, Civil, MBA and MCA — accredited, industry-aligned curricula.",
    gradient: "linear-gradient(120deg,#0B0B0C 0%,#18181B 50%,#111113 100%)",
  },
];

export default function HomeHero() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const id = setInterval(() => setI((v) => (v + 1) % slides.length), 5500);
    return () => clearInterval(id);
  }, []);

  const s = slides[i];
  return (
    <section className="relative min-h-[460px] overflow-hidden text-white md:min-h-[540px]">
      {slides.map((sl, idx) => (
        <div
          key={idx}
          aria-hidden={idx !== i}
          className="absolute inset-0 transition-opacity duration-700"
          style={{ backgroundImage: sl.gradient, opacity: idx === i ? 1 : 0 }}
        />
      ))}
      <div
        aria-hidden
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 85% 15%, rgba(245,184,0,0.28), transparent 40%), radial-gradient(circle at 10% 90%, rgba(255,255,255,0.10), transparent 45%)",
        }}
      />
      <div className="container-page relative flex min-h-[460px] flex-col justify-center py-16 md:min-h-[540px]">
        <p className="eyebrow text-gold-300">{s.eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[1.1] text-white md:text-6xl">
          {s.title}
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/85">{s.body}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={site.applyUrl} className="btn-primary text-base">
            Apply for Admissions <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/departments" className="btn border border-white/40 text-white hover:bg-white/10">
            Explore Departments
          </Link>
        </div>
        <div className="mt-10 flex gap-2">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={`h-2 rounded-full transition-all ${idx === i ? "w-8 bg-gold-400" : "w-2 bg-white/40"}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
