"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/auth/browser";
import { AuthError, AuthField, authInputCls } from "@/components/auth/AuthShell";
import { DEMO_PASSWORD, type DemoAccount } from "@/lib/auth/demo";
import { DemoAccounts } from "./demo-accounts";

/**
 * `next` arrives already validated from the server. Deliberately no
 * useSearchParams() here — that hook opts the whole subtree out of
 * prerendering, which left the login inputs missing from the SSR HTML.
 */
export function LoginForm({
  next,
  showDemo = false,
}: {
  next: string;
  showDemo?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function signIn(email: string, password: string) {
    setError(null);
    setBusy(true);

    const { error: signInError } = await getBrowserClient().auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      // Supabase returns the same message for a wrong password and an unknown
      // address, which is what we want — distinguishing them would confirm
      // whether an address is registered.
      setError(
        signInError.message === "Invalid login credentials"
          ? "Incorrect email or password."
          : signInError.message
      );
      setBusy(false);
      return;
    }

    // refresh() so Server Components re-render with the new session cookie.
    router.replace(next);
    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await signIn(String(data.get("email") ?? "").trim(), String(data.get("password") ?? ""));
  }

  /** Fill the visible fields so the reviewer can see what is being submitted. */
  function handleDemoPick(account: DemoAccount) {
    const form = formRef.current;
    if (!form) return;

    (form.elements.namedItem("email") as HTMLInputElement).value = account.email;
    (form.elements.namedItem("password") as HTMLInputElement).value = DEMO_PASSWORD;

    void signIn(account.email, DEMO_PASSWORD);
  }

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <AuthField label="Email">
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            disabled={busy}
            className={authInputCls}
            placeholder="you@bvcits.edu.in"
          />
        </AuthField>

        <AuthField label="Password">
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            disabled={busy}
            className={authInputCls}
            placeholder="Your password"
          />
        </AuthField>

        <AuthError message={error} />

        <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {showDemo && <DemoAccounts onPick={handleDemoPick} />}
    </>
  );
}
