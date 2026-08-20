import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth/server";
import { ROLE_LABELS, ROLE_PORTAL, can } from "@/lib/auth/roles";
import { SignOutButton } from "@/components/auth/SignOutButton";
import {
  LayoutGrid,
  Bell,
  Briefcase,
  User as UserIcon,
  IndianRupee,
  BarChart3,
  CalendarClock,
  GraduationCap,
  ClipboardCheck,
  Search,
  Sparkles,
  Users,
  MessageSquare,
  FileText,
  FileSpreadsheet,
  Award,
} from "@/components/ui/icons";

type IconComponent = typeof LayoutGrid;
interface NavItem {
  href: string;
  label: string;
  icon: IconComponent;
}

export const dynamic = "force-dynamic";

/**
 * The middleware already blocked anonymous requests, but this re-check is not
 * redundant: middleware only proves a valid token exists, while getSessionUser
 * also confirms the profile still exists and the account is still active. An
 * admin who deactivates someone must not have to wait for their token to lapse.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard");

  const nav: NavItem[] = [
    { href: "/dashboard", label: "Overview", icon: LayoutGrid },
    { href: "/dashboard/announcements", label: "Announcements", icon: Bell },
  ];

  // Personal academic records exist only for students — a parent, recruiter or
  // staff member has no attendance/timetable/results/fees rows of their own,
  // so these are a role check, not a capability. RLS is the real boundary
  // regardless (see 0007_student_records.sql); this only decides the nav.
  if (user.role === "student") {
    nav.push(
      { href: "/dashboard/attendance", label: "Attendance", icon: BarChart3 },
      { href: "/dashboard/timetable", label: "Timetable", icon: CalendarClock },
      { href: "/dashboard/results", label: "Results", icon: GraduationCap },
      { href: "/dashboard/fees", label: "Fees", icon: IndianRupee },
      { href: "/dashboard/resume", label: "Resume", icon: FileText }
    );
  }

  nav.push({ href: "/dashboard/opportunities", label: "Opportunities", icon: Briefcase });

  if (can(user.role, "academics.record")) nav.push({ href: "/dashboard/classes", label: "My Classes", icon: ClipboardCheck });
  if (can(user.role, "academics.manage")) nav.push({ href: "/dashboard/academics", label: "Academics", icon: BarChart3 });
  if (can(user.role, "enquiries.read")) nav.push({ href: "/dashboard/enquiries", label: "Enquiries", icon: Search });
  if (can(user.role, "assistant.insights")) nav.push({ href: "/dashboard/insights", label: "Assistant Insights", icon: MessageSquare });
  if (can(user.role, "users.manage")) nav.push({ href: "/dashboard/users", label: "Users", icon: Users });
  if (can(user.role, "results.publish")) nav.push({ href: "/admin/results", label: "Results Upload", icon: FileSpreadsheet });
  if (can(user.role, "marketing.studio")) nav.push({ href: "/admin/marketing-studio", label: "Marketing Studio", icon: Sparkles });
  if (can(user.role, "certificates.generate")) nav.push({ href: "/dashboard/certificates", label: "Certificates", icon: Award });

  nav.push({ href: "/dashboard/profile", label: "My Profile", icon: UserIcon });

  return (
    <div className="min-h-screen bg-surface-subtle">
      <header className="border-b border-surface-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <Link href="/" className="text-lg font-bold text-navy">
              BVCITS
            </Link>
            <p className="text-xs text-ink-muted">
              {user.fullName ?? user.email} ·{" "}
              <span className="font-semibold text-crimson">{ROLE_LABELS[user.role]}</span>
              {user.department && ` · ${user.department}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={ROLE_PORTAL[user.role]}
              className="text-sm font-medium text-ink-muted hover:text-crimson"
            >
              My portal
            </Link>
            <SignOutButton />
          </div>
        </div>

        <nav aria-label="Dashboard" className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex w-max flex-nowrap gap-1 pb-2 sm:w-auto sm:flex-wrap">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:bg-surface-subtle hover:text-crimson"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
