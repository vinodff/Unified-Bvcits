import Link from "next/link";
import type { ReactNode } from "react";

/** Shared frame for /login and /signup so the two pages cannot drift apart. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="flex min-h-[80vh] items-center justify-center bg-surface-subtle px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-sm font-semibold text-crimson hover:underline">
            ← Back to bvcits.edu.in
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-navy sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>
        </div>

        <div className="rounded-xl border border-surface-border bg-white p-6 shadow-card sm:p-8">
          {children}
        </div>

        <p className="mt-6 text-center text-sm text-ink-muted">{footer}</p>
      </div>
    </main>
  );
}

export const authInputCls =
  "w-full rounded-md border border-surface-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-crimson focus:ring-2 focus:ring-crimson-100 disabled:opacity-60";

export function AuthField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {message}
    </p>
  );
}
