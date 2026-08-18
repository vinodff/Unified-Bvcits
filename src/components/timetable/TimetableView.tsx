"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Clock } from "@/components/ui/icons";
import {
  TIMETABLE_DAYS,
  TIMETABLE_META,
  TIMETABLE_PERIODS,
  TIMETABLE_SUBJECTS,
  subjectByCode,
} from "@/data/timetable";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

type NowState = {
  today: number; // 0 = Sunday .. 6 = Saturday
  minutes: number;
  periodIndex: number | null; // 0-based index into TIMETABLE_PERIODS
  inLunch: boolean;
};

function computeNow(now: Date): NowState {
  const today = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const lunchStart = toMinutes(TIMETABLE_META.lunchStart);
  const lunchEnd = toMinutes(TIMETABLE_META.lunchEnd);
  const periodIndex = TIMETABLE_PERIODS.findIndex(
    (p) => minutes >= toMinutes(p.start) && minutes < toMinutes(p.end),
  );
  const inLunch = minutes >= lunchStart && minutes < lunchEnd;
  return { today, minutes, periodIndex: periodIndex >= 0 ? periodIndex : null, inLunch };
}

function StatusBanner({ state }: { state: NowState }) {
  const day = TIMETABLE_DAYS.find((d) => d.name === DAY_NAMES[state.today]);
  const subject = day && state.periodIndex !== null ? subjectByCode(day.grid[state.periodIndex]) : null;
  const period =
    state.periodIndex !== null && !state.inLunch ? TIMETABLE_PERIODS[state.periodIndex] : null;

  const isWeekend = state.today === 0;
  const beforeStart = state.minutes < toMinutes(TIMETABLE_PERIODS[0].start);
  const afterEnd = state.minutes >= toMinutes(TIMETABLE_PERIODS[TIMETABLE_PERIODS.length - 1].end);

  let status: "live" | "lunch" | "idle" = "idle";
  let line: string;
  if (isWeekend) {
    line = "No classes today.";
  } else if (state.inLunch) {
    status = "lunch";
    line = `Lunch break — classes resume at ${formatTime(TIMETABLE_PERIODS[3].start)}.`;
  } else if (period && subject) {
    status = "live";
    line = `${subject.code} — ${subject.name} with ${subject.faculty}`;
  } else if (beforeStart) {
    line = `Classes start at ${formatTime(TIMETABLE_PERIODS[0].start)}.`;
  } else if (afterEnd) {
    line = "Classes for today are over.";
  } else {
    line = "Free period.";
  }

  const tones: Record<typeof status, string> = {
    live: "border-gold-300 bg-gold-50",
    lunch: "border-orange-200 bg-orange-50",
    idle: "border-surface-border bg-surface-subtle",
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border p-4 sm:p-5 ${tones[status]}`}>
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-navy">
        {status === "live" && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-crimson opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-crimson" />
          </span>
        )}
        <Clock className="h-4 w-4 text-crimson" aria-hidden />
        {DAY_NAMES[state.today]}
        {period ? ` · Period ${period.n} (${formatTime(period.start)} – ${formatTime(period.end)})` : ""}
      </span>
      <span className="text-sm text-ink-muted">{line}</span>
    </div>
  );
}

function NowNext({ state }: { state: NowState }) {
  const day = TIMETABLE_DAYS.find((d) => d.name === DAY_NAMES[state.today]);
  if (!day || state.today === 0) return null;

  const currentIdx = state.inLunch ? 3 : state.periodIndex;
  const nowSubject = currentIdx !== null ? subjectByCode(day.grid[currentIdx]) : null;
  const nextSubject = currentIdx !== null ? subjectByCode(day.grid[currentIdx + 1]) : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-crimson">Now</p>
        {nowSubject ? (
          <>
            <p className="mt-1.5 font-semibold text-navy">
              {nowSubject.code} — {nowSubject.name}
            </p>
            <p className="mt-0.5 text-sm text-ink-muted">{nowSubject.faculty}</p>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-ink-muted">No class right now.</p>
        )}
      </div>
      <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Next</p>
        {nextSubject ? (
          <>
            <p className="mt-1.5 font-semibold text-navy">
              {nextSubject.code} — {nextSubject.name}
            </p>
            <p className="mt-0.5 text-sm text-ink-muted">{nextSubject.faculty}</p>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-ink-muted">Nothing scheduled after this.</p>
        )}
      </div>
    </div>
  );
}

export default function TimetableView() {
  const [now, setNow] = useState<NowState>(() => computeNow(new Date()));

  useEffect(() => {
    const id = setInterval(() => setNow(computeNow(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  const todayName = DAY_NAMES[now.today];

  return (
    <div className="space-y-8">
      <StatusBanner state={now} />
      <NowNext state={now} />

      <section className="rounded-2xl border border-surface-border bg-white p-4 shadow-card sm:p-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              Class timetable for {TIMETABLE_META.section}, {TIMETABLE_META.semester},{" "}
              {TIMETABLE_META.academicYear}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-surface-border py-3 pr-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Day
                </th>
                {TIMETABLE_PERIODS.map((p) => (
                  <th key={p.n} scope="col" className="border-b border-surface-border px-2 py-3 text-center">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      P{p.n}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-normal text-ink-faint">
                      {formatTime(p.start)}–{formatTime(p.end)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIMETABLE_DAYS.map((day) => {
                const isToday = day.name === todayName;
                const isCurrent = (idx: number) =>
                  isToday && !now.inLunch && now.periodIndex === idx;
                return (
                  <tr key={day.name} className={isToday ? "bg-gold-50/60" : ""}>
                    <th
                      scope="row"
                      className="border-b border-surface-border py-3 pr-3 font-semibold text-navy"
                    >
                      {day.name}
                      {isToday && (
                        <span className="ml-2 rounded-full bg-crimson px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Today
                        </span>
                      )}
                    </th>
                    {day.grid.map((code, idx) => {
                      const subject = subjectByCode(code);
                      const current = isCurrent(idx);
                      return (
                        <td
                          key={idx}
                          className={`border-b border-surface-border px-2 py-3 text-center align-top ${
                            current ? "bg-white ring-2 ring-inset ring-crimson" : ""
                          }`}
                        >
                          {subject ? (
                            <>
                              <span className="block text-xs font-bold text-navy">{subject.code}</span>
                              <span className="mt-0.5 block text-[11px] leading-tight text-ink-muted">
                                {subject.faculty}
                              </span>
                              {current && (
                                <span className="mt-1 inline-block rounded-full bg-crimson px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                  Now
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-ink-faint">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-ink-muted">
          Lunch: {TIMETABLE_META.lunch} · Effective from {TIMETABLE_META.effectiveFrom}
          {TIMETABLE_META.note ? ` · ${TIMETABLE_META.note}` : ""}
        </p>
      </section>

      <section className="rounded-2xl border border-surface-border bg-white p-4 shadow-card sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-navy">
          <CalendarClock className="h-5 w-5 text-crimson" aria-hidden />
          Subject &amp; Faculty Details
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-y border-surface-border text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="py-2.5 pr-3">Code</th>
                <th scope="col" className="px-3 py-2.5">Subject</th>
                <th scope="col" className="py-2.5 pl-3">Faculty</th>
              </tr>
            </thead>
            <tbody>
              {TIMETABLE_SUBJECTS.map((s) => (
                <tr key={s.code} className="border-b border-surface-border last:border-0">
                  <th scope="row" className="py-3 pr-3 font-mono text-xs font-semibold text-crimson">
                    {s.code}
                  </th>
                  <td className="px-3 py-3 font-medium text-navy">{s.name}</td>
                  <td className="py-3 pl-3 text-ink-muted">{s.faculty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-ink-muted">
          Class Incharge: {TIMETABLE_META.classIncharge} · {TIMETABLE_META.department} ·{" "}
          {TIMETABLE_META.academicYear}
        </p>
      </section>
    </div>
  );
}