// Class timetable data — CSE-B, IV B.Tech I Sem, 2025–2026.
//
// To publish a new timetable: change `meta` and the grids below. The page at
// /students/timetable renders exactly this data, so an update here is an
// update on the portal. Period times are fixed college-wide; the day grids
// hold one subject code per period (a code can repeat, e.g. PE LAB on Friday).

export type TimetablePeriod = {
  n: number;
  start: string; // "HH:MM" 24h
  end: string;
};

export type TimetableDay = {
  name: string;
  grid: string[]; // subject codes, one per period ("" = free period)
};

export type TimetableSubject = {
  code: string;
  name: string;
  faculty: string;
};

export type TimetableMeta = {
  department: string;
  semester: string;
  academicYear: string;
  section: string;
  effectiveFrom: string;
  classIncharge: string;
  lunch: string;
  lunchStart: string; // 24h
  lunchEnd: string; // 24h
  note?: string;
};

export const TIMETABLE_PERIODS: TimetablePeriod[] = [
  { n: 1, start: "09:10", end: "10:10" },
  { n: 2, start: "10:10", end: "11:10" },
  { n: 3, start: "11:10", end: "12:10" },
  { n: 4, start: "13:00", end: "14:00" },
  { n: 5, start: "14:00", end: "15:00" },
  { n: 6, start: "15:00", end: "16:00" },
];

export const TIMETABLE_META: TimetableMeta = {
  department: "Computer Science & Engineering",
  semester: "IV B.Tech – I Sem",
  academicYear: "2025–2026",
  section: "CSE-B",
  effectiveFrom: "29/06/2026",
  classIncharge: "Mr. K L Swamy",
  lunch: "12:10 PM – 1:00 PM",
  lunchStart: "12:10", // 24h — used by the live Now/Next indicator
  lunchEnd: "13:00",
  note: "PE LAB occupies both Period 5 and Period 6 on Friday.",
};

export const TIMETABLE_SUBJECTS: TimetableSubject[] = [
  { code: "SADP", name: "Software Architecture and Design Patterns", faculty: "Mr. G T Naidu" },
  { code: "DL", name: "Deep Learning", faculty: "Mr. K L Swamy" },
  { code: "AGM", name: "Professional Elective: Agile Methodologies", faculty: "Dr. K Srinivas" },
  { code: "EIA", name: "OE3: Environmental Impact Assessment IA", faculty: "Mr. Rahul" },
  { code: "SWM", name: "OE4: Solid Waste Management", faculty: "Satya Mahesh" },
  { code: "HRM", name: "Human Resources & Project Management", faculty: "Mrs. Shakera Bhanu" },
  { code: "PE LAB", name: "Prompt Engineering LAB", faculty: "Dr. K Vijay Kumar" },
];

// Monday..Saturday in display order (index 0 = Monday). Sunday has no classes.
export const TIMETABLE_DAYS: TimetableDay[] = [
  { name: "Monday", grid: ["HRM", "DL", "SWM", "AGM", "EIA", "SADP"] },
  { name: "Tuesday", grid: ["DL", "SWM", "AGM", "SADP", "EIA", "HRM"] },
  { name: "Wednesday", grid: ["SADP", "HRM", "SWM", "EIA", "AGM", "DL"] },
  { name: "Thursday", grid: ["HRM", "AGM", "SADP", "COI", "DL", "SWM"] },
  { name: "Friday", grid: ["EIA", "DL", "SWM", "SADP", "PE LAB", "PE LAB"] },
  { name: "Saturday", grid: ["EIA", "AGM", "DL", "SADP", "HRM", "AGM"] },
];

export const subjectByCode = (code: string): TimetableSubject | undefined =>
  TIMETABLE_SUBJECTS.find((s) => s.code === code);

// The timetable may be updated over time; the page shows the effective date
// from `meta` above so students can tell which schedule is current.
export const TIMETABLE_EFFECTIVE = TIMETABLE_META.effectiveFrom;