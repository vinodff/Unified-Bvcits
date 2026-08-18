import type { Metadata } from "next";

import PageBanner from "@/components/ui/PageBanner";
import TimetableView from "@/components/timetable/TimetableView";
import { TIMETABLE_META } from "@/data/timetable";

export const metadata: Metadata = {
  title: `Class Timetable — ${TIMETABLE_META.section} | BVCITS`,
  description: `Class timetable for ${TIMETABLE_META.section} — ${TIMETABLE_META.semester}, ${TIMETABLE_META.academicYear}, ${TIMETABLE_META.department}.`,
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <>
      <PageBanner
        title="Class Timetable"
        subtitle={`${TIMETABLE_META.department} · ${TIMETABLE_META.semester} · ${TIMETABLE_META.section} · ${TIMETABLE_META.academicYear}`}
        crumbs={[{ label: "Students", href: "/students" }, { label: "Class Timetable" }]}
      />
      <main className="section">
        <div className="container-page">
          <TimetableView />
        </div>
      </main>
    </>
  );
}