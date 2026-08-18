"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/auth/browser";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    await getBrowserClient().auth.signOut();
    // replace() so the back button does not return to a dashboard page whose
    // cached HTML still shows the previous user's data.
    router.replace("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={busy}
      className="rounded-md border border-surface-border px-3 py-1.5 text-sm font-medium text-ink transition hover:border-crimson hover:text-crimson disabled:opacity-60"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
