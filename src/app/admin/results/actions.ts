"use server";

import { revalidatePath } from "next/cache";

import { can } from "@/lib/auth/roles";
import { getServiceClient, getSessionUser } from "@/lib/auth/server";

/**
 * Batch lifecycle actions for the results portal.
 *
 * Every one of these runs on the SERVICE-ROLE client, which bypasses RLS
 * completely — `0010_results_portal.sql` grants `authenticated` select only, so
 * there is no user-session path to these writes at all. That makes the
 * `can(...)` check at the top of each action the actual authorization boundary
 * rather than a convenience, which is why it is repeated in full every time
 * instead of being assumed from the page that rendered the button.
 */

export interface BatchActionState {
  error: string | null;
  message: string | null;
}

export const IDLE_STATE: BatchActionState = { error: null, message: null };

async function authorize(): Promise<{ userId: string } | { error: string }> {
  const user = await getSessionUser();
  if (!user) return { error: "Your session has expired. Sign in again." };
  if (!can(user.role, "results.publish")) return { error: "Your role cannot publish results." };
  return { userId: user.id };
}

function batchIdFrom(formData: FormData): string | null {
  const id = String(formData.get("batchId") ?? "").trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** Make a draft batch visible to students. */
export async function publishBatch(_prev: BatchActionState, formData: FormData): Promise<BatchActionState> {
  const auth = await authorize();
  if ("error" in auth) return { error: auth.error, message: null };

  const batchId = batchIdFrom(formData);
  if (!batchId) return { error: "That batch could not be identified.", message: null };

  const supabase = getServiceClient();

  // Read first so the confirmation can name the batch, and so publishing an
  // empty batch — which would tell students "no results found" — is caught.
  const { data: batch } = await supabase
    .from("result_batches")
    .select("title, row_count, status")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) return { error: "That batch no longer exists.", message: null };
  if (batch.row_count === 0) {
    return { error: "That batch has no result rows, so publishing it would show students nothing.", message: null };
  }

  const { error } = await supabase
    .from("result_batches")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", batchId);

  if (error) return { error: `Could not publish: ${error.message}`, message: null };

  revalidatePath("/admin/results");
  return { error: null, message: `"${batch.title}" is now live. Students can look it up.` };
}

/**
 * Pull a batch back to draft.
 *
 * `published_at` is deliberately NOT cleared — it records when the results were
 * first released, which stays true even while the batch is temporarily hidden,
 * and clearing it would lose that fact on every correction cycle.
 */
export async function unpublishBatch(_prev: BatchActionState, formData: FormData): Promise<BatchActionState> {
  const auth = await authorize();
  if ("error" in auth) return { error: auth.error, message: null };

  const batchId = batchIdFrom(formData);
  if (!batchId) return { error: "That batch could not be identified.", message: null };

  const { error } = await getServiceClient()
    .from("result_batches")
    .update({ status: "draft" })
    .eq("id", batchId);

  if (error) return { error: `Could not unpublish: ${error.message}`, message: null };

  revalidatePath("/admin/results");
  return { error: null, message: "Batch hidden from students and returned to draft." };
}

/**
 * Archive a superseded batch.
 *
 * The preferred alternative to deleting: a revaluation sheet replaces an
 * earlier notification, but the earlier one is still the record of what
 * students were told, so it comes out of the lookup without being destroyed.
 */
export async function archiveBatch(_prev: BatchActionState, formData: FormData): Promise<BatchActionState> {
  const auth = await authorize();
  if ("error" in auth) return { error: auth.error, message: null };

  const batchId = batchIdFrom(formData);
  if (!batchId) return { error: "That batch could not be identified.", message: null };

  const { error } = await getServiceClient()
    .from("result_batches")
    .update({ status: "archived" })
    .eq("id", batchId);

  if (error) return { error: `Could not archive: ${error.message}`, message: null };

  revalidatePath("/admin/results");
  return { error: null, message: "Batch archived. It is kept on record but no longer appears in lookups." };
}

/**
 * Delete a batch and its marks.
 *
 * Guarded by typing the batch title back, because this cascades to every result
 * row in the batch and there is no undo. A published batch cannot be deleted at
 * all — students have already seen it, so the correct move is unpublish or
 * archive, and forcing that ordering removes the "wrong row in the list" class
 * of accident entirely.
 *
 * Student identity rows survive: a hall ticket's date of birth belongs to the
 * student, not to this upload, and deleting it would break their access to
 * every OTHER batch they appear in.
 */
export async function deleteBatch(_prev: BatchActionState, formData: FormData): Promise<BatchActionState> {
  const auth = await authorize();
  if ("error" in auth) return { error: auth.error, message: null };

  const batchId = batchIdFrom(formData);
  if (!batchId) return { error: "That batch could not be identified.", message: null };

  const supabase = getServiceClient();
  const { data: batch } = await supabase
    .from("result_batches")
    .select("title, status")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) return { error: "That batch no longer exists.", message: null };
  if (batch.status === "published") {
    return { error: "Unpublish or archive this batch before deleting it.", message: null };
  }

  const confirmation = String(formData.get("confirmTitle") ?? "").trim();
  if (confirmation !== batch.title) {
    return { error: "Type the batch title exactly to confirm deletion.", message: null };
  }

  const { error } = await supabase.from("result_batches").delete().eq("id", batchId);
  if (error) return { error: `Could not delete: ${error.message}`, message: null };

  revalidatePath("/admin/results");
  return { error: null, message: `Deleted "${batch.title}" and all of its result rows.` };
}
