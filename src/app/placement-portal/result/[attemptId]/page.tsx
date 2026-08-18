import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { ResultView } from "@/components/placement/ResultView";

export const dynamic = "force-dynamic";

export default async function PlacementResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/placement-portal/exams");

  const { attemptId } = await params;

  return (
    <div>
      <ResultView attemptId={attemptId} />
    </div>
  );
}