import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser, createClient } from "@/lib/auth/server";
import { ROLE_LABELS, ROLE_PORTAL, can, capabilitiesFor } from "@/lib/auth/roles";
import { portalBySlug } from "@/data/portals";
import {
  Bell,
  BarChart3,
  CalendarClock,
  GraduationCap,
  IndianRupee,
  Briefcase,
  TrendingUp,
  Clock,
  ClipboardCheck,
  FileText,
} from "@/components/ui/icons";
import { StatTile, AccessTile, SectionCard, Chip } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard | BVCITS",
  robots: { index: false, follow: false },
};

const CAPABILITY_CARDS: Record<
  string,
  { title: string; body: string; href: string }
> = {
  "announcements.write": {
    title: "Post an announcement",
    body: "Publish a notice to students, parents or a specific department.",
    href: "/dashboard/announcements",
  },
  "academics.record": {
    title: "My Classes",
    body: "Mark attendance and enter results for the classes assigned to you.",
    href: "/dashboard/classes",
  },
  "academics.manage": {
    title: "Academics overview",
    body: "Attendance, results and fee status across every class section.",
    href: "/dashboard/academics",
  },
  "enquiries.read": {
    title: "Admission enquiries",
    body: "Review enquiries from the website and track which are still waiting.",
    href: "/dashboard/enquiries",
  },
  "assistant.insights": {
    title: "Assistant insights",
    body: "See the questions the campus assistant could not answer.",
    href: "/dashboard/insights",
  },
  "marketing.studio": {
    title: "Marketing Studio",
    body: "Plan, generate and schedule campaigns across social platforms.",
    href: "/admin/marketing-studio",
  },
  "users.manage": {
    title: "Manage users",
    body: "Assign roles and deactivate accounts.",
    href: "/dashboard/users",
  },
  "exams.create": {
    title: "Placement Portal — Admin Console",
    body: "Enter an exam name and run the AI pipeline: research, extract, review, generate.",
    href: "/placement-portal/admin",
  },
  "exams.review": {
    title: "Placement Portal — Review Workspace",
    body: "Approve predicted papers, edit questions and publish to students.",
    href: "/placement-portal/review",
  },
};

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

interface StudentSnapshot {
  attendancePct: number | null;
  cgpa: number | null;
  feesDue: number;
  nextClass: { subjectName: string; day: number; startTime: string } | null;
}

/** Everything the student stat row needs, in as few round trips as the RLS
 * scoping allows. Each query already returns only this student's own rows. */
async function loadStudentSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  department: string | null
): Promise<StudentSnapshot> {
  const [attendanceRes, resultsRes, feesRes, profileRes] = await Promise.all([
    supabase.from("attendance_records").select("status").eq("student_id", studentId),
    supabase.from("semester_results").select("grade_point, subjects(credits)").eq("student_id", studentId).eq("published", true),
    supabase.from("fee_invoices").select("amount, paid_amount, status").eq("student_id", studentId),
    supabase.from("profiles").select("study_year, section").eq("id", studentId).maybeSingle(),
  ]);

  const attendanceRows = attendanceRes.data ?? [];
  const attendancePct = attendanceRows.length
    ? Math.round((attendanceRows.filter((r) => r.status === "present" || r.status === "late").length / attendanceRows.length) * 100)
    : null;

  type ResultJoinRow = { grade_point: number | null; subjects: { credits: number } | { credits: number }[] | null };
  const resultRows = (resultsRes.data ?? []) as unknown as ResultJoinRow[];
  let creditSum = 0;
  let pointSum = 0;
  for (const row of resultRows) {
    const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
    if (!subject || row.grade_point == null) continue;
    creditSum += subject.credits;
    pointSum += subject.credits * row.grade_point;
  }
  const cgpa = creditSum ? pointSum / creditSum : null;

  const feesDue = (feesRes.data ?? [])
    .filter((f) => f.status === "due" || f.status === "overdue" || f.status === "partial")
    .reduce((sum, f) => sum + (f.amount - f.paid_amount), 0);

  let nextClass: StudentSnapshot["nextClass"] = null;
  const profile = profileRes.data;
  if (department && profile?.study_year && profile.section) {
    const now = new Date();
    const isoDay = now.getDay() === 0 ? 7 : now.getDay(); // 1=Mon..7=Sun
    const nowTime = now.toTimeString().slice(0, 8);

    const { data: slots } = await supabase
      .from("timetable_slots")
      .select("day_of_week, start_time, subjects(name)")
      .eq("department", department)
      .eq("study_year", profile.study_year)
      .eq("section", profile.section)
      .order("day_of_week")
      .order("start_time");

    type SlotRow = { day_of_week: number; start_time: string; subjects: { name: string } | { name: string }[] | null };
    const rows = (slots ?? []) as unknown as SlotRow[];
    // Today's remaining classes first, then wrap to the earliest class on the
    // next day that has one — a Saturday-afternoon visit should still surface
    // Monday morning's first class rather than showing nothing.
    const upcoming =
      rows.find((r) => r.day_of_week === isoDay && r.start_time > nowTime) ??
      rows.find((r) => r.day_of_week > isoDay) ??
      rows[0];

    if (upcoming) {
      const subject = Array.isArray(upcoming.subjects) ? upcoming.subjects[0] : upcoming.subjects;
      nextClass = { subjectName: subject?.name ?? "Class", day: upcoming.day_of_week, startTime: upcoming.start_time };
    }
  }

  return { attendancePct, cgpa, feesDue, nextClass };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) return null; // layout already redirected

  // Set by the middleware capability gate, so a bounced user is told why
  // instead of silently landing back on the overview.
  const { denied } = await searchParams;

  const supabase = await createClient();

  // RLS decides what comes back — no role filtering in this query. A student
  // and a parent run the identical statement and get different rows.
  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, body, publish_at, pinned")
    .order("pinned", { ascending: false })
    .order("publish_at", { ascending: false })
    .limit(5);

  const snapshot = user.role === "student" ? await loadStudentSnapshot(supabase, user.id, user.department) : null;

  const portal = portalBySlug.get(ROLE_PORTAL[user.role].replace("/", ""));
  const actionCards = capabilitiesFor(user.role)
    .filter((c) => c in CAPABILITY_CARDS)
    .map((c) => CAPABILITY_CARDS[c]);

  return (
    <div className="space-y-8">
      {denied && (
        <p
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          That area needs a different role. You are signed in as{" "}
          <strong>{ROLE_LABELS[user.role]}</strong>.
        </p>
      )}

      <section>
        <h1 className="text-2xl font-bold text-navy">
          Welcome{user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          You are signed in as <strong>{ROLE_LABELS[user.role]}</strong>
          {user.department && ` in ${user.department}`}.
        </p>
      </section>

      {snapshot && (
        <section aria-labelledby="snapshot-heading">
          <h2 id="snapshot-heading" className="sr-only">Your snapshot</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={<BarChart3 className="h-5 w-5" />}
              label="Attendance"
              value={snapshot.attendancePct != null ? `${snapshot.attendancePct}%` : "—"}
              tone={snapshot.attendancePct == null ? "neutral" : snapshot.attendancePct >= 75 ? "success" : "danger"}
            />
            <StatTile
              icon={<TrendingUp className="h-5 w-5" />}
              label="CGPA"
              value={snapshot.cgpa != null ? snapshot.cgpa.toFixed(2) : "—"}
              tone="gold"
              delayMs={60}
            />
            <StatTile
              icon={<Clock className="h-5 w-5" />}
              label="Next class"
              value={snapshot.nextClass ? formatTime(snapshot.nextClass.startTime) : "None"}
              hint={snapshot.nextClass ? `${DAY_NAMES[snapshot.nextClass.day]} · ${snapshot.nextClass.subjectName}` : undefined}
              delayMs={120}
            />
            <StatTile
              icon={<IndianRupee className="h-5 w-5" />}
              label="Fees due"
              value={formatINR(snapshot.feesDue)}
              tone={snapshot.feesDue > 0 ? "warning" : "success"}
              delayMs={180}
            />
          </div>
        </section>
      )}

      {user.role === "student" && (
        <section aria-labelledby="quick-access-heading">
          <h2 id="quick-access-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Everything in one place
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AccessTile href="/dashboard/attendance" icon={<BarChart3 className="h-5 w-5" />} label="Attendance" description="Subject-wise percentage and recent classes" />
            <AccessTile href="/dashboard/timetable" icon={<CalendarClock className="h-5 w-5" />} label="Timetable" description="Your weekly class schedule" delayMs={40} />
            <AccessTile href="/dashboard/results" icon={<GraduationCap className="h-5 w-5" />} label="Results" description="Semester marks, SGPA and CGPA" delayMs={80} />
            <AccessTile href="/dashboard/fees" icon={<IndianRupee className="h-5 w-5" />} label="Fees" description="Invoices and payment status" delayMs={120} />
            <AccessTile href="/dashboard/opportunities" icon={<Briefcase className="h-5 w-5" />} label="Opportunities" description="Internships and hackathons for you" delayMs={160} />
            <AccessTile href="/dashboard/resume" icon={<FileText className="h-5 w-5" />} label="Resume Optimizer" description="Rewrite your resume to match any job description" delayMs={180} />
            <AccessTile href="/placement-portal/exams" icon={<ClipboardCheck className="h-5 w-5" />} label="Placement Prep" description="AI-predicted exam papers, faculty-approved" delayMs={200} />
            <AccessTile href="/dashboard/announcements" icon={<Bell className="h-5 w-5" />} label="Announcements" description="Notices from your department and college" delayMs={240} />
          </div>
        </section>
      )}

      {actionCards.length > 0 && (
        <section aria-labelledby="tools-heading">
          <h2 id="tools-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Your tools
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {actionCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group rounded-xl border border-surface-border bg-white p-5 shadow-card transition hover:border-crimson hover:shadow-lg"
              >
                <h3 className="font-bold text-navy group-hover:text-crimson">{card.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{card.body}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <SectionCard
        title="Latest announcements"
        icon={<Bell className="h-4 w-4" />}
        action={
          <Link href="/dashboard/announcements" className="text-sm font-semibold text-crimson hover:underline">
            View all
          </Link>
        }
      >
        {!announcements || announcements.length === 0 ? (
          <p className="rounded-xl border border-dashed border-surface-border bg-surface-subtle p-6 text-center text-sm text-ink-muted">
            No announcements for you right now.
          </p>
        ) : (
          <ul className="space-y-3">
            {announcements.map((a) => (
              <li key={a.id} className="rounded-xl border border-surface-border bg-surface-subtle p-4">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-bold text-navy">{a.title}</h3>
                  {a.pinned && <Chip tone="gold">Pinned</Chip>}
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-ink-muted">{a.body}</p>
                <p className="mt-2 text-xs text-ink-muted">
                  {new Date(a.publish_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {user.role !== "student" && portal && (
        <section aria-labelledby="portal-heading">
          <h2 id="portal-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Quick links from your portal
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {portal.actions.slice(0, 4).map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-lg border border-surface-border bg-white p-4 text-sm transition hover:border-crimson"
              >
                <span className="font-semibold text-navy">{action.label}</span>
                <span className="mt-0.5 block text-ink-muted">{action.description}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
