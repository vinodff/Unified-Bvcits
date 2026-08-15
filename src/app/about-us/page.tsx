import type { Metadata } from "next";
import PageBanner from "@/components/ui/PageBanner";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { SpotlightCard } from "@/components/motion/Primitives";
import { Award, Building2, GraduationCap, Handshake, Quote, Sparkles } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "About Us",
  description: "About Bonam Venkata Chalamayya Institute of Technology & Science (BVCITS), Amalapuram.",
};

const coreValues = [
  ["Excellence", "Pursuing the highest standards in teaching, learning and research.", Award],
  ["Integrity", "Upholding honesty, transparency and professional ethics.", Handshake],
  ["Innovation", "Encouraging creativity, enquiry and entrepreneurship.", Sparkles],
  ["Inclusiveness", "Providing equitable opportunities to every learner.", GraduationCap],
] as const;

const orgStructure = [
  "Governing Body",
  "Principal",
  "Deans (Academics, R&D, Student Affairs)",
  "Heads of Departments",
  "Faculty & Support Staff",
];

export default function AboutPage() {
  return (
    <>
      <PageBanner
        title="About BVCITS"
        subtitle="An autonomous, NAAC 'A' Grade institution nurturing competent, ethical engineers since inception."
        crumbs={[{ label: "About Us" }]}
        image="/assets/images/DSC06792-scaled.jpg"
      />

      <div className="section">
        <div className="container-page grid gap-12 lg:grid-cols-[1fr_280px]">
          <div className="prose-page max-w-none">
            <Reveal>
              <section id="about-bvcits" className="scroll-mt-32">
                <h2>About BVCITS</h2>
                <p>
                  Bonam Venkata Chalamayya Institute of Technology &amp; Science (BVCITS), Amalapuram, is an
                  autonomous engineering institution affiliated to JNTU Kakinada and approved by AICTE. Spread across a
                  40-acre campus, the institute is accredited with NAAC &lsquo;A&rsquo; Grade and NBA, and is home to
                  195+ experienced faculty across nine programs.
                </p>
                <p>
                  With modern laboratories, strong industry partnerships and a dedicated Training &amp; Placement Cell,
                  BVCITS is committed to producing globally competent professionals and responsible citizens.
                </p>
              </section>
            </Reveal>

            <Reveal>
              <section id="vision-mission" className="scroll-mt-32">
                <h2>Vision &amp; Mission</h2>
                <h3>Vision</h3>
                <p>
                  To emerge as a center of excellence in technical education and research, producing globally competent
                  engineers who contribute to the sustainable development of society.
                </p>
                <h3>Mission</h3>
                <ul>
                  <li>Impart quality, outcome-based education through modern pedagogy.</li>
                  <li>Promote research, innovation and entrepreneurship.</li>
                  <li>Build strong industry–institute collaboration.</li>
                  <li>Inculcate professional ethics, values and lifelong learning.</li>
                </ul>
              </section>
            </Reveal>

            <section id="core-values" className="scroll-mt-32">
              <h2>Core Values</h2>
              <Stagger className="my-4 grid gap-4 sm:grid-cols-2" gap={0.08}>
                {coreValues.map(([t, d, Icon]) => (
                  <StaggerItem key={t}>
                    <SpotlightCard className="h-full rounded-xl border border-surface-border bg-surface-grey p-4">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-crimson shadow-sm">
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <h3 className="!mt-3 text-lg text-navy">{t}</h3>
                      <p className="!my-1 text-sm">{d}</p>
                    </SpotlightCard>
                  </StaggerItem>
                ))}
              </Stagger>
            </section>

            <Reveal>
              <section id="organisation" className="scroll-mt-32">
                <h2>Organisation Structure</h2>
                <ol className="my-4 space-y-2 pl-5 text-ink">
                  {orgStructure.map((o, i) => (
                    <li key={o} className="list-decimal">
                      <span className="font-medium text-navy">{o}</span>
                      {i < orgStructure.length - 1 && <span className="text-ink-faint"> ↓</span>}
                    </li>
                  ))}
                </ol>
              </section>
            </Reveal>

            <Reveal>
              <section id="principals-message" className="scroll-mt-32">
                <h2>Principal&rsquo;s Message</h2>
                <blockquote className="relative my-4 rounded-r-xl border-l-4 border-gold-400 bg-surface-grey p-6 italic text-ink">
                  <Quote className="absolute right-4 top-4 h-8 w-8 text-gold-200" />
                  &ldquo;At BVCITS, we believe education is not just about degrees — it is about shaping capable,
                  confident and conscientious individuals. Our faculty, facilities and industry connections come together
                  to give every student the platform to excel.&rdquo;
                  <footer className="mt-3 not-italic text-sm font-semibold text-navy">— Principal, BVCITS</footer>
                </blockquote>
              </section>
            </Reveal>
          </div>

          <Reveal direction="left" className="lg:sticky lg:top-32 lg:self-start">
            <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-crimson">
                <Building2 className="h-4 w-4" /> At a glance
              </h3>
              <dl className="mt-3 space-y-3 text-sm">
                {[
                  ["Campus", "40 acres"],
                  ["Faculty", "195+"],
                  ["Accreditation", "NAAC 'A', NBA"],
                  ["Affiliation", "JNTUK · AICTE"],
                  ["Programs", "9"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-surface-grey pb-2">
                    <dt className="text-ink-muted">{k}</dt>
                    <dd className="font-semibold text-navy">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        </div>
      </div>
    </>
  );
}
