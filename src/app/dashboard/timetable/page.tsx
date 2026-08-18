import type { Metadata } from "next";
import { createClient, getSessionUser } from "@/lib/auth/server";
import { CalendarClock, MapPin, User as UserIcon } from "@/components/ui/icons";
import { SectionCard, EmptyState } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Timetable | BVCITS",
  robots: { index: false, follow: false },
};

interface SlotRow {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  subjects: { code: string; name: string } | { code: string; name: string }[] | null;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
}

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default async function TimetablePage() {
  const user = await getSessionUser();
  if (!user) return null;

  if (user.role !== "student") {
    return <EmptyState icon={<CalendarClock className="h-8 w-8" />} text="A personal timetable is shown for student accounts." />;
  }

  const supabase = await createClient();

  if (!user.department) {
    return (
      <EmptyState
        icon={<CalendarClock className="h-8 w-8" />}
        text="Add your department and section on your profile to see your class timetable."
      />
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("study_year, section")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.study_year || !profile.section) {
    return (
      <EmptyState
        icon={<CalendarClock className="h-8 w-8" />}
        text="Add your year and section on your profile to see your class timetable."
      />
    );
  }

  const { data, error } = await supabase
    .from("timetable_slots")
    .select("id, day_of_week, start_time, end_time, room, subjects(code, name), profiles(full_name)")
    .eq("department", user.department)
    .eq("study_year", profile.study_year)
    .eq("section", profile.section)
    .order("day_of_week")
    .order("start_time");

  const rows = (data ?? []) as unknown as SlotRow[];
  const byDay = new Map<number, SlotRow[]>();
  for (const row of rows) {
    const list = byDay.get(row.day_of_week) ?? [];
    list.push(row);
    byDay.set(row.day_of_week, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Timetable</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {user.department} · Year {profile.study_year} · Section {profile.section}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load the timetable: {error.message}
        </p>
      )}

      {!error && rows.length === 0 ? (
        <EmptyState icon={<CalendarClock className="h-8 w-8" />} text="No timetable has been published for your class yet." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((day) => {
            const slots = byDay.get(day);
            if (!slots?.length) return null;
            return (
              <SectionCard key={day} title={DAYS[day]} icon={<CalendarClock className="h-4 w-4" />}>
                <ul className="space-y-3">
                  {slots.map((slot) => {
                    const subject = one(slot.subjects);
                    const faculty = one(slot.profiles);
                    return (
                      <li key={slot.id} className="rounded-xl border border-surface-border bg-surface-subtle p-3">
                        <p className="text-xs font-semibold text-crimson">
                          {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                        </p>
                        <p className="mt-1 font-medium text-navy">
                          {subject ? `${subject.code} — ${subject.name}` : "Subject removed"}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                          {faculty?.full_name && (
                            <span className="inline-flex items-center gap-1">
                              <UserIcon className="h-3.5 w-3.5" /> {faculty.full_name}
                            </span>
                          )}
                          {slot.room && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" /> {slot.room}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
