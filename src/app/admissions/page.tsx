import type { Metadata } from "next";
import PageBanner from "@/components/ui/PageBanner";
import EnquiryForm from "@/components/forms/EnquiryForm";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { SpotlightCard } from "@/components/motion/Primitives";
import { CheckCircle2, ClipboardCheck, FileText, GraduationCap, ListChecks } from "@/components/ui/icons";
import { departmentList } from "@/data/departments";

export const metadata: Metadata = {
  title: "Admissions",
  description: "Admission procedure, course intake and enquiry for BVCITS, Amalapuram.",
};

const steps = [
  ["Qualify the entrance exam", "Appear for AP EAMCET / ECET / ICET / GATE / management-quota eligibility as applicable.", ListChecks],
  ["Attend counselling", "Participate in the convener / spot counselling under code BVTS.", ClipboardCheck],
  ["Document verification", "Submit certificates for verification at the admissions office.", FileText],
  ["Confirm & enrol", "Pay fees, complete registration and join your program.", CheckCircle2],
] as const;

export default function AdmissionsPage() {
  const intake = departmentList.filter((d) => d.intake > 0);

  return (
    <>
      <PageBanner
        title="Admissions 2026–27"
        subtitle="Open now under counselling code BVTS. Nine accredited programs across engineering and management."
        crumbs={[{ label: "Admissions" }]}
        image="/assets/images/UKS_5811-scaled.jpg"
      />

      <div className="section">
        <div className="container-page grid gap-12 lg:grid-cols-[1fr_400px]">
          <div>
            <Reveal>
              <section id="overview" className="prose-page scroll-mt-32">
                <h2 className="!mt-0">Admissions Overview</h2>
                <p>
                  Admissions to B.Tech programs are offered through AP EAMCET (convener quota) and management quota, and
                  lateral entry through AP ECET. PG programs (MBA, MCA) admit through AP ICET, while GATE-qualified
                  candidates are welcome for M.Tech. BVCITS follows a transparent, merit-based process.
                </p>
              </section>
            </Reveal>

            <section id="procedure" className="mt-12 scroll-mt-32">
              <h2 className="text-2xl font-bold text-navy">Admissions Procedure</h2>
              <Stagger className="mt-6 space-y-4" gap={0.09}>
                {steps.map(([t, d, Icon], i) => (
                  <StaggerItem key={t}>
                    <SpotlightCard className="flex gap-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold font-bold text-black">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 font-bold text-navy">
                          <Icon className="h-4 w-4 text-crimson" /> {t}
                        </h3>
                        <p className="mt-1 text-sm text-ink-soft">{d}</p>
                      </div>
                    </SpotlightCard>
                  </StaggerItem>
                ))}
              </Stagger>
            </section>

            <Reveal>
              <section id="intake" className="mt-12 scroll-mt-32">
                <h2 className="flex items-center gap-2 text-2xl font-bold text-navy">
                  <GraduationCap className="h-5 w-5 text-crimson" /> Course Intake
                </h2>
                <div className="mt-6 overflow-x-auto rounded-2xl border border-surface-border shadow-card">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="bg-navy text-white">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Program</th>
                        <th className="px-4 py-3 font-semibold">Level</th>
                        <th className="px-4 py-3 font-semibold">Sanctioned Intake</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {intake.map((d, i) => (
                        <tr key={d.slug} className={i % 2 ? "bg-surface-grey" : "bg-white"}>
                          <td className="px-4 py-3 font-medium text-navy">{d.name}</td>
                          <td className="px-4 py-3 text-ink-soft">{d.level}</td>
                          <td className="px-4 py-3 text-ink-soft">{d.intake}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </Reveal>
          </div>

          <Reveal direction="left" className="scroll-mt-32 lg:sticky lg:top-32 lg:self-start" id="enquiry">
            <EnquiryForm compact />
          </Reveal>
        </div>
      </div>
    </>
  );
}
