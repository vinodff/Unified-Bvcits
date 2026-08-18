import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { demoLoginsEnabled } from "@/lib/auth/demo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign In | BVCITS",
  description:
    "Sign in to your BVCITS account to access announcements, resources and services for students, parents, faculty and partners.",
};

/**
 * Only relative paths are accepted. An open redirect here would let a phishing
 * link sign a user in legitimately and then bounce them to an attacker's page,
 * which is far more convincing than a cold phishing form.
 *
 * `//evil.com` is rejected explicitly: it starts with "/" but browsers treat it
 * as protocol-relative and navigate off-site.
 */
function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Read on the server and pass down as a plain prop. Using useSearchParams()
  // inside the form instead made Next client-render the entire subtree, so the
  // email and password inputs were absent from the SSR HTML until JS loaded.
  const { next } = await searchParams;

  return (
    <AuthShell
      title="Sign in"
      subtitle="Students, parents, faculty and partners — one account for everything."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-crimson hover:underline">
            Create one
          </Link>
        </>
      }
    >
      {/* Resolved on the server so the demo panel is absent from the markup
          entirely when the flag is off, not merely hidden with CSS. */}
      <LoginForm next={safeNext(next)} showDemo={demoLoginsEnabled()} />
    </AuthShell>
  );
}
