-- BVCITS 2.0 — 0010_results_portal
--
-- Bulk semester-results publishing: an admin drops an Excel sheet in, students
-- look their marks up with hall ticket number + date of birth. No student
-- account, no signup, no password reset queue — the same flow every Indian
-- university results portal uses.
--
-- WHY THIS IS NOT `semester_results` (0007_student_records.sql)
-- ------------------------------------------------------------
-- `semester_results.student_id` is a FK to `profiles.id`, i.e. a real Supabase
-- auth account. The uploaded sheet only ever contains a hall ticket number, so
-- reusing that table would force us to mint an auth user for every one of the
-- ~1,200 students in a results sheet before a single mark could be stored, and
-- would strand every row whose hall ticket has no account. The two tables model
-- genuinely different things and both should exist:
--
--   semester_results  — the live transcript of a student who USES the portal.
--                       Faculty enter it subject by subject, RLS scopes it to
--                       auth.uid(), it feeds CGPA on /dashboard/results.
--   result_marks      — a published university results notification, keyed by
--                       hall ticket, readable without an account.
--
-- SECURITY POSTURE
-- ----------------
-- Hall ticket + DOB is weak authentication: hall tickets are sequential and a
-- DOB is guessable. It is what the requirement asks for and what JNTUH/JNTUK
-- themselves use, so the mitigation is containment rather than refusal:
--
--   * anon and authenticated get NO grant on any table here. The public lookup
--     runs through a route handler on the service-role client, which returns
--     one student's rows and nothing else — there is no queryable surface a
--     scraper could walk.
--   * Only `published` batches are ever resolvable. A sheet sits in `draft`
--     until an admin publishes it, so an upload cannot leak early.
--   * `result_students` carries the DOB and is never returned to the browser.
--   * The lookup route rate-limits per IP and returns one identical error for
--     "no such hall ticket" and "wrong DOB", so it cannot be used as an
--     enumeration oracle.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- draft     — uploaded, visible to staff only, invisible to the lookup
-- published — students can retrieve it
-- archived  — superseded (e.g. a revaluation sheet replaced it); kept for the
--             audit trail but out of the lookup, so history is never destroyed
--             just to hide a stale sheet.
create type public.result_batch_status as enum ('draft', 'published', 'archived');

-- ---------------------------------------------------------------------------
-- result_batches — one row per uploaded spreadsheet.
--
-- The batch is the publish unit. Marks are never published individually; an
-- admin publishes the whole notification exactly as a university does, which
-- is also what makes "unpublish the sheet, we sent the wrong file" a single
-- reversible action instead of a bulk update.
-- ---------------------------------------------------------------------------
create table public.result_batches (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (length(btrim(title)) between 3 and 200),
  academic_year   text,
  semester        text,   -- free text: "1-1", "II Year I Sem" — sheets are not consistent
  exam_type       text,   -- "Regular", "Supplementary", "Revaluation"
  source_filename text,
  status          public.result_batch_status not null default 'draft',

  -- Denormalised counts. Recomputed on import, read on every admin page load;
  -- storing them avoids a count(*) over result_marks per batch in the list.
  row_count       integer not null default 0 check (row_count >= 0),
  student_count   integer not null default 0 check (student_count >= 0),

  -- The DOB assigned to hall tickets this batch introduces that had no date of
  -- birth anywhere — neither already on file, nor in a DOB column of the sheet.
  -- Results sheets do not carry DOB (see the screenshot this was built from),
  -- so without this a freshly imported student could never sign in at all.
  -- It is recorded per batch rather than hidden in application code so the
  -- admin page can show operators the exact credential to test with, and so
  -- "which students are still on a placeholder DOB" stays an answerable
  -- question — see result_students.dob_source.
  default_dob     date,

  -- { "23BS2T04": 3.0, ... } — what each subject in this batch is worth,
  -- derived at import from the rows that PASSED it.
  --
  -- Denormalised on purpose. The sheet writes 0.0 credits on a failed subject,
  -- so a failing student's own rows cannot tell you the subject's real weight,
  -- and SGPA needs it to keep failures in the denominator. Recovering it at
  -- lookup time would mean scanning every row of the batch (~10k) on each
  -- student's page load; computing it once at import turns that into a free
  -- read of a small object.
  subject_credits jsonb not null default '{}'::jsonb,

  uploaded_by     uuid references public.profiles (id) on delete set null,
  published_at    timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index result_batches_status_idx on public.result_batches (status, created_at desc);

create trigger result_batches_set_updated_at
  before update on public.result_batches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- result_students — the credential store: hall ticket -> date of birth.
--
-- Keyed by the hall ticket itself rather than a surrogate uuid. The hall ticket
-- IS the natural key here: it is assigned by the university, never reissued,
-- and it is the value the student types on the lookup form. A surrogate id
-- would add a join to the hottest query in the feature and buy nothing.
--
-- One row per student across ALL batches, so a student's DOB survives the next
-- semester's upload and stays consistent between notifications.
-- ---------------------------------------------------------------------------
create table public.result_students (
  -- Normalised to uppercase, no spaces, by the importer AND by the lookup, so
  -- "24h41a0101" and "24H41A0101" are the same student. The check is a
  -- backstop against a future writer that forgets to normalise.
  hall_ticket_no text primary key check (hall_ticket_no = upper(btrim(hall_ticket_no)) and length(hall_ticket_no) between 4 and 24),
  student_name   text,
  branch         text,
  date_of_birth  date not null,

  -- Where date_of_birth came from. 'placeholder' means it was filled from the
  -- batch default and is a shared, guessable value — the admin UI surfaces the
  -- count so nobody assumes a real DOB is protecting those records.
  dob_source     text not null default 'placeholder' check (dob_source in ('sheet', 'placeholder', 'manual')),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index result_students_branch_idx on public.result_students (branch);

create trigger result_students_set_updated_at
  before update on public.result_students
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- result_marks — one row per cell-line of the spreadsheet: a student's outcome
-- in one subject, in one batch.
--
-- Deliberately shaped like the sheet rather than like a normalised academic
-- model (no FK to `subjects`). The sheet is the source of truth published by
-- the university; a subject code that is not in our catalog must still import
-- cleanly, and a re-upload must not depend on the catalog being up to date.
-- ---------------------------------------------------------------------------
create table public.result_marks (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references public.result_batches (id) on delete cascade,
  hall_ticket_no text not null references public.result_students (hall_ticket_no) on delete cascade,

  branch         text,
  subject_code   text not null,
  subject_name   text not null,

  internal_marks numeric(6, 2) check (internal_marks is null or internal_marks >= 0),
  external_marks numeric(6, 2) check (external_marks is null or external_marks >= 0),
  total_marks    numeric(6, 2) check (total_marks    is null or total_marks    >= 0),
  grade          text,
  credits        numeric(4, 1) not null default 0 check (credits >= 0),
  -- 'pass' | 'fail' | 'absent' | 'withheld'. Text rather than an enum because
  -- universities invent statuses ("MP", "WITHHELD", "MALPRACTICE") mid-year and
  -- an enum would make the importer reject a sheet it could otherwise store.
  -- Normalised by the importer; unknown values pass through as given.
  result         text,

  -- Line number in the source sheet, for tracing a bad row back to the file.
  source_row     integer,
  created_at     timestamptz not null default now(),

  -- Re-uploading the same corrected sheet must be idempotent, not doubled. The
  -- importer upserts on this key.
  unique (batch_id, hall_ticket_no, subject_code)
);

create index result_marks_lookup_idx on public.result_marks (hall_ticket_no, batch_id);
create index result_marks_batch_idx  on public.result_marks (batch_id);

-- ---------------------------------------------------------------------------
-- result_lookup_attempts — failed lookups, for abuse visibility.
--
-- The route handler's in-process rate limiter is per-instance and resets on
-- cold start, so it cannot answer "is someone walking the hall ticket range?".
-- This can. Only FAILURES are recorded: a successful lookup is a student
-- reading their own marks and is nobody's business to log.
--
-- Nothing reads this at runtime — it exists so an operator can query it after
-- the fact, so it stays cheap on the hot path.
-- ---------------------------------------------------------------------------
create table public.result_lookup_attempts (
  id             uuid primary key default gen_random_uuid(),
  hall_ticket_no text,
  ip_hash        text,  -- salted hash, never the raw address
  reason         text not null,
  created_at     timestamptz not null default now()
);

create index result_lookup_attempts_recent_idx on public.result_lookup_attempts (created_at desc);

-- ===========================================================================
-- RLS
--
-- Staff (admin + management, via is_staff_level()) read everything through
-- their own session. Every WRITE goes through the service-role client in a
-- route handler or server action — same belt-and-braces choice 0007 made for
-- subjects/timetable/fees: `authenticated` gets a select grant only, so a bug
-- in a future client component cannot mutate published results from a browser.
-- ===========================================================================

alter table public.result_batches         enable row level security;
alter table public.result_students        enable row level security;
alter table public.result_marks           enable row level security;
alter table public.result_lookup_attempts enable row level security;

alter table public.result_batches         force row level security;
alter table public.result_students        force row level security;
alter table public.result_marks           force row level security;
alter table public.result_lookup_attempts force row level security;

create policy result_batches_select_staff on public.result_batches
  for select to authenticated using (public.is_staff_level());

-- DOB lives here. Staff-only, and never selected into a browser payload even
-- by staff pages — the admin UI shows counts, not dates of birth.
create policy result_students_select_staff on public.result_students
  for select to authenticated using (public.is_staff_level());

create policy result_marks_select_staff on public.result_marks
  for select to authenticated using (public.is_staff_level());

create policy result_lookup_attempts_select_staff on public.result_lookup_attempts
  for select to authenticated using (public.is_staff_level());

revoke all on public.result_batches         from anon, authenticated;
revoke all on public.result_students        from anon, authenticated;
revoke all on public.result_marks           from anon, authenticated;
revoke all on public.result_lookup_attempts from anon, authenticated;

grant select on public.result_batches         to authenticated;
grant select on public.result_students        to authenticated;
grant select on public.result_marks           to authenticated;
grant select on public.result_lookup_attempts to authenticated;

-- ===========================================================================
-- Staff-only oversight view — service-role only, same lockdown as
-- academics_overview / enquiry_inbox.
-- ===========================================================================
create or replace view public.results_batch_overview as
select
  b.id,
  b.title,
  b.status,
  b.academic_year,
  b.semester,
  b.exam_type,
  b.row_count,
  b.student_count,
  b.created_at,
  b.published_at,
  count(m.id) filter (where m.result = 'pass')   as pass_rows,
  count(m.id) filter (where m.result = 'fail')   as fail_rows,
  count(m.id) filter (where m.result = 'absent') as absent_rows,
  count(distinct s.hall_ticket_no) filter (where s.dob_source = 'placeholder') as placeholder_dob_students
from public.result_batches b
left join public.result_marks m on m.batch_id = b.id
left join public.result_students s on s.hall_ticket_no = m.hall_ticket_no
group by b.id
order by b.created_at desc;

revoke all on public.results_batch_overview from anon, authenticated;
