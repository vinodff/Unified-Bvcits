import type { Metadata } from "next";
import Link from "next/link";
import PageBanner from "@/components/ui/PageBanner";
import SectionHeader from "@/components/ui/SectionHeader";
import {
  ArrowRight, Award, Briefcase, Handshake, Rocket, Sparkles, Target, TrendingUp,
} from "@/components/ui/icons";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { CountUp, SpotlightCard } from "@/components/motion/Primitives";

export const metadata: Metadata = {
  title: "Placements",
  description: "Training & Placement Cell, recruiters and placement statistics at BVCITS.",
};

const stats = [
  ["1256+", "Offers (2026)", TrendingUp],
  ["58+", "Recruiting MNCs", Briefcase],
  ["38 LPA", "Highest Package", Award],
  ["92%", "Placement Rate", Target],
] as const;

const subLinks = [
  ["Training & Placement Cell", "training-and-placement-cell", "Career readiness, aptitude and interview training.", Target],
  ["Industry Partnerships", "industry-partnerships", "MoUs and collaborations with leading companies.", Handshake],
  ["Internships & Apprenticeships", "internship-apprenticeship-opportunities", "Live projects and internship pipelines.", Briefcase],
  ["Recruitment Statistics", "campus-recruitment-statistics", "Year-wise placement and package data.", TrendingUp],
  ["Entrepreneurship & Start-Up Support", "entrepreneurship-start-up-support", "Incubation and mentoring for founders.", Rocket],
  ["Skill Development", "skill-development-initiatives", "Certifications and value-added courses.", Sparkles],
  ["CSR Engagements", "corporate-social-responsibility-csr-engagements", "Community and social-impact initiatives.", Handshake],
  ["Certification Programmes", "professional-certification-programmes", "CISCO, Pearson VUE and industry certs.", Award],
] as const;

export default function PlacementsPage() {
  return (
    <>
      <PageBanner
        title="Training & Placements"
        subtitle="Turning students into professionals through training, certifications and strong industry connect."
        crumbs={[{ label: "Placements" }]}
        image="/assets/images/DSC06792-scaled.jpg"
      />

      <section className="section bg-white">
        <Stagger className="container-page grid grid-cols-2 gap-6 md:grid-cols-4" gap={0.09}>
          {stats.map(([v, l, Icon]) => (
            <StaggerItem key={l}>
              <SpotlightCard className="h-full rounded-2xl border border-surface-border bg-surface-grey p-6 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-crimson-50 text-crimson">
                  <Icon className="h-5 w-5" />
                </span>
                <CountUp value={v} className="mt-4 block font-display text-3xl font-extrabold leading-none text-navy md:text-4xl" />
                <div className="mt-2 text-sm text-ink-soft">{l}</div>
              </SpotlightCard>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="section bg-surface-grey">
        <div className="container-page">
          <SectionHeader eyebrow="Explore" title="Placement Cell Services" description="Everything the cell offers, in one place." />
          <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" gap={0.06}>
            {subLinks.map(([label, slug, desc, Icon]) => (
              <StaggerItem key={slug}>
                <Link href={`/placements-cell/${slug}`} className="block h-full">
                  <SpotlightCard className="flex h-full flex-col rounded-2xl border border-surface-border bg-white p-6 shadow-card transition-colors hover:border-crimson/25">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-50 text-gold-600 transition-colors group-hover:bg-gold group-hover:text-black">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-lg font-bold text-navy group-hover:text-gold-600">{label}</h3>
                    <p className="mt-2 flex-1 text-sm text-ink-muted">{desc}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-crimson">
                      Learn more <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </SpotlightCard>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="border-t border-surface-border bg-white py-14">
        <Reveal className="container-page flex flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
          <div>
            <h2 className="text-2xl font-extrabold text-navy">Ready to start your career journey?</h2>
            <p className="mt-1.5 text-ink-soft">Connect with the Training & Placement Cell today.</p>
          </div>
          <Link href="/contact-us" className="btn-primary group">
            Contact Us <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Reveal>
      </section>
    </>
  );
}
