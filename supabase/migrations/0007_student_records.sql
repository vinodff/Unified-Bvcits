-- BVCITS 2.0 — 0007_student_records
--
-- The academic core of the student portal: subjects, timetable, attendance,
-- semester results, fee status. Numbered 0007 because 0006 was claimed by two
-- concurrent sessions (exam_portal, opportunities) — this migration does not
-- touch either; `exam_portal` is the placement mock-test engine (questions,
-- papers, attempts), unrelated to real academic attendance/marks below.
--
-- Design choice: class membership (department, study_year, section) is stored
-- as plain columns everywhere, not a foreign-keyed `class_sections` table.
-- `profiles` already models department/section this way (0004_auth_roles.sql),
-- and the rest of this codebase prefers natural text keys over dimension
-- tables for exactly this kind of low-cardinality, rarely-renamed value — see
-- `campaign_facts`, `DEPARTMENT_OPTIONS`. Introducing a join table here would
-- buy nothing but an extra hop in every query and every RLS policy.
--
-- Second design choice: no database views for STUDENT-facing aggregates
-- (attendance %, SGPA). A view's RLS behaviour depends on Postgres version
-- (`security_invoker` views need PG15+, and this project's PG version was not
-- confirmed), so per-student aggregation happens in the Server Component after
-- fetching the student's own RLS-scoped rows — a few hundred rows per
-- semester, trivial to reduce in JS. Views are used only for the STAFF-ONLY
-- oversight page, locked down exactly like `enquiry_inbox` / `campaign_dashboard`
-- in 0003_functions.sql: `revoke all from anon, authenticated`, queried with
-- the service-role client only.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.attendance_status as enum ('present', 'absent', 'late');
create type public.result_status    as enum ('pending', 'pass', 'fail', 'absent');
create type public.fee_status       as enum ('due', 'paid', 'overdue', 'waived', 'partial');

-- Needed for the GIST exclusion constraint on timetable_slots below — GIST
-- only supports equality comparisons on plain scalar columns (department
-- text, study_year, section, day_of_week) via this extension; range overlap
-- on the time columns is native to GIST already.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Subjects — the course catalog per department/year/semester.
-- ---------------------------------------------------------------------------
create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  department  text not null,
  study_year  smallint not null check (study_year between 1 and 4),
  semester    smallint not null check (semester in (1, 2)),
  code        text not null,
  name        text not null,
  credits     smallint not null default 3 check (credits between 1 and 6),
  created_at  timestamptz not null default now(),
  unique (department, study_year, semester, code)
);

create index subjects_lookup_idx on public.subjects (department, study_year, semester);

-- ---------------------------------------------------------------------------
-- Timetable — weekly recurring schedule per class (department + year + section).
--
-- Writable by staff only, not by faculty. Real timetabling is a registrar
-- function, not something each faculty member edits independently — modelling
-- it that way keeps this migration from also needing a "propose a slot change,
-- get it approved" workflow, which is out of scope for what was asked.
-- ---------------------------------------------------------------------------
create table public.timetable_slots (
  id           uuid primary key default gen_random_uuid(),
  department   text not null,
  study_year   smallint not null check (study_year between 1 and 4),
  section      text not null,
  subject_id   uuid not null references public.subjects (id) on delete cascade,
  faculty_id   uuid references public.profiles (id) on delete set null,
  -- 1 = Monday .. 6 = Saturday. Indian engineering colleges routinely teach
  -- Saturday classes, so the week is not truncated to five days.
  day_of_week  smallint not null check (day_of_week between 1 and 6),
  start_time   time not null,
  end_time     time not null check (end_time > start_time),
  room         text,
  created_at   timestamptz not null default now(),
  -- A section cannot be in two places in the same hour. The time columns are
  -- anchored to an arbitrary fixed date purely so tsrange overlap comparison
  -- is available — no calendar date is implied by it.
  exclude using gist (
    department with =,
    study_year with =,
    section with =,
    day_of_week with =,
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time) with &&
  )
);

create index timetable_class_idx   on public.timetable_slots (department, study_year, section, day_of_week);
create index timetable_faculty_idx on public.timetable_slots (faculty_id) where faculty_id is not null;

-- ---------------------------------------------------------------------------
-- Attendance — one row per student, per subject, per class date.
-- ---------------------------------------------------------------------------
create table public.attendance_records (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles (id) on delete cascade,
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  class_date  date not null,
  status      public.attendance_status not null,
  marked_by   uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, subject_id, class_date)
);

create index attendance_student_idx on public.attendance_records (student_id, subject_id);
create index attendance_marker_idx  on public.attendance_records (marked_by, class_date) where marked_by is not null;

create trigger attendance_records_set_updated_at
  before update on public.attendance_records
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Semester results — the transcript, not a full mark-by-mark ledger. Each row
-- is a subject's combined internal + external result for one semester, which
-- is what a student's results page and CGPA calculation actually need.
-- ---------------------------------------------------------------------------
create table public.semester_results (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles (id) on delete cascade,
  subject_id      uuid not null references public.subjects (id) on delete cascade,
  semester        smallint not null check (semester in (1, 2)),
  academic_year   text not null,
  internal_marks  numeric(5, 2) check (internal_marks is null or internal_marks between 0 and 30),
  external_marks  numeric(5, 2) check (external_marks is null or external_marks between 0 and 70),
  total_marks     numeric(5, 2) generated always as (coalesce(internal_marks, 0) + coalesce(external_marks, 0)) stored,
  max_marks       numeric(5, 2) not null default 100,
  grade           text,
  grade_point     numeric(3, 2) check (grade_point is null or grade_point between 0 and 10),
  result_status   public.result_status not null default 'pending',
  -- Draft/publish, same pattern as announcements: faculty enters marks, then
  -- publishes. A student never sees a row before `published = true` — see the
  -- RLS policy below, not application-layer filtering.
  published       boolean not null default false,
  published_at    timestamptz,
  entered_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (student_id, subject_id, semester, academic_year)
);

create index results_student_idx on public.semester_results (student_id, academic_year, semester);

create trigger semester_results_set_updated_at
  before update on public.semester_results
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Fee invoices — no faculty involvement by design; fees are an accounts-office
-- function in every real institution this models.
-- ---------------------------------------------------------------------------
create table public.fee_invoices (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles (id) on delete cascade,
  academic_year text not null,
  term          text not null,
  description   text not null,
  amount        numeric(10, 2) not null check (amount >= 0),
  due_date      date not null,
  status        public.fee_status not null default 'due',
  paid_amount   numeric(10, 2) not null default 0 check (paid_amount >= 0),
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index fee_invoices_student_idx on public.fee_invoices (student_id, due_date);

create trigger fee_invoices_set_updated_at
  before update on public.fee_invoices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- teaches_student(): does the calling faculty member teach this student this
-- subject? Derived from the student's own (department, study_year, section)
-- joined against timetable_slots — there is no separate "faculty roster"
-- table to keep in sync; the timetable IS the roster.
--
-- SECURITY DEFINER so it can read `profiles` regardless of the caller's RLS
-- visibility into other students' rows — the same justification as
-- current_user_role() in 0004: without this, the function could not resolve
-- the target student's section at all.
-- ---------------------------------------------------------------------------
create or replace function public.teaches_student(p_student_id uuid, p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles s
    join public.timetable_slots t
      on t.department = s.department
     and t.study_year = s.study_year
     and t.section    = s.section
     and t.subject_id = p_subject_id
    where s.id = p_student_id
      and t.faculty_id = auth.uid()
  );
$$;

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table public.subjects           enable row level security;
alter table public.timetable_slots    enable row level security;
alter table public.attendance_records enable row level security;
alter table public.semester_results   enable row level security;
alter table public.fee_invoices       enable row level security;

alter table public.subjects           force row level security;
alter table public.timetable_slots    force row level security;
alter table public.attendance_records force row level security;
alter table public.semester_results   force row level security;
alter table public.fee_invoices       force row level security;

-- --- subjects: catalog data, readable by anyone signed in, written by staff ---
create policy subjects_select on public.subjects
  for select to authenticated using (true);

create policy subjects_write on public.subjects
  for all to authenticated
  using (public.is_staff_level())
  with check (public.is_staff_level());

-- --- timetable: readable by anyone signed in, written by staff only ---
create policy timetable_select on public.timetable_slots
  for select to authenticated using (true);

create policy timetable_write on public.timetable_slots
  for all to authenticated
  using (public.is_staff_level())
  with check (public.is_staff_level());

-- --- attendance ---
create policy attendance_select on public.attendance_records
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_staff_level()
    or public.teaches_student(student_id, subject_id)
  );

-- A student can never write their own attendance — only staff or the faculty
-- member who actually teaches them, and `marked_by` must be the real caller
-- (not staff, who may be back-filling on a faculty member's behalf).
create policy attendance_insert on public.attendance_records
  for insert to authenticated
  with check (
    public.is_staff_level()
    or (public.teaches_student(student_id, subject_id) and marked_by = auth.uid())
  );

create policy attendance_update on public.attendance_records
  for update to authenticated
  using (public.is_staff_level() or public.teaches_student(student_id, subject_id))
  with check (public.is_staff_level() or public.teaches_student(student_id, subject_id));

-- Deletion is staff-only — a faculty member corrects a mistake with an update
-- (still attributed to them), not by making the record disappear.
create policy attendance_delete on public.attendance_records
  for delete to authenticated
  using (public.is_staff_level());

-- --- semester results ---
-- A published result is visible to its student; an unpublished one is visible
-- only to staff and the faculty member who owns the subject — the same
-- draft/publish visibility split as announcements.
create policy results_select on public.semester_results
  for select to authenticated
  using (
    (student_id = auth.uid() and published)
    or public.is_staff_level()
    or public.teaches_student(student_id, subject_id)
  );

create policy results_insert on public.semester_results
  for insert to authenticated
  with check (
    public.is_staff_level()
    or (public.teaches_student(student_id, subject_id) and entered_by = auth.uid())
  );

create policy results_update on public.semester_results
  for update to authenticated
  using (public.is_staff_level() or public.teaches_student(student_id, subject_id))
  with check (public.is_staff_level() or public.teaches_student(student_id, subject_id));

create policy results_delete on public.semester_results
  for delete to authenticated
  using (public.is_staff_level());

-- --- fee invoices: student reads own, staff manage all, no faculty access ---
create policy fees_select on public.fee_invoices
  for select to authenticated
  using (student_id = auth.uid() or public.is_staff_level());

create policy fees_write on public.fee_invoices
  for all to authenticated
  using (public.is_staff_level())
  with check (public.is_staff_level());

revoke all on public.subjects           from anon;
revoke all on public.timetable_slots    from anon;
revoke all on public.attendance_records from anon;
revoke all on public.semester_results   from anon;
revoke all on public.fee_invoices       from anon;

grant select                        on public.subjects           to authenticated;
grant select                        on public.timetable_slots    to authenticated;
grant select, insert, update        on public.attendance_records to authenticated;
grant select, insert, update        on public.semester_results   to authenticated;
grant select                        on public.fee_invoices       to authenticated;
-- Staff writes to subjects/timetable/fees go through the service-role client
-- from server actions (like users.manage does), not the user's own session —
-- so `authenticated` gets no insert/update/delete grant on those three tables
-- even though the policies above would allow it for a staff member. Belt and
-- braces: a bug in a future page cannot let a signed-in staff session mutate
-- these tables directly from the browser.

-- ===========================================================================
-- Staff-only oversight view — service-role only, same lockdown pattern as
-- enquiry_inbox / campaign_dashboard in 0003_functions.sql.
-- ===========================================================================
create or replace view public.academics_overview as
select
  s.department,
  s.study_year,
  s.section,
  count(distinct s.id)                                                    as student_count,
  round(avg(att.pct), 1)                                                  as avg_attendance_pct,
  count(distinct res.student_id) filter (where res.published)             as students_with_published_results,
  round(100.0 * count(f.id) filter (where f.status = 'paid') /
        nullif(count(f.id), 0), 1)                                        as fee_paid_pct
from public.profiles s
left join lateral (
  select 100.0 * count(*) filter (where a.status in ('present', 'late')) / nullif(count(*), 0) as pct
  from public.attendance_records a
  where a.student_id = s.id
) att on true
left join public.semester_results res on res.student_id = s.id
left join public.fee_invoices f on f.student_id = s.id
where s.role = 'student' and s.is_active
group by s.department, s.study_year, s.section
order by s.department, s.study_year, s.section;

revoke all on public.academics_overview from anon, authenticated;
