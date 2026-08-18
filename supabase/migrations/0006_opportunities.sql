-- BVCITS 2.0 — 0006_opportunities
--
-- The opportunity discovery pipeline: verified jobs, internships, hackathons,
-- scholarships and campus programmes gathered from the open web and surfaced in
-- the student dashboard.
--
-- Security posture: **the open web is untrusted input.** Rows arrive from a
-- scraper, so the database does not assume the pipeline behaved. Two controls
-- enforce that independently of application code:
--
--   1. A row is only visible to a student when `status = 'verified'` AND its
--      deadline has not passed — see is_opportunity_visible() and the RLS
--      policy that calls it. A `pending` row is invisible by construction, so a
--      bug that forgets to filter cannot leak an unverified posting.
--   2. A CHECK constraint refuses to store `status = 'verified'` on a row whose
--      source_tier is 'unknown' or 'blocked'. Even a direct service-role insert
--      cannot publish a link shortener. The TypeScript rules in
--      src/lib/opportunities/verify.ts are the first line; this is the floor.
--
-- Writes are service-role only. Students never insert here; they insert into
-- opportunity_saves, which is scoped to their own account.

-- ---------------------------------------------------------------------------
-- Enums — mirror the derived unions in src/lib/opportunities/types.ts
-- ---------------------------------------------------------------------------
create type public.opportunity_kind as enum (
  'internship',
  'job',
  'hackathon',
  'competition',
  'event',
  'webinar',
  'workshop',
  'ambassador',
  'scholarship',
  'fellowship'
);

create type public.opportunity_status as enum ('pending', 'verified', 'rejected');

create type public.opportunity_source_tier as enum (
  'official',    -- the employer/organiser or the ATS they hired
  'aggregator',  -- a real job board carrying a second-hand listing
  'unknown',     -- unclassified domain — never publishable without review
  'blocked'      -- shortener or chat invite — never publishable at all
);

-- ---------------------------------------------------------------------------
-- Opportunities
-- ---------------------------------------------------------------------------
create table public.opportunities (
  id            uuid primary key default gen_random_uuid(),

  title         text not null check (length(btrim(title)) between 3 and 240),
  organization  text not null check (length(btrim(organization)) between 2 and 160),
  kind          public.opportunity_kind not null,

  apply_url     text not null check (apply_url ~ '^https?://'),
  source_url    text,

  -- Deduplication.
  --
  -- url_fingerprint is the canonicalised apply URL (host + path + meaningful
  -- query, tracking parameters stripped) and is UNIQUE: the same posting reached
  -- via three different tracking links is one row, not three.
  --
  -- content_fingerprint is the normalised organisation + title, and is
  -- deliberately NOT unique — two genuinely different roles at one company can
  -- normalise alike. The pipeline uses it to notice that a posting already seen
  -- on a company site has now also appeared on a job board, and increments
  -- `corroborations` instead of inserting a duplicate.
  url_fingerprint     text not null,
  content_fingerprint text not null,
  corroborations      smallint not null default 1 check (corroborations >= 0),

  location      text,
  work_mode     text check (work_mode is null or work_mode in ('onsite', 'remote', 'hybrid')),
  eligibility   text,
  skills        text[] not null default '{}',
  description   text,

  deadline      date,
  posted_at     date,

  status        public.opportunity_status not null default 'pending',
  source_tier   public.opportunity_source_tier not null default 'unknown',

  -- Why the verifier ruled the way it did. Kept on the row so a rejection can
  -- be audited and argued with, rather than silently disappearing.
  signals       text[] not null default '{}',

  discovered_at timestamptz not null default now(),
  verified_at   timestamptz,
  updated_at    timestamptz not null default now(),

  -- The floor described in the header: an unverifiable source can never carry
  -- a published status, whatever the caller asked for.
  constraint opportunities_verified_needs_trusted_source
    check (status <> 'verified' or source_tier in ('official', 'aggregator'))
);

create unique index opportunities_url_fingerprint_idx
  on public.opportunities (url_fingerprint);

create index opportunities_content_fingerprint_idx
  on public.opportunities (content_fingerprint);

-- The student feed: open, verified rows ordered by how soon they close.
create index opportunities_open_feed_idx
  on public.opportunities (deadline nulls last, discovered_at desc)
  where status = 'verified';

create index opportunities_kind_idx on public.opportunities (kind) where status = 'verified';
create index opportunities_skills_idx on public.opportunities using gin (skills);

create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

/**
 * True when an opportunity should appear in a student's feed.
 *
 * SECURITY DEFINER and marked stable to match the house style established by
 * can_read_announcement() in 0004. An expired posting is treated as invisible
 * rather than deleted: the row still matters for deduplication (so the same
 * closed drive is not rediscovered every night) and for the saved-items list of
 * a student who already applied to it.
 */
create or replace function public.is_opportunity_visible(
  p_status   public.opportunity_status,
  p_deadline date
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_status = 'verified'
     and (p_deadline is null or p_deadline >= current_date);
$$;

-- ---------------------------------------------------------------------------
-- Saves — bookmarks and the application tracker in one table
--
-- The tracker states are a superset of "saved", so splitting them across two
-- tables would mean a student who applies to something they never bookmarked
-- has a row in one and not the other. One row per (user, opportunity) with a
-- status keeps "saved" and "applied" as the same object at different stages.
-- ---------------------------------------------------------------------------
create table public.opportunity_saves (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,

  status         text not null default 'saved'
                 check (status in ('saved', 'applied', 'shortlisted', 'rejected', 'accepted')),
  note           text check (note is null or length(note) <= 2000),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  primary key (user_id, opportunity_id)
);

create index opportunity_saves_user_idx on public.opportunity_saves (user_id, status);

create trigger opportunity_saves_set_updated_at
  before update on public.opportunity_saves
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table public.opportunities     enable row level security;
alter table public.opportunities     force row level security;
alter table public.opportunity_saves enable row level security;
alter table public.opportunity_saves force row level security;

-- --- opportunities ---

-- Students and every other signed-in role see only what passed verification
-- and is still open.
create policy opportunities_select_visible on public.opportunities
  for select to authenticated
  using (public.is_opportunity_visible(status, deadline));

-- Oversight, mirroring the reasoning in 0005: management and admin can see
-- pending and rejected rows too, because the people answerable for the platform
-- must be able to audit what the filter published AND what it threw away.
create policy opportunities_select_staff on public.opportunities
  for select to authenticated
  using (public.is_staff_level());

-- Moderation. Discovery itself runs as the service role and bypasses RLS; this
-- policy exists so an administrator can retire or correct a row from the UI.
create policy opportunities_update_admin on public.opportunities
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy opportunities_delete_admin on public.opportunities
  for delete to authenticated
  using (public.is_admin());

-- Note there is deliberately NO insert policy for `authenticated`. Rows come
-- from the pipeline (service role) only.

-- --- opportunity_saves ---
--
-- Strictly private. A student's application history is personal data: staff get
-- no read policy here, unlike on opportunities. Placement statistics, if ever
-- needed, should come from an aggregate view rather than by widening this.
create policy opportunity_saves_select_own on public.opportunity_saves
  for select to authenticated
  using (user_id = auth.uid());

create policy opportunity_saves_insert_own on public.opportunity_saves
  for insert to authenticated
  with check (user_id = auth.uid());

create policy opportunity_saves_update_own on public.opportunity_saves
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy opportunity_saves_delete_own on public.opportunity_saves
  for delete to authenticated
  using (user_id = auth.uid());

-- anon gets nothing on either table.
revoke all on public.opportunities     from anon;
revoke all on public.opportunity_saves from anon;

grant select on public.opportunities to authenticated;
grant select, insert, update, delete on public.opportunity_saves to authenticated;
