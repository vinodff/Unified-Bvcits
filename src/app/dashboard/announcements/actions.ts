"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/auth/server";
import { can, isUserRole, type UserRole } from "@/lib/auth/roles";

export interface AnnouncementFormState {
  error: string | null;
  ok: boolean;
}

/**
 * Publish an announcement.
 *
 * Authorization is enforced twice on purpose. The `can()` check gives a useful
 * message and avoids a pointless round trip; the RLS policy
 * `announcements_insert_staff` is the actual boundary — it re-checks the role
 * server-side and pins author_id to auth.uid(), so a crafted request that skips
 * this action cannot forge authorship or post as a student.
 */
export async function createAnnouncement(
  _prev: AnnouncementFormState,
  formData: FormData
): Promise<AnnouncementFormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Your session expired. Sign in again.", ok: false };
  if (!can(user.role, "announcements.write")) {
    return { error: "Your role cannot post announcements.", ok: false };
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (title.length < 3) return { error: "Title must be at least 3 characters.", ok: false };
  if (!body) return { error: "Announcement body cannot be empty.", ok: false };
  if (body.length > 8000) return { error: "Announcement body is too long (max 8000).", ok: false };

  // An empty audience means "everyone" in the RLS predicate, so unchecking all
  // boxes is a valid choice rather than an error.
  const audience = formData
    .getAll("audience")
    .map(String)
    .filter((r): r is UserRole => isUserRole(r));

  const departmentRaw = String(formData.get("department") ?? "").trim();
  const department = departmentRaw === "" ? null : departmentRaw;

  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();
  let expiresAt: string | null = null;
  if (expiresRaw) {
    const parsed = new Date(expiresRaw);
    if (Number.isNaN(parsed.getTime())) return { error: "Expiry date is not valid.", ok: false };
    // The DB check constraint requires expires_at > publish_at; catching it
    // here gives a better message than a raw constraint violation.
    if (parsed.getTime() <= Date.now()) {
      return { error: "Expiry must be in the future.", ok: false };
    }
    expiresAt = parsed.toISOString();
  }

  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert({
    title,
    body,
    author_id: user.id,
    audience,
    department,
    expires_at: expiresAt,
    pinned: formData.get("pinned") === "on",
    published: formData.get("publish") === "on",
  });

  if (error) {
    console.error("[announcements] insert failed:", error.message);
    return { error: "Could not save the announcement. Please try again.", ok: false };
  }

  revalidatePath("/dashboard/announcements");
  revalidatePath("/dashboard");
  return { error: null, ok: true };
}

/** Take a notice down. Unpublishing is the takedown path — expires_at cannot be backdated. */
export async function setAnnouncementPublished(id: string, published: boolean): Promise<void> {
  const user = await getSessionUser();
  if (!user || !can(user.role, "announcements.write")) return;

  const supabase = await createClient();
  // RLS (announcements_update_own) restricts this to the author or an admin.
  await supabase.from("announcements").update({ published }).eq("id", id);

  revalidatePath("/dashboard/announcements");
  revalidatePath("/dashboard");
}
