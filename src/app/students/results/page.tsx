import type { Metadata } from "next";
import Link from "next/link";

import { GraduationCap, Info } from "@/components/ui/icons";
import ResultLookup from "./result-lookup";

/**
 * Public results lookup.
 *
 * Deliberately NOT under /dashboard: this is for a student who has just heard
 * results are out and has no account, which is the overwhelming majority of
 * them. /dashboard/results remains the signed-in view of the live transcript
 * that faculty maintain — the two answer different questions and both should
 * exist. See the header comment in 0010_results_portal.sql.
 */

export const metadata: Metadata = {
  title: "Check Your Results | BVCITS",
  description:
    "Bharat Vidyapeeth College of Engineering results portal. Enter your hall ticket number and date of birth to view your semester results.",
  // The page itself is public and worth indexing; the results it returns are
  // rendered client-side after a POST, so nothing personal is ever crawlable.
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <main className="min-h-screen bg-surface-subtle py-12 sm:py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <header className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-gold-200 bg-gold-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-crimson-700">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden />
            Examination results
          </span>
          <h1 className="mt-4 text-3xl font-bold text-navy sm:text-4xl">Check your results</h1>
          <p className="mt-3 text-base text-ink-muted">
            Enter your hall ticket number and date of birth. No account or password needed.
          </p>
        </header>

        <div className="mt-10">
          <ResultLookup />
        </div>

        <aside className="mx-auto mt-10 max-w-2xl rounded-2xl border border-surface-border bg-white p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
            <Info className="h-4 w-4 text-ink-faint" aria-hidden />
            If your results do not appear
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
            <li>
              Results show here only after the examination branch publishes them. A subject you have sat may not be
              out yet.
            </li>
            <li>
              Check your hall ticket number character by character — a mistyped digit is the most common reason for
              a &ldquo;not found&rdquo;.
            </li>
            <li>
              Your date of birth must match your admission record. If it was recorded wrongly, the examination branch
              can correct it.
            </li>
            <li>
              Still stuck? <Link href="/contact-us" className="font-medium text-crimson-700 underline">Contact the college</Link>{" "}
              with your hall ticket number.
            </li>
          </ul>
        </aside>
      </div>
    </main>
  );
}
