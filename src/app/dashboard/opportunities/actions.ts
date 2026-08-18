"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { isTrackerStatus } from "@/lib/opportunities/tracker";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Save an opportunity, or move it along the application tracker.
 *
 * Authorization is enforced twice, as in the announcements actions. `can()`
 * gives a useful message; the real boundary is the RLS policy
 * `opportunity_saves_insert_own`, which pins user_id to auth.uid() — a crafted
 * request that skips this action still cannot write a row onto someone else's
 * account.
 *
 * The upsert is what makes this idempotent: clicking "Save" on something
 * already saved updates the status rather than raising a duplicate-key error.
 */
export async function setSavedStatus(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user || !can(user.role, "opportunities.read")) return;

  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (!UUID.test(opportunityId)) return;

  const status = formData.get("status");
  if (!isTrackerStatus(status)) return;

  const supabase = await createClient();
  const { error } = await supabase.from("opportunity_saves").upsert(
    { user_id: user.id, opportunity_id: opportunityId, status },
    { onConflict: "user_id,opportunity_id" }
  );

  if (error) console.error("[opportunities] save failed:", error.message);

  revalidatePath("/dashboard/opportunities");
}

/** Remove a saved opportunity entirely. */
export async function removeSaved(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;

  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (!UUID.test(opportunityId)) return;

  const supabase = await createClient();
  // RLS restricts the delete to this user's own row; the eq() on user_id is
  // belt-and-braces so a policy regression cannot turn this into a wider delete.
  const { error } = await supabase
    .from("opportunity_saves")
    .delete()
    .eq("opportunity_id", opportunityId)
    .eq("user_id", user.id);

  if (error) console.error("[opportunities] unsave failed:", error.message);

  revalidatePath("/dashboard/opportunities");
}
