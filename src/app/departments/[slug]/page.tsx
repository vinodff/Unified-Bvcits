import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DeptLayout from "@/components/departments/DeptLayout";
import DeptSection from "@/components/departments/DeptSection";
import { departmentList, getDepartment } from "@/data/departments";

export function generateStaticParams() {
  return departmentList.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dept = getDepartment(slug);
  if (!dept) return { title: "Department" };
  return { title: dept.name, description: `${dept.name} at BVCITS — ${dept.tagline}` };
}

export default async function DepartmentLanding({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dept = getDepartment(slug);
  if (!dept) notFound();

  return (
    <DeptLayout dept={dept}>
      <DeptSection dept={dept} slug="about" />
    </DeptLayout>
  );
}
