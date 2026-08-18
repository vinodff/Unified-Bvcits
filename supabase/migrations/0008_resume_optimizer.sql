-- BVCITS 2.0 — 0008_resume_optimizer
--
-- The AI Placement Resume Optimizer: a student pastes (or uploads) their
-- existing resume and a target job description, and gets back a rewritten
-- resume plus a before/after score, keyword coverage, a skill-gap list and an
-- evidence map showing how well the rewrite is backed by the original.
--
-- Two tables, mirroring the two lifetimes involved:
--
--   `resumes` is the student's living document — updated in place as they
--   improve it, one row per student in practice.
--
--   `resume_optimizations` is append-only history: each run against a
--   particular JD is a point-in-time snapshot, so a student can see their
--   score climb across attempts. Corrections are a new row, never an edit —
--   the same stance audit_log takes in 0002_marketing.sql.
--
-- The optimized resume is stored as `optimized_sections` jsonb rather than
-- rendered text: the app renders it from structure, which is what makes ATS
-- formatting guaranteed rather than inferred.
--
-- Ownership is denormalized onto resume_optimizations (student_id, not just
-- resume_id) for the reason 0007's header gives for class membership: it keeps
-- every RLS policy a flat equality check instead of a join through `resumes`.

-- ---------------------------------------------------------------------------
-- Resumes — the student's source document.
-- ---------------------------------------------------------------------------
create table public.resumes (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles (id) on delete cascade,
  title         text not null default 'My Resume' check (length(btrim(title)) between 1 and 120),

  -- Exactly what the student pasted or what was extracted from their upload.
  -- Kept verbatim because it is the evidence base: every claim in an optimized
  -- resume is scored against THIS text (see src/lib/resume/evidence.ts), so
  -- losing it would make the trust score unverifiable after the fact.
  original_text text not null default '',

  -- The parsed structure of `original_text`. Shape lives in
  -- src/lib/resume/types.ts, not enforced in SQL — the same division of labour
  -- as campaign_facts.value in 0002_marketing.sql.
  sections      jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index resumes_student_idx on public.resumes (student_id, updated_at desc);

create trigger resumes_set_updated_at
  before update on public.resumes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Optimizations — one row per "improve this resume for that job" run.
-- ---------------------------------------------------------------------------
create table public.resume_optimizations (
  id                    uuid primary key default gen_random_uuid(),
  resume_id             uuid not null references public.resumes (id) on delete cascade,
  student_id            uuid not null references public.profiles (id) on delete cascade,

  -- The target. jd_text is always populated (fetching a URL stores what was
  -- fetched), so a run stays reproducible even if the posting goes offline.
  jd_text               text not null check (length(btrim(jd_text)) > 0),
  jd_url                text,
  -- Optional free-text from the student: "I led a team of 6 but forgot to add it".
  extra_notes           text,

  -- Headline scores. `before` is computed from the original, `after` from the
  -- rewrite, using the identical scoring function — that is what makes the
  -- delta meaningful rather than a marketing number.
  before_score          smallint not null check (before_score between 0 and 100),
  after_score           smallint not null check (after_score between 0 and 100),
  -- { keywordMatch, atsCompatibility, impactLanguage, roleAlignment } for each side.
  before_subscores      jsonb not null default '{}'::jsonb,
  after_subscores       jsonb not null default '{}'::jsonb,

  matched_skills        text[] not null default '{}',
  missing_skills        text[] not null default '{}',
  keyword_coverage      jsonb not null default '{}'::jsonb,

  -- Evidence: how well the rewrite's claims are backed by original_text.
  trust_score           smallint not null default 0 check (trust_score between 0 and 100),
  evidence              jsonb not null default '[]'::jsonb,
  skill_gaps            jsonb not null default '[]'::jsonb,

  optimized_sections    jsonb not null default '{}'::jsonb,

  created_at            timestamptz not null default now()
);

create index resume_optimizations_resume_idx  on public.resume_optimizations (resume_id, created_at desc);
create index resume_optimizations_student_idx on public.resume_optimizations (student_id, created_at desc);

-- ===========================================================================
-- RLS — strictly private, the same posture as opportunity_saves in 0006: a
-- student's resume and the jobs they are targeting is personal data. There is
-- deliberately NO staff read policy here, unlike announcements / opportunities
-- / semester_results, which all have an oversight path. Placement statistics,
-- if ever needed, belong in an aggregate view rather than widening this.
-- ===========================================================================

alter table public.resumes              enable row level security;
alter table public.resumes              force row level security;
alter table public.resume_optimizations enable row level security;
alter table public.resume_optimizations force row level security;

create policy resumes_select_own on public.resumes
  for select to authenticated using (student_id = auth.uid());

create policy resumes_insert_own on public.resumes
  for insert to authenticated with check (student_id = auth.uid());

create policy resumes_update_own on public.resumes
  for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy resumes_delete_own on public.resumes
  for delete to authenticated using (student_id = auth.uid());

create policy resume_optimizations_select_own on public.resume_optimizations
  for select to authenticated using (student_id = auth.uid());

create policy resume_optimizations_insert_own on public.resume_optimizations
  for insert to authenticated with check (student_id = auth.uid());

create policy resume_optimizations_delete_own on public.resume_optimizations
  for delete to authenticated using (student_id = auth.uid());

-- No update policy: a run is a snapshot. A student may still delete an old run
-- to declutter their history, which is why delete is granted and update is not.

revoke all on public.resumes              from anon;
revoke all on public.resume_optimizations from anon;

grant select, insert, update, delete on public.resumes              to authenticated;
grant select, insert, delete         on public.resume_optimizations to authenticated;
