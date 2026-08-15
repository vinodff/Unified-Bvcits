-- BVCITS 2.0 — 0001_core
-- Public-facing capture: admission enquiries and campus-assistant query logs.
-- These are the two surfaces where visitor data currently evaporates:
-- EnquiryForm.tsx never submitted anywhere, and the assistant answered without
-- recording which questions it failed to answer.
--
-- Anon writes go through SECURITY DEFINER RPCs (0003_functions.sql), never
-- through direct table grants, so the publishable key can insert but never read.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at honest without trusting the caller.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admission enquiries
-- ---------------------------------------------------------------------------
create type public.enquiry_status as enum (
  'new',
  'contacted',
  'converted',
  'closed',
  'spam'
);

create table public.admission_enquiries (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null check (length(btrim(full_name)) between 2 and 120),
  mobile         text not null check (mobile ~ '^[0-9+][0-9 +()-]{6,19}$'),
  email          text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  program        text check (program is null or length(program) <= 120),
  message        text check (message is null or length(message) <= 2000),

  -- Where on the site the enquiry came from, for attribution.
  source_path    text check (source_path is null or length(source_path) <= 200),

  status         public.enquiry_status not null default 'new',
  handled_by     text,
  handled_at     timestamptz,
  notes          text,

  -- Abuse controls. The raw IP is never stored — only a salted hash, so the
  -- rate limiter can count repeats without the table becoming PII-heavier
  -- than the enquiry itself.
  ip_hash        text,
  user_agent     text check (user_agent is null or length(user_agent) <= 400),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index admission_enquiries_status_created_idx
  on public.admission_enquiries (status, created_at desc);
create index admission_enquiries_created_idx
  on public.admission_enquiries (created_at desc);
-- Supports the per-IP flood check in submit_admission_enquiry().
create index admission_enquiries_ip_recent_idx
  on public.admission_enquiries (ip_hash, created_at desc)
  where ip_hash is not null;

create trigger admission_enquiries_set_updated_at
  before update on public.admission_enquiries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Campus assistant telemetry
--
-- The assistant is grounded retrieval, not a generative model, so the single
-- most valuable thing to record is which questions it could NOT answer —
-- that list is the backlog for src/lib/campus-agent/answers.ts.
-- ---------------------------------------------------------------------------
create table public.assistant_sessions (
  id               uuid primary key default gen_random_uuid(),
  -- Client-generated, so one browser tab's turns group together.
  client_session_id text not null,
  locale           text not null default 'en' check (locale in ('en', 'te')),
  user_agent       text check (user_agent is null or length(user_agent) <= 400),
  ip_hash          text,
  started_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now()
);

create unique index assistant_sessions_client_id_idx
  on public.assistant_sessions (client_session_id);

create table public.assistant_queries (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.assistant_sessions (id) on delete cascade,

  query_text     text not null check (length(query_text) between 1 and 400),
  -- Output of src/lib/campus-agent/normalize.ts, for dedup across phrasings.
  normalized     text,
  locale         text not null default 'en' check (locale in ('en', 'te')),

  intent         text,
  department     text,
  confidence     numeric(4, 3) check (confidence is null or confidence between 0 and 1),

  answered       boolean not null default false,
  -- 'facts' | 'answers' | 'catalog' | 'gemini' | 'fallback'
  answer_source  text,
  latency_ms     integer check (latency_ms is null or latency_ms >= 0),

  created_at     timestamptz not null default now()
);

create index assistant_queries_session_idx
  on public.assistant_queries (session_id, created_at);
create index assistant_queries_created_idx
  on public.assistant_queries (created_at desc);
-- The gap report: unanswered questions, most recent first.
create index assistant_queries_unanswered_idx
  on public.assistant_queries (created_at desc)
  where answered = false;
create index assistant_queries_normalized_idx
  on public.assistant_queries (normalized)
  where normalized is not null;

-- ---------------------------------------------------------------------------
-- RLS: deny-all by default. No policies are created for these tables, so the
-- anon and authenticated roles can do nothing directly. Writes happen only via
-- the SECURITY DEFINER functions in 0003; reads happen only via the service
-- role, which bypasses RLS entirely.
-- ---------------------------------------------------------------------------
alter table public.admission_enquiries enable row level security;
alter table public.assistant_sessions  enable row level security;
alter table public.assistant_queries   enable row level security;

alter table public.admission_enquiries force row level security;
alter table public.assistant_sessions  force row level security;
alter table public.assistant_queries   force row level security;

revoke all on public.admission_enquiries from anon, authenticated;
revoke all on public.assistant_sessions  from anon, authenticated;
revoke all on public.assistant_queries   from anon, authenticated;
