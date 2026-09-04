-- BVCITS 2.0 — 0012_opportunity_agent
--
-- Turns opportunity discovery from a laptop script into an accountable agent:
-- a run ledger, per-row liveness provenance, and soft retirement of listings
-- that are no longer live.
--
-- The three things this adds that 0006_opportunities.sql deliberately left out:
--
--   1. **History.** 0006 kept no record of a run at all — stats lived in
--      console.log and a single JSON file that each run overwrote. Without a
--      ledger there is no way to answer "how many did we find yesterday?", so
--      `opportunity_runs` records one row per run with its counts, duration,
--      and the domains it actually consulted.
--
--   2. **Liveness provenance.** 0006 probed a URL once, at insert. A listing
--      verified in August stayed in the feed in September however dead the link
--      became — and a row with `deadline IS NULL` never expired at all. The new
--      columns record when each row was last checked, what the answer was, and
--      how many consecutive ambiguous failures it has accumulated.
--
--   3. **Retirement.** Removal is soft: `retired_at` + `retired_reason`. 0006's
--      own comment argues an expired posting should be "invisible rather than
--      deleted" because the row still matters for deduplication and for the
--      saved list of a student who already applied. Retirement follows that
--      same reasoning and adds the evidence, so any removal can be audited or
--      reversed rather than silently losing a real opportunity.

-- ---------------------------------------------------------------------------
-- 1. Run ledger
--
-- Created before the ALTER below, which carries an FK to it. Shape follows
-- blog_agent_runs (0009_blog.sql) and agent_runs (0002_marketing.sql) so the
-- three agent ledgers in this codebase stay legible as one family.
-- ---------------------------------------------------------------------------
create type public.opportunity_run_status  as enum ('running', 'success', 'partial', 'failed');
create type public.opportunity_run_trigger as enum ('cron', 'manual');

create table public.opportunity_runs (
  id             uuid primary key default gen_random_uuid(),

  status         public.opportunity_run_status not null default 'running',
  trigger        public.opportunity_run_trigger not null,
  -- Null for a cron run: nobody pressed anything.
  triggered_by   uuid references public.profiles (id) on delete set null,

  -- The IST calendar day this run belongs to. Unique per trigger so a cron
  -- retry, or an admin double-clicking "Run now", cannot spend the quota twice
  -- — the route returns the existing row instead. Manual runs get their own
  -- slot so an admin can still force a refresh on a day the cron already ran.
  run_date       date not null,

  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  duration_ms    integer check (duration_ms is null or duration_ms >= 0),

  -- Discovery half (Phase 2). Zero on a refresh-only run.
  pages_searched smallint not null default 0,
  extracted      smallint not null default 0,
  verified       smallint not null default 0,
  pending        smallint not null default 0,
  rejected       smallint not null default 0,
  duplicates     smallint not null default 0,

  -- Refresh half (Phase 1).
  rechecked      smallint not null default 0,
  retired        smallint not null default 0,

  -- What the agent actually consulted, e.g.
  -- [{"host":"boards.greenhouse.io","plan":"internships","results":8,"kept":2}]
  -- This is the evidence behind "real sources" in the console; it is written
  -- from the search response, never hand-authored.
  sources        jsonb not null default '[]'::jsonb,

  model          text,
  error          text,

  constraint opportunity_runs_counts_nonneg check (
    pages_searched >= 0 and extracted >= 0 and verified >= 0
    and pending >= 0 and rejected >= 0 and duplicates >= 0
    and rechecked >= 0 and retired >= 0
  )
);

create unique index opportunity_runs_day_idx on public.opportunity_runs (run_date, trigger);
create index opportunity_runs_recent_idx on public.opportunity_runs (started_at desc);
create index opportunity_runs_failed_idx on public.opportunity_runs (started_at desc)
  where status = 'failed';

-- ---------------------------------------------------------------------------
-- 2. Liveness + provenance on opportunities
-- ---------------------------------------------------------------------------
alter table public.opportunities
  add column last_checked_at   timestamptz,
  -- 'ok' | 'blocked' | 'expired' | 'gone' | 'unreachable' — mirrors the
  -- LivenessVerdict union in src/lib/opportunities/liveness.ts. Left as text
  -- rather than an enum so a new verdict does not need a migration to observe.
  add column last_check_result text,
  -- Consecutive AMBIGUOUS failures. A definitive signal (410, a validThrough
  -- in the past) retires on the first sighting and never touches this counter;
  -- a timeout or a suspected soft-404 increments it, and two in a row retire.
  -- Reset to 0 by any successful check.
  add column check_failures    smallint not null default 0 check (check_failures >= 0),
  add column retired_at        timestamptz,
  -- Human-readable evidence, e.g. "HTTP 410 Gone" or
  -- "JobPosting.validThrough was 2026-07-31". Never null when retired_at is set.
  add column retired_reason    text,
  add column first_seen_run    uuid references public.opportunity_runs (id) on delete set null,
  add column last_seen_run     uuid references public.opportunity_runs (id) on delete set null,

  add constraint opportunities_retired_needs_reason
    check (retired_at is null or retired_reason is not null);

-- The sweep claims work oldest-first, so this index is the one it runs on.
create index opportunities_recheck_queue_idx
  on public.opportunities (last_checked_at nulls first)
  where retired_at is null and status = 'verified';

create index opportunities_retired_idx on public.opportunities (retired_at desc)
  where retired_at is not null;

-- ---------------------------------------------------------------------------
-- 3. Visibility gate — retired rows leave the feed
--
-- The 2-arg is_opportunity_visible() cannot simply be replaced: `create or
-- replace function` cannot change a signature, and the RLS policy holds a
-- dependency on the old one. So: add the 3-arg version, repoint the policy,
-- then drop the original.
-- ---------------------------------------------------------------------------
create or replace function public.is_opportunity_visible(
  p_status     public.opportunity_status,
  p_deadline   date,
  p_retired_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_status = 'verified'
     and p_retired_at is null
     and (p_deadline is null or p_deadline >= current_date);
$$;

drop policy opportunities_select_visible on public.opportunities;

create policy opportunities_select_visible on public.opportunities
  for select to authenticated
  using (public.is_opportunity_visible(status, deadline, retired_at));

drop function public.is_opportunity_visible(public.opportunity_status, date);

-- ---------------------------------------------------------------------------
-- 4. Day-wise report
--
-- Service-role only, same lockdown as enquiry_inbox / academics_overview in
-- 0003_functions.sql. Answers "how many did we find today, yesterday, the day
-- before" in one query, counting the opportunities themselves rather than the
-- run's self-reported totals — so a run that crashed after inserting still
-- shows its rows honestly.
-- ---------------------------------------------------------------------------
create or replace view public.opportunity_daily_stats as
with days as (
  select generate_series(current_date - interval '13 days', current_date, interval '1 day')::date as day
)
select
  d.day,
  (select count(*) from public.opportunities o
    where o.discovered_at::date = d.day)                                    as discovered,
  (select count(*) from public.opportunities o
    where o.discovered_at::date = d.day and o.status = 'verified')          as verified,
  (select count(*) from public.opportunities o
    where o.retired_at::date = d.day)                                       as retired,
  (select count(*) from public.opportunity_runs r
    where r.run_date = d.day)                                              as runs,
  (select round(avg(r.duration_ms)) from public.opportunity_runs r
    where r.run_date = d.day and r.duration_ms is not null)                as avg_duration_ms,
  (select coalesce(sum(r.rechecked), 0) from public.opportunity_runs r
    where r.run_date = d.day)                                              as rechecked
from days d
order by d.day desc;

-- ---------------------------------------------------------------------------
-- 5. RLS — the ledger is service-role only
--
-- No policies at all: enabling RLS with none denies everyone. The agent console
-- reads this through getServiceClient() behind an `opportunities.moderate`
-- capability check, which is the same arrangement as /dashboard/enquiries and
-- /dashboard/users — the application check IS the boundary there, deliberately.
-- ---------------------------------------------------------------------------
alter table public.opportunity_runs enable row level security;
alter table public.opportunity_runs force row level security;

revoke all on public.opportunity_runs        from anon, authenticated;
revoke all on public.opportunity_daily_stats from anon, authenticated;
