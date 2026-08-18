import type { Metadata } from "next";
import Link from "next/link";
import { verifyCertificate } from "@/app/dashboard/certificates/actions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ certNumber: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { certNumber } = await params;
  return {
    title: `Certificate Verification — ${certNumber} | BVCITS`,
    robots: { index: false, follow: false },
  };
}

export default async function VerifyPage({ params }: Props) {
  const { certNumber } = await params;
  const result = await verifyCertificate(decodeURIComponent(certNumber));

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center">
          <Link href="/" className="inline-block text-2xl font-extrabold tracking-tight text-navy">
            BVCITS
          </Link>
          <p className="mt-1 text-sm text-ink-muted">Certificate Verification</p>
        </div>

        {/* Card */}
        <div className="mt-6 rounded-2xl border border-surface-border bg-white p-6 shadow-lg sm:p-8">
          {!result.found ? (
            /* Not found */
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="mt-4 text-xl font-bold text-navy">Certificate Not Found</h1>
              <p className="mt-2 text-sm text-ink-muted">
                No certificate with number <code className="rounded bg-surface-subtle px-1.5 py-0.5 text-xs font-semibold">{certNumber}</code> exists in our records.
              </p>
              <p className="mt-4 text-xs text-ink-faint">
                If you believe this is an error, please contact the college administration.
              </p>
            </div>
          ) : !result.verified ? (
            /* Revoked */
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
                <svg className="h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h1 className="mt-4 text-xl font-bold text-navy">Certificate Revoked</h1>
              <p className="mt-2 text-sm text-ink-muted">
                This certificate has been revoked and is no longer valid.
              </p>
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Certificate No.</dt>
                    <dd className="font-semibold text-navy">{result.certificateNumber}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Name</dt>
                    <dd className="font-semibold text-navy">{result.studentName}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : (
            /* Valid */
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="mt-4 text-xl font-bold text-emerald-700">Certificate Verified ✓</h1>
              <p className="mt-2 text-sm text-ink-muted">
                This is a valid certificate issued by BVCITS.
              </p>

              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-left">
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="shrink-0 text-ink-muted">Certificate No.</dt>
                    <dd className="text-right font-mono text-xs font-semibold text-navy">{result.certificateNumber}</dd>
                  </div>
                  <div className="border-t border-emerald-200" />
                  <div className="flex justify-between gap-2">
                    <dt className="shrink-0 text-ink-muted">Student Name</dt>
                    <dd className="text-right font-semibold text-navy">{result.studentName}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="shrink-0 text-ink-muted">Roll Number</dt>
                    <dd className="text-right font-semibold text-navy">{result.rollNumber}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="shrink-0 text-ink-muted">Branch</dt>
                    <dd className="text-right font-semibold text-navy">{result.branch}</dd>
                  </div>
                  <div className="border-t border-emerald-200" />
                  <div className="flex justify-between gap-2">
                    <dt className="shrink-0 text-ink-muted">Event</dt>
                    <dd className="text-right font-semibold text-navy">{result.eventTitle}</dd>
                  </div>
                  {result.eventDate && (
                    <div className="flex justify-between gap-2">
                      <dt className="shrink-0 text-ink-muted">Event Date</dt>
                      <dd className="text-right font-semibold text-navy">{result.eventDate}</dd>
                    </div>
                  )}
                  {result.generatedAt && (
                    <div className="flex justify-between gap-2">
                      <dt className="shrink-0 text-ink-muted">Issued On</dt>
                      <dd className="text-right text-xs text-ink-muted">
                        {new Date(result.generatedAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-ink-faint">
          Bonam Venkata Chalamayya Institute of Technology & Science ·{" "}
          <Link href="/" className="font-semibold text-crimson hover:underline">
            www.bvcits.edu.in
          </Link>
        </p>
      </div>
    </div>
  );
}
