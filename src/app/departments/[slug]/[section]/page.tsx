import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DeptLayout from "@/components/departments/DeptLayout";
import DeptSection from "@/components/departments/DeptSection";
import { departmentList, getDepartment, sectionLabel, sidebarSections } from "@/data/departments";

export function generateStaticParams() {
  return departmentList.flatMap((d) =>
    sidebarSections.map((s) => ({ slug: d.slug, section: s.slug }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; section: string }>;
}): Promise<Metadata> {
  const { slug, section } = await params;
  const dept = getDepartment(slug);
  if (!dept) return { title: "Department" };
  return { title: `${sectionLabel(section)} — ${dept.short}` };
}

export default async function DepartmentSection({
  params,
}: {
  params: Promise<{ slug: string; section: string }>;
}) {
  const { slug, section } = await params;
  const dept = getDepartment(slug);
  if (!dept) notFound();

  return (
    <DeptLayout dept={dept} sectionLabel={sectionLabel(section)}>
      <DeptSection dept={dept} slug={section} />
    </DeptLayout>
  );
}
