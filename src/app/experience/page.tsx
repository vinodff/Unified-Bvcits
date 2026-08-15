import type { Metadata } from "next";

import HeroCore from "@/components/scroll3d/HeroCore";
import BentoHighlights from "@/components/scroll3d/BentoHighlights";
import TunnelDepartments from "@/components/scroll3d/TunnelDepartments";
import FaqAccordion from "@/components/scroll3d/FaqAccordion";
import ClosingCta from "@/components/scroll3d/ClosingCta";

export const metadata: Metadata = {
  title: "The BVCITS Experience",
  description:
    "A scroll-driven tour of BVC Institute of Technology & Science, Amalapuram — 40-acre campus, ten departments and 1,256+ placements in 2026.",
};

export default function ExperiencePage() {
  return (
    <>
      <HeroCore />
      <BentoHighlights />
      <TunnelDepartments />
      <FaqAccordion />
      <ClosingCta />
    </>
  );
}
