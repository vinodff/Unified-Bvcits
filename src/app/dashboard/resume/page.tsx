import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/server";
import { EmptyState } from "@/components/dashboard/ui";
import { FileText } from "@/components/ui/icons";
import { ResumeOptimizer } from "./optimizer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Resume Optimizer | BVCITS",
  robots: { index: false, follow: false },
};

export default async function ResumePage() {
  const user = await getSessionUser();
  if (!user) return null;

  if (user.role !== "student") {
    return <EmptyState icon={<FileText className="h-8 w-8" />} text="The resume optimizer is available for student accounts." />;
  }

  // No data is loaded here on purpose. The optimizer is a one-shot flow —
  // paste, run, read — and prefetching a past run would put a stale resume in
  // the box the student is about to replace. Runs are still persisted for
  // history (see actions.ts) even though nothing reads them back yet.
  return <ResumeOptimizer />;
}
