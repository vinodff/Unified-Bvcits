"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ROLE_LABELS, type UserRole } from "@/lib/auth/roles";
import { SignOutButton } from "@/components/auth/SignOutButton";

interface PortalShellProps {
  isSignedIn: boolean;
  role: UserRole | null;
  nav: { href: string; label: string }[];
  children: ReactNode;
}

/**
 * Placement Portal shell. The active exam-taking route renders bare — no
 * portal nav, no "Admin Console" / "Review Workspace" links a student could
 * click away to mid-exam. Everywhere else keeps the normal role-aware chrome.
 */
export function PortalShell({ isSignedIn, role, nav, children }: PortalShellProps) {
  const pathname = usePathname();
  const isSecureExam = pathname?.startsWith("/placement-portal/exam/") ?? false;

  if (isSecureExam) {
    return <div className="min-h-screen bg-surface-grey">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-surface-grey">
      <header className="border-b border-surface-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <Link href="/placement-portal" className="font-display text-lg font-extrabold text-navy">
              Placement Portal Agent
            </Link>
            <p className="text-xs text-ink-muted">
              AI-predicted exam practice · BVCITS Training &amp; Placement Cell
              {isSignedIn && role && (
                <>
                  {" · "}
                  <span className="font-semibold text-crimson">{ROLE_LABELS[role]}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!isSignedIn && (
              <>
                <Link href="/login?next=/placement-portal/exams" className="text-sm font-medium text-ink-muted hover:text-crimson">
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
                >
                  Create account
                </Link>
              </>
            )}
            {isSignedIn && (
              <>
                <Link href="/dashboard" className="text-sm font-medium text-ink-muted hover:text-crimson">
                  Dashboard
                </Link>
                <SignOutButton />
              </>
            )}
          </div>
        </div>

        {nav.length > 0 && (
          <nav aria-label="Placement portal" className="mx-auto max-w-6xl px-4">
            <ul className="flex flex-wrap gap-1 pb-2">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-block rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:bg-surface-grey hover:text-crimson"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
