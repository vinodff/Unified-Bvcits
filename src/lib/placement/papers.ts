import { getServiceClient } from "@/lib/auth/server";

/**
 * Recompute a paper's total_marks from its memberships. Called after any
 * question add/remove/marks change so the paper header never drifts from
 * the actual question set.
 */
export async function recomputeTotalMarks(
  supabase: ReturnType<typeof getServiceClient>,
  paperId: string
): Promise<void> {
  const { data: rows } = await supabase.from("paper_questions").select("marks").eq("paper_id", paperId);
  const total = (rows ?? []).reduce((sum, row) => sum + Number(row.marks), 0);
  await supabase.from("papers").update({ total_marks: total }).eq("id", paperId);
}