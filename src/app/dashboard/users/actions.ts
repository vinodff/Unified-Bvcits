"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser, getServiceClient } from "@/lib/auth/server";
import { can, isUserRole } from "@/lib/auth/roles";

export interface UserActionState {
  error: string | null;
  message: string | null;
}

/**
 * Change another account's role.
 *
 * This uses the service client, which bypasses RLS — so the `users.manage`
 * check below is the ONLY thing standing between a caller and full control of
 * every account. It must come first and must not be removable.
 */
export async function updateUserRole(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const actor = await getSessionUser();
  if (!actor) return { error: "Your session expired. Sign in again.", message: null };
  if (!can(actor.role, "users.manage")) {
    return { error: "Your role cannot manage users.", message: null };
  }

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!userId) return { error: "Missing user.", message: null };
  if (!isUserRole(role)) return { error: "Unknown role.", message: null };

  // An admin demoting themselves would lock the last administrator out of user
  // management with no way back in short of a database console.
  if (userId === actor.id && role !== "admin") {
    return { error: "You cannot remove your own administrator role.", message: null };
  }

  const { error } = await getServiceClient().rpc("set_user_role", {
    p_user_id: userId,
    p_role: role,
  });

  if (error) {
    console.error("[users] role change failed:", error.message);
    return { error: "Could not update the role.", message: null };
  }

  revalidatePath("/dashboard/users");
  return { error: null, message: "Role updated." };
}

/** Deactivate or reactivate an account without deleting its history. */
export async function setUserActive(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const actor = await getSessionUser();
  if (!actor) return { error: "Your session expired. Sign in again.", message: null };
  if (!can(actor.role, "users.manage")) {
    return { error: "Your role cannot manage users.", message: null };
  }

  const userId = String(formData.get("userId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";

  if (!userId) return { error: "Missing user.", message: null };
  if (userId === actor.id && !isActive) {
    return { error: "You cannot deactivate your own account.", message: null };
  }

  const { error } = await getServiceClient()
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);

  if (error) {
    console.error("[users] activation change failed:", error.message);
    return { error: "Could not update the account.", message: null };
  }

  revalidatePath("/dashboard/users");
  return { error: null, message: isActive ? "Account reactivated." : "Account deactivated." };
}
