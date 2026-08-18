-- BVCITS 2.0 — 0006_exam_portal
-- AI-Powered Predicted Exam Generation System (placement preparation portal).
--
-- Pipeline: admin creates exam -> AI research/extract/process/review/generate ->
-- faculty review -> approve -> publish -> students take exam -> results/analytics.
--
-- Security posture mirrors 0004: the database never trusts the client. Students
-- can only insert and read their OWN attempt rows; scoring and every mutation
-- happen server-side through route handlers using the service role, so a
-- tampered client cannot edit its score, see answers ahead of time, or touch
-- another student's attempt. Question answers are hidden from students at the
-- RLS level entirely (no student policy on `questions`).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.exam_status as enum (
  'draft',          -- created, nothing run yet
  'researching',    -- web search agent running
  'extracting',     -- data extraction agent running
  'processing',     -- data processing agent running
  'reviewing',      -- AI reviewer agent running
  'generating',     -- paper generation agent running
  'review',         -- paper ready for faculty review
  'approved',       -- faculty approved, not yet published
  'published',      -- students can attempt
  'failed'
);

create type public.pipeline_step as enum ('research', 'extract', 'process', 'review', 'generate');
create type public.step_status as enum ('pending', 'running', 'done', 'failed');

create type public.question_difficulty as enum ('easy', 'medium', 'hard');

create type public.paper_status as enum ('draft', 'review', 'approved', 'published', 'archived');

-- NB: named exam_attempt_status because `attempt_status` (success/failure/
-- retryable) already exists from 0002_marketing.sql (publish_attempts).
create type public.exam_attempt_status as enum ('in_progress', 'submitted', 'auto_submitted', 'abandoned');

-- ---------------------------------------------------------------------------
-- Exam definitions — the admin-created request that drives the pipeline
-- ---------------------------------------------------------------------------
create table public.exam_definitions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 2 and 120),
  description   text,
  status        public.exam_status not null default 'draft',
  error_message text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index exam_definitions_status_idx on public.exam_definitions (status, created_at desc);

create trigger exam_definitions_set_updated_at
  before update on public.exam_definitions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Exam research — every artifact the AI pipeline produced, one row per exam
-- ---------------------------------------------------------------------------
create table public.exam_research (
  id                uuid primary key default gen_random_uuid(),
  exam_id           uuid not null unique references public.exam_definitions (id) on delete cascade,
  pattern           jsonb not null default '{}'::jsonb,   -- sections, duration, marking scheme
  sources           jsonb not null default '[]'::jsonb,   -- URLs / corpora consulted
  raw_material      jsonb not null default '[]'::jsonb,   -- extracted, unprocessed questions
  processed_dataset jsonb not null default '[]'::jsonb,   -- cleaned, deduped, categorized bank
  reviewer_insights jsonb not null default '{}'::jsonb,   -- weightage, trends, predictions
  blueprint         jsonb not null default '{}'::jsonb,   -- the review-approved paper spec
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger exam_research_set_updated_at
  before update on public.exam_research
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Pipeline step ledger — what the admin UI polls for progress
-- ---------------------------------------------------------------------------
create table public.exam_pipeline_steps (
  id          uuid primary key default gen_random_uuid(),
  exam_id     uuid not null references public.exam_definitions (id) on delete cascade,
  step        public.pipeline_step not null,
  status      public.step_status not null default 'pending',
  message     text,
  started_at  timestamptz,
  finished_at timestamptz,
  unique (exam_id, step)
);

-- ---------------------------------------------------------------------------
-- Question bank — one shared bank per exam
-- ---------------------------------------------------------------------------
create table public.questions (
  id             uuid primary key default gen_random_uuid(),
  exam_id        uuid not null references public.exam_definitions (id) on delete cascade,
  topic          text not null,
  subtopic       text,
  question_text  text not null check (length(btrim(question_text)) between 5 and 4000),
  options        jsonb not null check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 6
    and jsonb_typeof(options -> 0) = 'string'
  ),
  answer         integer not null check (answer >= 0 and answer < jsonb_array_length(options)),
  explanation    text,
  difficulty     public.question_difficulty not null default 'medium',
  source         text,
  source_type    text not null default 'ai' check (source_type in ('pyq', 'ai', 'faculty', 'seed')),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index questions_exam_idx on public.questions (exam_id, topic);
create index questions_exam_difficulty_idx on public.questions (exam_id, difficulty);

create trigger questions_set_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Generated papers + their question membership
-- ---------------------------------------------------------------------------
create table public.papers (
  id               uuid primary key default gen_random_uuid(),
  exam_id          uuid not null references public.exam_definitions (id) on delete cascade,
  title            text not null check (length(btrim(title)) between 3 and 200),
  description      text,
  duration_minutes integer not null check (duration_minutes between 1 and 600),
  sections         jsonb not null default '[]'::jsonb,  -- from the blueprint
  status           public.paper_status not null default 'draft',
  total_marks      numeric(7, 2) not null default 0,
  created_by       uuid references public.profiles (id) on delete set null,
  reviewed_by      uuid references public.profiles (id) on delete set null,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index papers_exam_status_idx on public.papers (exam_id, status);

create trigger papers_set_updated_at
  before update on public.papers
  for each row execute function public.set_updated_at();

create table public.paper_questions (
  id          uuid primary key default gen_random_uuid(),
  paper_id    uuid not null references public.papers (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  order_no    integer not null check (order_no >= 1),
  marks       numeric(6, 2) not null default 1 check (marks > 0),
  unique (paper_id, question_id),
  unique (paper_id, order_no)
);

create index paper_questions_paper_idx on public.paper_questions (paper_id, order_no);

-- ---------------------------------------------------------------------------
-- Attempts — one row per student sitting, answers stored separately
-- ---------------------------------------------------------------------------
create table public.exam_attempts (
  id              uuid primary key default gen_random_uuid(),
  paper_id        uuid not null references public.papers (id) on delete cascade,
  student_id      uuid not null references public.profiles (id) on delete cascade,
  started_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  status          public.exam_attempt_status not null default 'in_progress',
  score           numeric(7, 2) not null default 0,
  total_marks     numeric(7, 2) not null default 0,
  percent         numeric(6, 2),
  percentile      numeric(6, 2),
  time_taken_sec  integer,
  violation_count integer not null default 0,
  violations      jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index exam_attempts_student_idx on public.exam_attempts (student_id, started_at desc);
create index exam_attempts_paper_idx on public.exam_attempts (paper_id, status);

create table public.attempt_answers (
  id                 uuid primary key default gen_random_uuid(),
  attempt_id         uuid not null references public.exam_attempts (id) on delete cascade,
  paper_question_id  uuid not null references public.paper_questions (id) on delete cascade,
  selected_index     integer check (selected_index is null or selected_index between 0 and 5),
  is_correct         boolean,
  marks_obtained     numeric(6, 2) not null default 0,
  time_taken_sec     integer,
  marked_for_review  boolean not null default false,
  answered           boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (attempt_id, paper_question_id)
);

create index attempt_answers_attempt_idx on public.attempt_answers (attempt_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
/** Staff who run the placement portal: admin manages, faculty reviews. */
create or replace function public.is_exam_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() in ('admin', 'faculty'), false);
$$;

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table public.exam_definitions     enable row level security;
alter table public.exam_research        enable row level security;
alter table public.exam_pipeline_steps  enable row level security;
alter table public.questions            enable row level security;
alter table public.papers               enable row level security;
alter table public.paper_questions      enable row level security;
alter table public.exam_attempts        enable row level security;
alter table public.attempt_answers      enable row level security;

alter table public.exam_definitions     force row level security;
alter table public.exam_research        force row level security;
alter table public.exam_pipeline_steps  force row level security;
alter table public.questions            force row level security;
alter table public.papers               force row level security;
alter table public.paper_questions      force row level security;
alter table public.exam_attempts        force row level security;
alter table public.attempt_answers      force row level security;

-- --- exam_definitions ---
-- Students see published (or approved) exams only; staff see everything.
create policy exam_definitions_select_staff on public.exam_definitions
  for select to authenticated
  using (public.is_exam_staff());

create policy exam_definitions_select_published on public.exam_definitions
  for select to authenticated
  using (status in ('published', 'approved'));

create policy exam_definitions_insert_admin on public.exam_definitions
  for insert to authenticated
  with check (public.current_user_role() = 'admin');

create policy exam_definitions_update_admin on public.exam_definitions
  for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy exam_definitions_delete_admin on public.exam_definitions
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- --- exam_research --- (contains raw answers — staff only, always)
create policy exam_research_select_staff on public.exam_research
  for select to authenticated
  using (public.is_exam_staff());

create policy exam_research_insert_staff on public.exam_research
  for insert to authenticated
  with check (public.is_exam_staff());

create policy exam_research_update_staff on public.exam_research
  for update to authenticated
  using (public.is_exam_staff())
  with check (public.is_exam_staff());

create policy exam_research_delete_staff on public.exam_research
  for delete to authenticated
  using (public.is_exam_staff());

-- --- exam_pipeline_steps ---
create policy exam_pipeline_steps_select_staff on public.exam_pipeline_steps
  for select to authenticated
  using (public.is_exam_staff());

create policy exam_pipeline_steps_insert_staff on public.exam_pipeline_steps
  for insert to authenticated
  with check (public.is_exam_staff());

create policy exam_pipeline_steps_update_staff on public.exam_pipeline_steps
  for update to authenticated
  using (public.is_exam_staff())
  with check (public.is_exam_staff());

create policy exam_pipeline_steps_delete_staff on public.exam_pipeline_steps
  for delete to authenticated
  using (public.is_exam_staff());

-- --- questions --- (answers live here — students get no policy at all)
create policy questions_select_staff on public.questions
  for select to authenticated
  using (public.is_exam_staff());

create policy questions_insert_staff on public.questions
  for insert to authenticated
  with check (public.is_exam_staff());

create policy questions_update_staff on public.questions
  for update to authenticated
  using (public.is_exam_staff())
  with check (public.is_exam_staff());

create policy questions_delete_staff on public.questions
  for delete to authenticated
  using (public.is_exam_staff());

-- --- papers ---
create policy papers_select_staff on public.papers
  for select to authenticated
  using (public.is_exam_staff());

create policy papers_select_published on public.papers
  for select to authenticated
  using (status = 'published');

create policy papers_insert_admin on public.papers
  for insert to authenticated
  with check (public.current_user_role() = 'admin');

create policy papers_update_staff on public.papers
  for update to authenticated
  using (public.is_exam_staff())
  with check (public.is_exam_staff());

create policy papers_delete_staff on public.papers
  for delete to authenticated
  using (public.is_exam_staff());

-- --- paper_questions ---
create policy paper_questions_select_staff on public.paper_questions
  for select to authenticated
  using (public.is_exam_staff());

create policy paper_questions_insert_staff on public.paper_questions
  for insert to authenticated
  with check (public.is_exam_staff());

create policy paper_questions_update_staff on public.paper_questions
  for update to authenticated
  using (public.is_exam_staff())
  with check (public.is_exam_staff());

create policy paper_questions_delete_staff on public.paper_questions
  for delete to authenticated
  using (public.is_exam_staff());

-- --- exam_attempts ---
-- Students: read + create their own rows ONLY. Every mutation (submit, score,
-- violations) goes through route handlers with the service role.
create policy exam_attempts_select_own on public.exam_attempts
  for select to authenticated
  using (student_id = auth.uid());

create policy exam_attempts_select_staff on public.exam_attempts
  for select to authenticated
  using (public.is_exam_staff());

create policy exam_attempts_insert_own on public.exam_attempts
  for insert to authenticated
  with check (student_id = auth.uid());

create policy exam_attempts_update_staff on public.exam_attempts
  for update to authenticated
  using (public.is_exam_staff())
  with check (public.is_exam_staff());

create policy exam_attempts_delete_staff on public.exam_attempts
  for delete to authenticated
  using (public.is_exam_staff());

-- --- attempt_answers ---
create policy attempt_answers_select_own on public.attempt_answers
  for select to authenticated
  using (exists (
    select 1 from public.exam_attempts a
    where a.id = attempt_id and a.student_id = auth.uid()
  ));

create policy attempt_answers_select_staff on public.attempt_answers
  for select to authenticated
  using (public.is_exam_staff());

create policy attempt_answers_insert_own on public.attempt_answers
  for insert to authenticated
  with check (exists (
    select 1 from public.exam_attempts a
    where a.id = attempt_id and a.student_id = auth.uid()
  ));

create policy attempt_answers_update_staff on public.attempt_answers
  for update to authenticated
  using (public.is_exam_staff())
  with check (public.is_exam_staff());

create policy attempt_answers_delete_staff on public.attempt_answers
  for delete to authenticated
  using (public.is_exam_staff());

-- anon gets nothing on any table.
revoke all on public.exam_definitions    from anon;
revoke all on public.exam_research       from anon;
revoke all on public.exam_pipeline_steps from anon;
revoke all on public.questions           from anon;
revoke all on public.papers              from anon;
revoke all on public.paper_questions     from anon;
revoke all on public.exam_attempts       from anon;
revoke all on public.attempt_answers     from anon;

grant select, insert, update, delete on
  public.exam_definitions,
  public.exam_research,
  public.exam_pipeline_steps,
  public.questions,
  public.papers,
  public.paper_questions,
  public.exam_attempts,
  public.attempt_answers
  to authenticated;
