"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/auth/browser";
import { AuthError, AuthField, authInputCls } from "@/components/auth/AuthShell";

const MIN_PASSWORD_LENGTH = 8;

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"confirm" | "ready" | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== String(data.get("confirmPassword") ?? "")) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    const { data: result, error: signUpError } = await getBrowserClient().auth.signUp({
      email: String(data.get("email") ?? "").trim(),
      password,
      options: {
        // Only descriptive fields. Role is NOT sent: handle_new_user() ignores
        // it and forces 'student', because this object is fully controlled by
        // the client and would otherwise be a way to register as an admin.
        data: {
          full_name: String(data.get("fullName") ?? "").trim(),
          phone: String(data.get("phone") ?? "").trim(),
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }

    // With email confirmation on, Supabase returns a user but no session.
    setDone(result.session ? "ready" : "confirm");
    setBusy(false);
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-100 bg-green-50 p-5 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-green-500 text-xl text-white">
          ✓
        </div>
        <h2 className="text-base font-bold text-green-800">Account created</h2>
        <p className="mt-1 text-sm text-green-700">
          {done === "confirm"
            ? "Check your email for a confirmation link, then sign in."
            : "You can sign in now."}
        </p>
        <p className="mt-3 text-xs text-green-700">
          New accounts start with student access. If you are faculty, management or a
          regulatory body, an administrator will upgrade your role.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <AuthField label="Full name">
        <input
          name="fullName"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          disabled={busy}
          className={authInputCls}
          placeholder="Your name"
        />
      </AuthField>

      <AuthField label="Email">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={busy}
          className={authInputCls}
          placeholder="you@example.com"
        />
      </AuthField>

      <AuthField label="Mobile (optional)">
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          pattern="[0-9+][0-9 +()\-]{6,19}"
          disabled={busy}
          className={authInputCls}
          placeholder="10-digit number"
        />
      </AuthField>

      <AuthField label="Password">
        <input
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          disabled={busy}
          className={authInputCls}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        />
      </AuthField>

      <AuthField label="Confirm password">
        <input
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          disabled={busy}
          className={authInputCls}
          placeholder="Re-enter your password"
        />
      </AuthField>

      <AuthError message={error} />

      <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
        {busy ? "Creating account…" : "Create account"}
      </button>

      <p className="text-xs text-ink-muted">
        Accounts start with student access. Faculty, management and regulatory roles are
        assigned by an administrator.
      </p>
    </form>
  );
}
