"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionUser } from "@/lib/auth/server";

export interface ProfileFormState {
  error: string | null;
  ok: boolean;
}

/**
 * Update the signed-in user's own profile.
 *
 * Note what is absent: `role` and `is_active`. They are never read from the
 * form, and even if a crafted request added them, the
 * `guard_profile_privilege_change()` trigger rejects the update. Two
 * independent layers, because this is the one write path a normal user has to
 * their own row.
 */
export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Your session expired. Sign in again.", ok: false };

  const text = (key: string, max: number): string | null => {
    const value = String(formData.get(key) ?? "").trim();
    return value === "" ? null : value.slice(0, max);
  };

  const fullName = text("fullName", 120);
  if (!fullName || fullName.length < 2) {
    return { error: "Please enter your full name.", ok: false };
  }

  const phone = text("phone", 20);
  if (phone && !/^[0-9+][0-9 +()-]{6,19}$/.test(phone)) {
    return { error: "Please enter a valid mobile number.", ok: false };
  }

  const yearRaw = String(formData.get("studyYear") ?? "").trim();
  let studyYear: number | null = null;
  if (yearRaw) {
    const parsed = Number(yearRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4) {
      return { error: "Year of study must be between 1 and 4.", ok: false };
    }
    studyYear = parsed;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      phone,
      department: text("department", 100),
      roll_number: text("rollNumber", 40),
      employee_id: text("employeeId", 40),
      study_year: studyYear,
      section: text("section", 10),
      organization: text("organization", 160),
    })
    .eq("id", user.id);

  if (error) {
    // A duplicate roll number or employee ID is a user-fixable mistake, not a
    // server fault, so it gets its own message.
    if (error.code === "23505") {
      return { error: "That roll number or employee ID is already registered.", ok: false };
    }
    console.error("[profile] update failed:", error.message);
    return { error: "Could not save your profile.", ok: false };
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  return { error: null, ok: true };
}
