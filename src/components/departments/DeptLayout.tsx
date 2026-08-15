import type { ReactNode } from "react";
import PageBanner from "@/components/ui/PageBanner";
import DeptSidebar from "@/components/departments/DeptSidebar";
import { Reveal } from "@/components/motion/Reveal";
import type { Department } from "@/data/departments";

export default function DeptLayout({
  dept,
  sectionLabel,
  children,
}: {
  dept: Department;
  sectionLabel?: string;
  children: ReactNode;
}) {
  const crumbs = [
    { label: "Departments", href: "/departments" },
    { label: dept.name, href: `/departments/${dept.slug}` },
    ...(sectionLabel ? [{ label: sectionLabel }] : []),
  ];

  return (
    <>
      <PageBanner
        title={dept.name}
        subtitle={sectionLabel ? undefined : dept.tagline}
        crumbs={crumbs}
        image="/assets/images/h2-scaled.jpg"
      />
      <div className="section">
        <div className="container-page grid gap-8 lg:grid-cols-[280px_1fr]">
          <Reveal direction="right" className="lg:sticky lg:top-32 lg:self-start">
            <DeptSidebar deptSlug={dept.slug} />
          </Reveal>
          <Reveal direction="left" delay={0.08} className="min-w-0">
            {children}
          </Reveal>
        </div>
      </div>
    </>
  );
}
