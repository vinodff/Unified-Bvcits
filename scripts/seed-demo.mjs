#!/usr/bin/env node
// Create (or reset) the demo accounts shown on the login page.
//
//   node scripts/seed-demo.mjs           create/refresh the four demo accounts
//   node scripts/seed-demo.mjs --remove  delete them again
//
// These accounts exist so a reviewer can see what each role unlocks without
// being provisioned by hand. They are created with email_confirm so no mail is
// sent, and the passwords are intentionally identical and public — which is
// exactly why NEXT_PUBLIC_DEMO_LOGINS must stay off on any deployment holding
// real data. A demo admin is a real admin.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

export const DEMO_PASSWORD = "BvcitsDemo#2026";

/** Same 10-point scale as src/app/dashboard/classes/[slotId]/results/grading.ts,
 * duplicated rather than imported — this is a plain Node script with no
 * bundler to resolve the app's `@/` path alias or compile the .ts file. */
function gradeFromMarks(total, max) {
  const pct = max > 0 ? (total / max) * 100 : 0;
  const bands = [
    [90, "O", 10], [80, "A+", 9], [70, "A", 8], [60, "B+", 7], [50, "B", 6], [40, "C", 5],
  ];
  const band = bands.find(([floor]) => pct >= floor);
  return band ? { grade: band[1], gradePoint: band[2], status: "pass" } : { grade: "F", gradePoint: 0, status: "fail" };
}

/** Kept in sync with DEMO_ACCOUNTS in src/lib/auth/demo.ts. */
const ACCOUNTS = [
  { email: "demo.student@example.com", role: "student", fullName: "Demo Student", department: "CSE", extra: { roll_number: "DEMO-CSE-001", study_year: 3, section: "A" } },
  { email: "demo.parent@example.com", role: "parent", fullName: "Demo Parent", department: null, extra: {} },
  { email: "demo.faculty@example.com", role: "faculty", fullName: "Demo Faculty", department: "CSE", extra: { employee_id: "DEMO-EMP-001" } },
  { email: "demo.admin@example.com", role: "admin", fullName: "Demo Administrator", department: null, extra: {} },
];

// Subjects the demo student is CURRENTLY taking (Year 3, Semester 1) — these
// back the live timetable, attendance and the faculty "My Classes" screens.
const CURRENT_SUBJECTS = [
  { code: "CS301", name: "Operating Systems", credits: 4 },
  { code: "CS302", name: "Computer Networks", credits: 3 },
];

// Subjects from a COMPLETED year (Year 2, Semester 2) — these exist purely to
// give the Results page a real, already-published transcript to show, the way
// a real 3rd-year student would have one from their 1st and 2nd years.
const COMPLETED_SUBJECTS = [
  { code: "CS201", name: "Data Structures", credits: 4, internal: 27, external: 61 },
  { code: "CS202", name: "Digital Logic Design", credits: 3, internal: 24, external: 58 },
  { code: "CS203", name: "Discrete Mathematics", credits: 3, internal: 22, external: 49 },
];

const TIMETABLE = [
  { subjectCode: "CS301", dayOfWeek: 1, startTime: "09:00", endTime: "10:00", room: "LH-1" },
  { subjectCode: "CS302", dayOfWeek: 3, startTime: "10:00", endTime: "11:00", room: "LH-2" },
];

const ANNOUNCEMENTS = [
  {
    title: "Mid-semester examination timetable released",
    body: "The mid-semester timetable for all B.Tech programmes is now published. Check your department noticeboard for room allocations.",
    audience: ["student"],
    pinned: true,
  },
  {
    title: "Parent-teacher interaction — Saturday",
    body: "Parents are invited to meet department faculty and review academic progress. Reporting time 10:00 AM at the seminar hall.",
    audience: ["parent"],
    pinned: false,
  },
  {
    title: "Campus placement drive: 58 recruiters confirmed",
    body: "Registration for the 2026 placement season is open. Eligible students should complete their profile before the deadline.",
    audience: [],
    pinned: false,
  },
];

function loadEnv(path = ".env.local") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
    }
  } catch {
    /* fall through to the checks below */
  }
}

async function findUserByEmail(supabase, email) {
  // listUsers is paginated; the demo project is small, but page explicitly
  // rather than assuming everything fits on page one.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => u.email === email);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function remove(supabase) {
  for (const account of ACCOUNTS) {
    const user = await findUserByEmail(supabase, account.email);
    if (!user) {
      console.log(`  ${account.email}: not present`);
      continue;
    }
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    console.log(`  ${account.email}: ${error ? `FAILED ${error.message}` : "deleted"}`);
  }

  const { error } = await supabase
    .from("announcements")
    .delete()
    .in("title", ANNOUNCEMENTS.map((a) => a.title));
  if (error) console.error(`  announcements: ${error.message}`);
  else console.log("  demo announcements: deleted");

  // attendance_records / semester_results / fee_invoices all cascade away
  // automatically when the demo student's auth user (and so their profile)
  // is deleted above. subjects and timetable_slots do not reference a
  // student at all, and timetable_slots.faculty_id is `on delete set null`
  // rather than cascade — both would survive as orphans without this.
  const allCodes = [...CURRENT_SUBJECTS, ...COMPLETED_SUBJECTS].map((s) => s.code);
  const { data: demoSubjects } = await supabase.from("subjects").select("id").in("code", allCodes);
  const subjectIds = (demoSubjects ?? []).map((s) => s.id);
  if (subjectIds.length) {
    await supabase.from("timetable_slots").delete().in("subject_id", subjectIds);
    await supabase.from("subjects").delete().in("id", subjectIds);
  }
  console.log(`  academic records: ${subjectIds.length} demo subjects (and their timetable slots) deleted`);
}

async function seed(supabase) {
  const ids = {};

  for (const account of ACCOUNTS) {
    const existing = await findUserByEmail(supabase, account.email);

    if (existing) {
      // Reset the password so a half-configured leftover account still works.
      const { error } = await supabase.auth.admin.updateUserById(existing.id, {
        password: DEMO_PASSWORD,
        email_confirm: true,
      });
      if (error) throw new Error(`${account.email}: ${error.message}`);
      ids[account.role] = existing.id;
      console.log(`  ${account.email}: reset`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: account.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: account.fullName },
      });
      if (error) throw new Error(`${account.email}: ${error.message}`);
      ids[account.role] = data.user.id;
      console.log(`  ${account.email}: created`);
    }

    // The signup trigger always writes role 'student'; set the real role and
    // the role-appropriate profile fields here, via the service key.
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        role: account.role,
        full_name: account.fullName,
        department: account.department,
        ...account.extra,
      })
      .eq("id", ids[account.role]);

    if (profileError) throw new Error(`${account.email} profile: ${profileError.message}`);
  }

  // Authored by the demo faculty member so the announcements have a real author.
  const author = ids.faculty;
  for (const announcement of ANNOUNCEMENTS) {
    const { data: existing } = await supabase
      .from("announcements")
      .select("id")
      .eq("title", announcement.title)
      .maybeSingle();

    if (existing) {
      console.log(`  announcement "${announcement.title.slice(0, 40)}…": exists`);
      continue;
    }

    const { error } = await supabase.from("announcements").insert({
      ...announcement,
      author_id: author,
      published: true,
    });
    if (error) throw new Error(`announcement: ${error.message}`);
    console.log(`  announcement "${announcement.title.slice(0, 40)}…": created`);
  }

  await seedAcademics(supabase, ids);

  console.log(`\nPassword for every demo account: ${DEMO_PASSWORD}`);
  console.log("Set NEXT_PUBLIC_DEMO_LOGINS=1 in .env.local to show them on /login.");
}

/**
 * Populate the academic tables from 0007_student_records.sql: subjects, a
 * timetable, attendance history and a published transcript for the demo
 * student, taught by the demo faculty account. Idempotent — checked by
 * natural key (subjects/timetable) or upserted by real unique constraint
 * (attendance/results), so re-running `npm run seed:demo` refreshes rather
 * than duplicates.
 */
async function seedAcademics(supabase, ids) {
  const department = "CSE";
  const currentYear = 3;
  const section = "A";

  async function upsertSubject(spec, studyYear, semester) {
    const { data: existing } = await supabase
      .from("subjects")
      .select("id")
      .eq("department", department)
      .eq("study_year", studyYear)
      .eq("semester", semester)
      .eq("code", spec.code)
      .maybeSingle();
    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("subjects")
      .insert({ department, study_year: studyYear, semester, code: spec.code, name: spec.name, credits: spec.credits })
      .select("id")
      .single();
    if (error) throw new Error(`subject ${spec.code}: ${error.message}`);
    return data.id;
  }

  const currentSubjectIds = {};
  for (const spec of CURRENT_SUBJECTS) currentSubjectIds[spec.code] = await upsertSubject(spec, currentYear, 1);
  console.log(`  subjects: ${CURRENT_SUBJECTS.length} current, seeding transcript subjects…`);

  const completedSubjectIds = {};
  for (const spec of COMPLETED_SUBJECTS) completedSubjectIds[spec.code] = await upsertSubject(spec, currentYear - 1, 2);

  // --- timetable -------------------------------------------------------
  for (const slot of TIMETABLE) {
    const { data: existing } = await supabase
      .from("timetable_slots")
      .select("id")
      .eq("department", department)
      .eq("study_year", currentYear)
      .eq("section", section)
      .eq("subject_id", currentSubjectIds[slot.subjectCode])
      .eq("day_of_week", slot.dayOfWeek)
      .maybeSingle();
    if (existing) continue;

    const { error } = await supabase.from("timetable_slots").insert({
      department,
      study_year: currentYear,
      section,
      subject_id: currentSubjectIds[slot.subjectCode],
      faculty_id: ids.faculty,
      day_of_week: slot.dayOfWeek,
      start_time: slot.startTime,
      end_time: slot.endTime,
      room: slot.room,
    });
    if (error) throw new Error(`timetable slot ${slot.subjectCode}: ${error.message}`);
  }
  console.log(`  timetable: ${TIMETABLE.length} slots`);

  // --- attendance: the last 15 weekdays each current subject met -------
  const attendanceRows = [];
  for (const slot of TIMETABLE) {
    let found = 0;
    for (let back = 0; back < 60 && found < 8; back += 1) {
      const d = new Date();
      d.setDate(d.getDate() - back);
      // JS Date.getDay() (0=Sun..6=Sat) and this schema's day_of_week
      // (1=Mon..6=Sat) agree exactly for Monday–Saturday — only Sunday (0)
      // needs excluding, since day_of_week has no representation for it.
      if (d.getDay() === 0) continue;
      if (d.getDay() !== slot.dayOfWeek) continue;
      found += 1;
      // Mostly present, one late, one absent per subject — enough to make the
      // attendance % genuinely computed rather than a suspicious 100%.
      const status = found === 3 ? "late" : found === 6 ? "absent" : "present";
      attendanceRows.push({
        student_id: ids.student,
        subject_id: currentSubjectIds[slot.subjectCode],
        class_date: d.toISOString().slice(0, 10),
        status,
        marked_by: ids.faculty,
      });
    }
  }
  if (attendanceRows.length) {
    const { error } = await supabase
      .from("attendance_records")
      .upsert(attendanceRows, { onConflict: "student_id,subject_id,class_date" });
    if (error) throw new Error(`attendance: ${error.message}`);
  }
  console.log(`  attendance: ${attendanceRows.length} classes recorded`);

  // --- results: a completed, published Year 2 Semester 2 transcript ----
  const academicYear = `${new Date().getFullYear() - 1}-${String(new Date().getFullYear() % 100).padStart(2, "0")}`;
  const resultRows = COMPLETED_SUBJECTS.map((spec) => {
    const total = spec.internal + spec.external;
    const graded = gradeFromMarks(total, 100);
    return {
      student_id: ids.student,
      subject_id: completedSubjectIds[spec.code],
      semester: 2,
      academic_year: academicYear,
      internal_marks: spec.internal,
      external_marks: spec.external,
      grade: graded.grade,
      grade_point: graded.gradePoint,
      result_status: graded.status,
      published: true,
      published_at: new Date().toISOString(),
      entered_by: ids.faculty,
    };
  });
  const { error: resultsError } = await supabase
    .from("semester_results")
    .upsert(resultRows, { onConflict: "student_id,subject_id,semester,academic_year" });
  if (resultsError) throw new Error(`results: ${resultsError.message}`);
  console.log(`  results: ${resultRows.length} published subjects for ${academicYear} Semester 2`);

  // --- fees: one settled invoice, one currently due ---------------------
  const feeSpecs = [
    { term: "Semester 2", academicYear, description: "Tuition fee", amount: 45000, dueDaysAgo: 60, status: "paid", paidAmount: 45000 },
    { term: "Semester 1", academicYear: `${new Date().getFullYear()}-${String((new Date().getFullYear() + 1) % 100).padStart(2, "0")}`, description: "Tuition fee", amount: 47000, dueDaysAgo: -14, status: "due", paidAmount: 0 },
  ];
  for (const spec of feeSpecs) {
    const { data: existing } = await supabase
      .from("fee_invoices")
      .select("id")
      .eq("student_id", ids.student)
      .eq("academic_year", spec.academicYear)
      .eq("term", spec.term)
      .eq("description", spec.description)
      .maybeSingle();
    if (existing) continue;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - spec.dueDaysAgo);
    const { error } = await supabase.from("fee_invoices").insert({
      student_id: ids.student,
      academic_year: spec.academicYear,
      term: spec.term,
      description: spec.description,
      amount: spec.amount,
      due_date: dueDate.toISOString().slice(0, 10),
      status: spec.status,
      paid_amount: spec.paidAmount,
      paid_at: spec.status === "paid" ? new Date().toISOString() : null,
    });
    if (error) throw new Error(`fee invoice ${spec.term}: ${error.message}`);
  }
  console.log(`  fees: ${feeSpecs.length} invoices`);
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local.");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (process.argv.includes("--remove")) {
    console.log("Removing demo accounts…");
    await remove(supabase);
    return;
  }

  console.log("Seeding demo accounts…");
  await seed(supabase);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
