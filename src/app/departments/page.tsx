import type { Metadata } from "next";
import Link from "next/link";
import PageBanner from "@/components/ui/PageBanner";
import SectionHeader from "@/components/ui/SectionHeader";
import {
  ArrowRight, Briefcase, Building2, CircuitBoard, Cog, Cpu, GraduationCap, Sparkles,
} from "@/components/ui/icons";
import { Stagger, StaggerItem } from "@/components/motion/Reveal";
import { SpotlightCard } from "@/components/motion/Primitives";
import { departmentList } from "@/data/departments";

export const metadata: Metadata = {
  title: "Departments",
  description: "Explore the nine engineering and management departments at BVCITS, Amalapuram.",
};

const iconFor: Record<string, typeof Cpu> = {
  CSE: Cpu, "AI & DS": Sparkles, "AI & ML": Sparkles, ECE: CircuitBoard,
  EEE: CircuitBoard, MECH: Cog, CIVIL: Building2, MBA: Briefcase, MCA: Cpu, "S&H": GraduationCap,
};

export default function DepartmentsIndex() {
  const ug = departmentList.filter((d) => d.level === "UG");
  const pg = departmentList.filter((d) => d.level === "PG");

  return (
    <>
      <PageBanner
        title="Departments"
        subtitle="Nine accredited programs across engineering, management and applied sciences."
        crumbs={[{ label: "Departments" }]}
        image="/assets/images/l1-scaled.jpg"
      />

      <section className="section">
        <div className="container-page">
          <SectionHeader eyebrow="Undergraduate" title="B.Tech & Engineering Programs" align="left" />
          <Grid items={ug} />

          {pg.length > 0 && (
            <div className="mt-16">
              <SectionHeader eyebrow="Postgraduate" title="PG Programs" align="left" />
              <Grid items={pg} />
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function Grid({ items }: { items: typeof departmentList }) {
  return (
    <Stagger className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" gap={0.07}>
      {items.map((d) => {
        const Icon = iconFor[d.short] ?? GraduationCap;
        return (
          <StaggerItem key={d.slug}>
            <Link href={`/departments/${d.slug}`} className="block h-full">
              <SpotlightCard className="flex h-full flex-col rounded-2xl border border-surface-border bg-white p-6 shadow-card transition-colors hover:border-crimson/25">
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-50 text-gold-600 transition-colors group-hover:bg-gold group-hover:text-black">
                    <Icon className="h-5 w-5" />
                  </span>
                  {d.intake > 0 && (
                    <span className="text-xs font-medium text-ink-faint">Intake {d.intake}</span>
                  )}
                </div>
                <h3 className="mt-4 text-lg font-bold text-navy group-hover:text-gold-600">{d.name}</h3>
                <p className="mt-1 line-clamp-2 flex-1 text-sm text-ink-muted">{d.tagline}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-crimson">
                  View department <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </SpotlightCard>
            </Link>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
