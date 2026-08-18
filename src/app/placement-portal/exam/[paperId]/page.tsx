import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { ExamRunner } from "@/components/placement/ExamRunner";

export const dynamic = "force-dynamic";

export default async function PlacementExamPage({ params }: { params: Promise<{ paperId: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/placement-portal/exams");
  if (user.role !== "student" && user.role !== "admin" && user.role !== "faculty") {
    redirect("/placement-portal");
  }

  const { paperId } = await params;

  return (
    <div>
      <ExamRunner paperId={paperId} />
    </div>
  );
}