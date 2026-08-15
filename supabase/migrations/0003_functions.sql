-- BVCITS 2.0 — 0003_functions
-- Database functions and reporting views.
--
-- Two categories:
--   1. SECURITY DEFINER RPCs granted to `anon`. These are the ONLY thing the
--      publishable key can call. Each one validates its own input and writes a
--      single row — anon never touches a table directly, so it can write an
--      enquiry but cannot read anyone else's.
--   2. Service-role helpers that replace multi-step read-modify-write loops in
--      src/lib/marketing/ with one atomic statement.
--
-- Every SECURITY DEFINER function pins `search_path`. Without it, a caller who
-- can create objects in a schema earlier on the path could shadow a table name
-- and have it resolved with the definer's privileges.

-- ===========================================================================
-- 1. Anon-callable RPCs
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- submit_admission_enquiry
-- Backs src/components/forms/EnquiryForm.tsx, which until now discarded every
-- submission client-side. Rate limited per ip_hash so a script cannot flood
-- the admissions inbox with the publishable key.
-- ---------------------------------------------------------------------------
create or replace function public.submit_admission_enquiry(
  p_full_name   text,
  p_mobile      text,
  p_email       text default null,
  p_program     text default null,
  p_message     text default null,
  p_source_path text default null,
  p_ip_hash     text default null,
  p_user_agent  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recent integer;
  v_id     uuid;
begin
  -- Normalise before validating, so " Ravi " and "Ravi" behave identically.
  p_full_name := btrim(p_full_name);
  p_mobile    := btrim(p_mobile);
  p_email     := nullif(btrim(coalesce(p_email, '')), '');
  p_program   := nullif(btrim(coalesce(p_program, '')), '');
  p_message   := nullif(btrim(coalesce(p_message, '')), '');

  if p_full_name is null or length(p_full_name) < 2 then
    raise exception 'Full name is required.' using errcode = '22023';
  end if;

  if p_mobile is null or p_mobile !~ '^[0-9+][0-9 +()-]{6,19}$' then
    raise exception 'A valid mobile number is required.' using errcode = '22023';
  end if;

  -- 5 enquiries per IP per hour. Generous for a family filling forms on one
  -- connection, useless for a scripted flood.
  if p_ip_hash is not null then
    select count(*) into v_recent
    from public.admission_enquiries
    where ip_hash = p_ip_hash
      and created_at > now() - interval '1 hour';

    if v_recent >= 5 then
      raise exception 'Too many enquiries from this connection. Please try again later.'
        using errcode = '53400';
    end if;
  end if;

  insert into public.admission_enquiries
    (full_name, mobile, email, program, message, source_path, ip_hash, user_agent)
  values
    (p_full_name, p_mobile, p_email, p_program, left(p_message, 2000),
     left(p_source_path, 200), p_ip_hash, left(p_user_agent, 400))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- log_assistant_query
-- One call per assistant turn. Creates the session on first sight so the client
-- never needs a separate round trip, and returns nothing useful to the caller —
-- telemetry must not become a read channel.
-- ---------------------------------------------------------------------------
create or replace function public.log_assistant_query(
  p_client_session_id text,
  p_query_text        text,
  p_normalized        text default null,
  p_locale            text default 'en',
  p_intent            text default null,
  p_department        text default null,
  p_confidence        numeric default null,
  p_answered          boolean default false,
  p_answer_source     text default null,
  p_latency_ms        integer default null,
  p_user_agent        text default null,
  p_ip_hash           text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid;
begin
  p_query_text := btrim(p_query_text);

  if p_client_session_id is null or length(p_client_session_id) not between 8 and 100 then
    raise exception 'Invalid session id.' using errcode = '22023';
  end if;

  if p_query_text is null or p_query_text = '' then
    return;  -- Nothing to learn from an empty turn.
  end if;

  if p_locale not in ('en', 'te') then
    p_locale := 'en';
  end if;

  insert into public.assistant_sessions (client_session_id, locale, user_agent, ip_hash)
  values (p_client_session_id, p_locale, left(p_user_agent, 400), p_ip_hash)
  on conflict (client_session_id)
    do update set last_seen_at = now()
  returning id into v_session_id;

  insert into public.assistant_queries
    (session_id, query_text, normalized, locale, intent, department,
     confidence, answered, answer_source, latency_ms)
  values
    (v_session_id, left(p_query_text, 400), left(p_normalized, 400), p_locale,
     p_intent, p_department,
     case when p_confidence between 0 and 1 then p_confidence else null end,
     coalesce(p_answered, false), p_answer_source, p_latency_ms);
end;
$$;

-- Anon may call exactly these two functions and nothing else.
revoke all on function public.submit_admission_enquiry(text, text, text, text, text, text, text, text) from public;
revoke all on function public.log_assistant_query(text, text, text, text, text, text, numeric, boolean, text, integer, text, text) from public;

grant execute on function public.submit_admission_enquiry(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.log_assistant_query(text, text, text, text, text, text, numeric, boolean, text, integer, text, text) to anon, authenticated;

-- ===========================================================================
-- 2. Service-role helpers
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- invalidate_campaign_approvals
-- Replaces JsonFileStore.invalidateApprovals(), which read the whole array,
-- mutated matching rows and rewrote the file — a lost update if two edits
-- landed together. Also flips the campaign flag in the same transaction, which
-- the file store could not do atomically at all.
-- ---------------------------------------------------------------------------
create or replace function public.invalidate_campaign_approvals(p_campaign_id text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.approvals
     set status = 'invalidated'
   where campaign_id = p_campaign_id
     and status = 'approved';

  get diagnostics v_count = row_count;

  if v_count > 0 then
    update public.campaigns
       set approval_invalidated = true
     where id = p_campaign_id;
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_due_publish_jobs
-- The crash lock from src/lib/marketing/queue.ts, moved into the database.
--
-- FOR UPDATE SKIP LOCKED is what makes this safe under concurrency: two worker
-- invocations hitting /api/marketing/worker at the same instant each get a
-- disjoint set of jobs instead of both claiming the same one. The file-backed
-- version could only hope the lockedUntil write landed first.
--
-- Claims are atomic: status flips to 'publishing' and locked_until is set in
-- the same statement that selects the rows. A worker that dies mid-publish
-- leaves the lock to expire rather than the job stuck forever.
-- ---------------------------------------------------------------------------
create or replace function public.claim_due_publish_jobs(
  p_limit        integer default 10,
  p_lock_seconds integer default 45
)
returns setof public.publish_jobs
language sql
as $$
  with due as (
    select id
      from public.publish_jobs
     where (locked_until is null or locked_until < now())
       and (
             -- Scheduled work that has come due.
             (status in ('scheduled', 'ready') and scheduled_for <= now())
             -- Failed work that has served its backoff and has retries left.
          or (status = 'failed'
              and retry_count < max_retries
              and next_attempt_at is not null
              and next_attempt_at <= now())
           )
     order by scheduled_for
     limit greatest(p_limit, 0)
     for update skip locked
  )
  update public.publish_jobs j
     set status       = 'publishing',
         locked_until = now() + make_interval(secs => greatest(p_lock_seconds, 1))
    from due
   where j.id = due.id
  returning j.*;
$$;

-- ---------------------------------------------------------------------------
-- release_stale_publish_locks
-- Housekeeping for jobs whose worker died while holding the lock. Called at the
-- top of a worker tick so a crashed publish resumes instead of wedging.
-- ---------------------------------------------------------------------------
create or replace function public.release_stale_publish_locks()
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.publish_jobs
     set status       = 'ready',
         locked_until = null
   where status = 'publishing'
     and locked_until is not null
     and locked_until < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_campaign_bundle
-- One round trip for the campaign detail screen, which otherwise needs eight
-- (campaign, facts, assets, content, approvals, seo, quality, runs, messages).
-- Returns null for a missing or soft-deleted campaign.
-- ---------------------------------------------------------------------------
create or replace function public.get_campaign_bundle(p_campaign_id text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'campaign', to_jsonb(c),
    'facts', coalesce(
      (select jsonb_agg(to_jsonb(f) order by f.field)
         from public.campaign_facts f where f.campaign_id = c.id), '[]'::jsonb),
    'assets', coalesce(
      (select jsonb_agg(to_jsonb(a) order by a.created_at desc)
         from public.campaign_assets a
        where a.campaign_id = c.id and a.archived = false), '[]'::jsonb),
    'content', coalesce(
      (select jsonb_agg(to_jsonb(v) order by v.version desc, v.platform)
         from public.content_versions v where v.campaign_id = c.id), '[]'::jsonb),
    'approvals', coalesce(
      (select jsonb_agg(to_jsonb(ap) order by ap.approved_at desc)
         from public.approvals ap where ap.campaign_id = c.id), '[]'::jsonb),
    'seo', coalesce(
      (select jsonb_agg(to_jsonb(s) order by s.content_version desc)
         from public.seo_metadata s where s.campaign_id = c.id), '[]'::jsonb),
    'quality', coalesce(
      (select jsonb_agg(to_jsonb(q) order by q.content_version desc)
         from public.quality_scores q where q.campaign_id = c.id), '[]'::jsonb),
    'agentRuns', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.started_at desc)
         from public.agent_runs r where r.campaign_id = c.id), '[]'::jsonb),
    'jobs', coalesce(
      (select jsonb_agg(to_jsonb(j) order by j.scheduled_for)
         from public.publish_jobs j where j.campaign_id = c.id), '[]'::jsonb),
    'messages', coalesce(
      (select jsonb_agg(to_jsonb(m) order by m.at)
         from public.campaign_messages m where m.campaign_id = c.id), '[]'::jsonb),
    'pendingQuestions', coalesce(
      (select jsonb_agg(pq.question order by pq.position)
         from public.campaign_pending_questions pq where pq.campaign_id = c.id), '[]'::jsonb)
  )
  from public.campaigns c
  where c.id = p_campaign_id and c.deleted_at is null;
$$;

-- ===========================================================================
-- 3. Reporting views (service role only — RLS on the base tables still applies)
-- ===========================================================================

-- What the admissions team actually opens each morning.
create or replace view public.enquiry_inbox as
select
  e.id,
  e.full_name,
  e.mobile,
  e.email,
  e.program,
  e.message,
  e.source_path,
  e.status,
  e.created_at,
  -- How long a 'new' enquiry has been sitting unanswered.
  case when e.status = 'new'
       then round(extract(epoch from now() - e.created_at) / 3600)::integer
       else null end as hours_waiting
from public.admission_enquiries e
where e.status <> 'spam'
order by
  (e.status = 'new') desc,
  e.created_at desc;

-- The assistant's content backlog: questions asked often and answered rarely.
-- Ordered so the highest-volume gaps sit at the top of the list.
create or replace view public.assistant_gap_report as
select
  coalesce(q.normalized, lower(q.query_text)) as question,
  count(*)                                    as times_asked,
  count(*) filter (where q.answered)          as times_answered,
  round(
    100.0 * count(*) filter (where not q.answered) / nullif(count(*), 0)
  , 1)                                        as miss_rate_pct,
  max(q.created_at)                           as last_asked_at,
  -- A sample of the raw phrasings, so the fix targets real wording.
  (array_agg(distinct q.query_text))[1:3]     as sample_phrasings
from public.assistant_queries q
where q.created_at > now() - interval '90 days'
group by 1
having count(*) filter (where not q.answered) > 0
order by count(*) filter (where not q.answered) desc, count(*) desc;

-- Pipeline state at a glance, including whether a campaign is blocked.
create or replace view public.campaign_dashboard as
select
  c.id,
  c.title,
  c.type,
  c.status,
  c.approved_version,
  c.approval_invalidated,
  c.schedule_platforms,
  c.created_at,
  c.updated_at,
  (select count(*) from public.content_versions v where v.campaign_id = c.id)      as content_count,
  (select count(*) from public.campaign_assets a
     where a.campaign_id = c.id and a.archived = false)                            as asset_count,
  (select max(q.overall) from public.quality_scores q where q.campaign_id = c.id)  as best_quality_score,
  (select count(*) from public.publish_jobs j
     where j.campaign_id = c.id and j.status = 'published')                        as published_jobs,
  (select count(*) from public.publish_jobs j
     where j.campaign_id = c.id and j.status = 'failed')                           as failed_jobs,
  (select count(*) from public.agent_runs r
     where r.campaign_id = c.id and r.status = 'failed')                           as failed_agent_runs
from public.campaigns c
where c.deleted_at is null
order by c.updated_at desc;

-- Views default to the definer's rights, so lock them to the service role.
revoke all on public.enquiry_inbox        from anon, authenticated;
revoke all on public.assistant_gap_report from anon, authenticated;
revoke all on public.campaign_dashboard   from anon, authenticated;
