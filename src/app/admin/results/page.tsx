import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { can } from "@/lib/auth/roles";
import { getServiceClient, getSessionUser } from "@/lib/auth/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/client";
import { SectionCard, StatTile } from "@/components/dashboard/ui";
import {
  ChevronLeft,
  ExternalLink,
  FileSpreadsheet,
  GraduationCap,
  ShieldAlert,
  UploadCloud,
  Users,
} from "@/components/ui/icons";
import BatchList, { type BatchRow } from "./batch-list";
import UploadPanel from "./upload-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Results Upload | BVCITS Admin",
  robots: { index: false, follow: false },
};

/**
 * Bulk results publishing.
 *
 * Reads run on the service-role client: `result_students` holds dates of birth
 * and `results_batch_overview` is revoked from `authenticated` entirely, so
 * there is no user-session read path. That makes the capability check below the
 * real boundary — the middleware's own check (ROUTE_CAPABILITIES) runs first
 * and returns an honest status, this one protects the privileged reads.
 */
export default async function ResultsAdminPage() {
  const user = await getSessionUser();
  if (!user || !can(user.role, "results.publish")) notFound();

  if (!isSupabaseAdminConfigured()) {
    return (
      <Shell>
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          The results portal needs <code className="font-mono">SUPABASE_SECRET_KEY</code> in{" "}
          <code className="font-mono">.env.local</code> before sheets can be imported. See{" "}
          <Link href="/docs" className="underline">
            docs/SUPABASE.md
          </Link>
          .
        </p>
      </Shell>
    );
  }

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("results_batch_overview")
    .select(
      "id, title, status, academic_year, semester, exam_type, row_count, student_count, created_at, published_at, pass_rows, fail_rows, absent_rows, placeholder_dob_students"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  // The overview view aggregates; source_filename and notes are not on it, so
  // they come from the base table in one extra round trip rather than by
  // widening a view that exists for the summary numbers.
  const { data: details } = await supabase
    .from("result_batches")
    .select("id, source_filename, notes")
    .order("created_at", { ascending: false })
    .limit(100);

  const detailById = new Map((details ?? []).map((row) => [row.id as string, row]));

  const batches: BatchRow[] = (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    status: row.status as BatchRow["status"],
    academicYear: (row.academic_year as string | null) ?? null,
    semester: (row.semester as string | null) ?? null,
    examType: (row.exam_type as string | null) ?? null,
    sourceFilename: (detailById.get(row.id as string)?.source_filename as string | null) ?? null,
    notes: (detailById.get(row.id as string)?.notes as string | null) ?? null,
    rowCount: Number(row.row_count ?? 0),
    studentCount: Number(row.student_count ?? 0),
    createdAt: row.created_at as string,
    publishedAt: (row.published_at as string | null) ?? null,
    passRows: Number(row.pass_rows ?? 0),
    failRows: Number(row.fail_rows ?? 0),
    absentRows: Number(row.absent_rows ?? 0),
  }));

  const published = batches.filter((b) => b.status === "published");
  const totalStudents = await countStudents(supabase);

  return (
    <Shell>
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load existing batches: {error.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          icon={<FileSpreadsheet className="h-5 w-5" />}
          label="Live notifications"
          value={String(published.length)}
          hint={`${batches.length} batch${batches.length === 1 ? "" : "es"} total`}
          tone="gold"
        />
        <StatTile
          icon={<Users className="h-5 w-5" />}
          label="Students on file"
          value={totalStudents.toLocaleString()}
          hint="Hall tickets that can sign in"
          delayMs={60}
        />
        <StatTile
          icon={<GraduationCap className="h-5 w-5" />}
          label="Published rows"
          value={published.reduce((sum, b) => sum + b.rowCount, 0).toLocaleString()}
          hint="Subject results students can see"
          tone="success"
          delayMs={120}
        />
      </div>

      <SectionCard title="Upload a results sheet" icon={<UploadCloud className="h-4 w-4" />}>
        <UploadPanel />
      </SectionCard>

      <SectionCard
        title="Uploaded batches"
        icon={<FileSpreadsheet className="h-4 w-4" />}
        action={
          <Link
            href="/students/results"
            target="_blank"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-crimson-700 hover:underline"
          >
            Open student lookup
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      >
        <BatchList batches={batches} />
      </SectionCard>

      <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <ShieldAlert className="h-4 w-4" aria-hidden />
          What hall ticket lookup does and does not protect
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm text-amber-900">
          <li>
            Hall ticket numbers run in sequence, so this is a convenience gate, not
            a password. It is the same trade-off many university results portals make.
          </li>
          <li>
            The lookup is rate limited, and returns
            only the one student&rsquo;s rows — there is no list to page through.
          </li>
          <li>Do not put anything in these sheets that should not be readable by someone with a hall ticket.</li>
        </ul>
      </aside>
    </Shell>
  );
}

async function countStudents(supabase: ReturnType<typeof getServiceClient>): Promise<number> {
  const { count } = await supabase.from("result_students").select("hall_ticket_no", { count: "exact", head: true });
  return count ?? 0;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <header>
        {/*
          This page lives under /admin, outside the dashboard shell and its
          sidebar, so without this there is no way back to the rest of the
          dashboard except the browser's back button.
        */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition hover:text-crimson-700"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-navy">Results upload</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Drop the examination branch&rsquo;s spreadsheet in and it becomes a draft batch. Review the numbers, then
          publish — students then look their marks up at{" "}
          <span className="font-mono text-ink">/students/results</span> with their hall ticket number. No student accounts required.
        </p>
      </header>
      {children}
    </div>
  );
}
