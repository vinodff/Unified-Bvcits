-- BVCITS 2.0 — 0002_marketing
-- Marketing Studio persistence. A 1:1 port of the 14 entities in
-- src/lib/marketing/domain.ts, which today live in .data/marketing/*.json via
-- JsonFileStore. That store is gitignored and process-local, so every campaign,
-- approval and publish job is lost on a serverless deploy.
--
-- Enum values are copied verbatim from the TypeScript union types. If a union
-- in domain.ts gains a member, the matching enum needs `alter type ... add value`.
--
-- Primary keys stay `text` and keep the app's newId() format ("cmp_lx3f_a91b")
-- rather than switching to uuid — the domain layer, idempotency keys and audit
-- entries all pass these ids around as opaque strings already.

-- ---------------------------------------------------------------------------
-- Enums (mirror src/lib/marketing/domain.ts)
-- ---------------------------------------------------------------------------
create type public.campaign_type as enum (
  'event', 'hackathon', 'workshop', 'seminar', 'achievement', 'placement',
  'award', 'faculty_achievement', 'student_achievement', 'admission_announcement',
  'exam_announcement', 'campus_news', 'research', 'sports', 'cultural_event', 'other'
);

create type public.campaign_status as enum (
  'DRAFT', 'NEEDS_INFORMATION', 'GENERATING', 'READY_FOR_REVIEW',
  'CHANGES_REQUESTED', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED',
  'GENERATION_FAILED', 'PUBLISH_FAILED', 'SCHEDULE_FAILED'
);

create type public.campaign_source   as enum ('manual', 'assistant');
create type public.platform          as enum ('website', 'instagram', 'facebook', 'linkedin', 'whatsapp');
create type public.fact_source       as enum ('admin', 'ai_observation', 'vision_observation', 'inferred');
create type public.asset_type        as enum ('image', 'video', 'pdf', 'document', 'reference_design');
create type public.content_status    as enum ('draft', 'approved', 'superseded');
create type public.approval_status   as enum ('approved', 'rejected', 'invalidated');
create type public.agent_run_status  as enum ('running', 'success', 'failed', 'skipped');
create type public.account_status    as enum ('connected', 'disconnected', 'token_expired', 'permission_error', 'mock');
create type public.publish_status    as enum ('scheduled', 'ready', 'publishing', 'published', 'failed', 'canceled', 'skipped');
create type public.attempt_status    as enum ('success', 'failure', 'retryable');
create type public.message_role      as enum ('admin', 'assistant');
create type public.quality_verdict   as enum ('pass', 'needs_correction');

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id                   text primary key,
  title                text not null check (length(btrim(title)) > 0),
  type                 public.campaign_type not null,
  status               public.campaign_status not null default 'DRAFT',
  source               public.campaign_source not null default 'manual',
  created_by           text not null,

  -- Soft delete: listCampaigns() filters these out rather than hard-deleting,
  -- because audit entries reference campaigns that must stay resolvable.
  deleted_at           timestamptz,

  approval_invalidated boolean not null default false,
  approved_version     integer check (approved_version is null or approved_version > 0),

  -- CampaignSchedule — one row per campaign, so it stays inline rather than
  -- earning its own table.
  schedule_platforms   public.platform[] not null default '{}',
  schedule_times       jsonb not null default '{}'::jsonb,
  schedule_tz          text not null default 'Asia/Kolkata',

  strategy             jsonb,
  published_at         timestamptz,
  publish_error        text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index campaigns_status_idx  on public.campaigns (status) where deleted_at is null;
create index campaigns_live_idx    on public.campaigns (created_at desc) where deleted_at is null;
create index campaigns_type_idx    on public.campaigns (type) where deleted_at is null;

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Campaign facts — one row per (campaign, field), which is exactly the upsert
-- key that setFact() hand-rolls against the JSON array today.
-- ---------------------------------------------------------------------------
create table public.campaign_facts (
  campaign_id  text not null references public.campaigns (id) on delete cascade,
  field        text not null,
  -- FactValue is string | number | boolean | string[] | null, so jsonb is the
  -- only column type that round-trips all five without lossy coercion.
  value        jsonb,
  source       public.fact_source not null,
  confidence   numeric(4, 3) not null default 1 check (confidence between 0 and 1),
  verified     boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (campaign_id, field)
);

create trigger campaign_facts_set_updated_at
  before update on public.campaign_facts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Assets
-- ---------------------------------------------------------------------------
create table public.campaign_assets (
  id               text primary key,
  campaign_id      text not null references public.campaigns (id) on delete cascade,
  original_file    text not null,
  processed_file   text,
  type             public.asset_type not null,
  width            integer check (width is null or width > 0),
  height           integer check (height is null or height > 0),
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes >= 0),
  ai_generated     boolean not null default false,
  reference_assets text[] not null default '{}',
  alt_text         text,
  caption          text,
  title            text,
  description      text,
  archived         boolean not null default false,
  metadata         jsonb not null default '{}'::jsonb,
  -- Vision-agent output. Never identities — see the domain.ts contract.
  observations     text[] not null default '{}',
  created_at       timestamptz not null default now()
);

create index campaign_assets_live_idx
  on public.campaign_assets (campaign_id, created_at desc)
  where archived = false;
-- listAssets() in the publisher path filters on metadata->>'platform'.
create index campaign_assets_metadata_idx
  on public.campaign_assets using gin (metadata);

-- ---------------------------------------------------------------------------
-- Content versions
-- ---------------------------------------------------------------------------
create table public.content_versions (
  id            text primary key,
  campaign_id   text not null references public.campaigns (id) on delete cascade,
  version       integer not null check (version > 0),
  platform      public.platform not null,
  content_type  text not null,
  body          text not null,
  title         text,
  -- Factual claims asserted by the copy, used by the QC agent for grounding.
  claims        text[] not null default '{}',
  status        public.content_status not null default 'draft',
  created_by    text not null,
  created_at    timestamptz not null default now(),

  -- One piece of copy per platform per version. The JSON store had no such
  -- guard, so a retried generation could silently append a duplicate.
  unique (campaign_id, version, platform)
);

create index content_versions_lookup_idx
  on public.content_versions (campaign_id, version desc, platform);
create index content_versions_approved_idx
  on public.content_versions (campaign_id)
  where status = 'approved';

-- ---------------------------------------------------------------------------
-- Approvals
-- ---------------------------------------------------------------------------
create table public.approvals (
  id              text primary key,
  campaign_id     text not null references public.campaigns (id) on delete cascade,
  content_version integer not null check (content_version > 0),
  approved_by     text not null,
  approved_at     timestamptz not null default now(),
  platforms       public.platform[] not null default '{}',
  scheduled_at    timestamptz,
  -- Hash per asset at approval time; a changed hash invalidates the approval.
  asset_hashes    jsonb not null default '{}'::jsonb,
  status          public.approval_status not null default 'approved',
  note            text
);

create index approvals_latest_idx
  on public.approvals (campaign_id, approved_at desc);
-- getLatestApproval() only ever wants live approvals.
create index approvals_live_idx
  on public.approvals (campaign_id, approved_at desc)
  where status = 'approved';

-- ---------------------------------------------------------------------------
-- SEO metadata + quality scores — both keyed by (campaign, version)
-- ---------------------------------------------------------------------------
create table public.seo_metadata (
  campaign_id        text not null references public.campaigns (id) on delete cascade,
  content_version    integer not null check (content_version > 0),
  seo_title          text not null,
  meta_description   text not null,
  primary_intent     text not null,
  primary_topic      text not null,
  supporting_topics  text[] not null default '{}',
  slug               text not null,
  h1                 text not null,
  h2_structure       text[] not null default '{}',
  internal_links     jsonb not null default '[]'::jsonb,
  image_alt_text     text not null default '',
  image_filename     text not null default '',
  og_title           text not null default '',
  og_description     text not null default '',
  og_image           text not null default '',
  schema_json_ld     jsonb not null default '{}'::jsonb,
  related_content    text[] not null default '{}',
  updated_at         timestamptz not null default now(),
  primary key (campaign_id, content_version)
);

create trigger seo_metadata_set_updated_at
  before update on public.seo_metadata
  for each row execute function public.set_updated_at();

create table public.quality_scores (
  campaign_id     text not null references public.campaigns (id) on delete cascade,
  content_version integer not null check (content_version > 0),
  overall         numeric(5, 2) not null,
  breakdown       jsonb not null default '{}'::jsonb,
  -- [{ severity: 'critical'|'warning'|'info', message: string }]
  issues          jsonb not null default '[]'::jsonb,
  verdict         public.quality_verdict not null,
  checked_by      text not null,
  checked_at      timestamptz not null default now(),
  primary key (campaign_id, content_version)
);

-- ---------------------------------------------------------------------------
-- Agent runs — observability for the pipeline
-- ---------------------------------------------------------------------------
create table public.agent_runs (
  id            text primary key,
  campaign_id   text not null references public.campaigns (id) on delete cascade,
  agent_name    text not null,
  run_id        text not null,
  model         text not null,
  status        public.agent_run_status not null default 'running',
  summary       text not null default '',
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  duration_ms   integer check (duration_ms is null or duration_ms >= 0),
  error         text,
  input_tokens  integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0)
);

create index agent_runs_campaign_idx on public.agent_runs (campaign_id, started_at desc);
create index agent_runs_failed_idx   on public.agent_runs (started_at desc) where status = 'failed';

-- ---------------------------------------------------------------------------
-- Social accounts
--
-- Deliberately holds NO access tokens. Real tokens stay in server env vars;
-- this table records only which accounts exist and what they can do, so a leak
-- of the database is not a leak of the college's social presence.
-- ---------------------------------------------------------------------------
create table public.social_accounts (
  id                    text primary key,
  platform              public.platform not null,
  label                 text not null,
  connected_by          text not null,
  status                public.account_status not null default 'mock',
  -- { publishing, scheduling, media, analytics, note } — verified against the
  -- platform's official API docs, not assumed.
  capabilities          jsonb not null default '{}'::jsonb,
  permissions           text[] not null default '{}',
  requires_app_review   boolean not null default false,
  mock                  boolean not null default true,
  connected_at          timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index social_accounts_platform_idx on public.social_accounts (platform, status);

create trigger social_accounts_set_updated_at
  before update on public.social_accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Publish jobs + attempts
-- ---------------------------------------------------------------------------
create table public.publish_jobs (
  id                   text primary key,
  campaign_id          text not null references public.campaigns (id) on delete cascade,
  platform             public.platform not null,
  account_id           text not null references public.social_accounts (id),
  content_version      integer not null check (content_version > 0),
  media_version        text,
  scheduled_for        timestamptz not null,
  status               public.publish_status not null default 'scheduled',
  published_at         timestamptz,
  platform_post_id     text,
  -- Remote id from platforms that schedule server-side (Instagram, Facebook).
  platform_schedule_id text,
  error                text,
  retry_count          integer not null default 0 check (retry_count >= 0),
  max_retries          integer not null default 5 check (max_retries >= 0),
  next_attempt_at      timestamptz,
  -- "bvcits:{campaignId}:{platform}:v{version}" — the double-publish guard.
  -- The JSON store enforced this in application code only; here the database
  -- refuses the duplicate even if two workers race.
  idempotency_key      text not null unique,
  locked_until         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Drives claim_due_publish_jobs(): due, unlocked, still runnable.
create index publish_jobs_due_idx
  on public.publish_jobs (scheduled_for)
  where status in ('scheduled', 'ready');
create index publish_jobs_campaign_idx on public.publish_jobs (campaign_id, scheduled_for);
create index publish_jobs_retry_idx
  on public.publish_jobs (next_attempt_at)
  where status = 'failed';

create trigger publish_jobs_set_updated_at
  before update on public.publish_jobs
  for each row execute function public.set_updated_at();

create table public.publish_attempts (
  id          text primary key,
  job_id      text not null references public.publish_jobs (id) on delete cascade,
  campaign_id text not null references public.campaigns (id) on delete cascade,
  platform    public.platform not null,
  attempt     integer not null check (attempt > 0),
  status      public.attempt_status not null,
  error       text,
  http_status integer,
  at          timestamptz not null default now()
);

create index publish_attempts_job_idx on public.publish_attempts (job_id, at);

-- ---------------------------------------------------------------------------
-- Audit log — append-only
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id        text primary key,
  at        timestamptz not null default now(),
  actor     text not null,
  action    text not null,
  entity    text not null,
  entity_id text not null,
  detail    jsonb not null default '{}'::jsonb,
  ip        text
);

create index audit_log_at_idx     on public.audit_log (at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id, at desc);

-- Append-only in the literal sense: even the service role cannot rewrite
-- history through the normal API. Corrections are new entries, not edits.
create rule audit_log_no_update as on update to public.audit_log do instead nothing;
create rule audit_log_no_delete as on delete to public.audit_log do instead nothing;

-- ---------------------------------------------------------------------------
-- Campaign conversation (admin <-> assistant)
-- ---------------------------------------------------------------------------
create table public.campaign_messages (
  id          text primary key,
  campaign_id text not null references public.campaigns (id) on delete cascade,
  role        public.message_role not null,
  text        text not null,
  at          timestamptz not null default now()
);

create index campaign_messages_thread_idx on public.campaign_messages (campaign_id, at);

-- Questions the assistant is still waiting on, kept separate from the
-- transcript because they are mutable state, not history.
create table public.campaign_pending_questions (
  campaign_id text not null references public.campaigns (id) on delete cascade,
  position    integer not null check (position >= 0),
  question    text not null,
  primary key (campaign_id, position)
);

-- ---------------------------------------------------------------------------
-- Brand settings — singleton, enforced by the id check rather than by
-- convention, so a second row cannot quietly appear and win a race.
-- ---------------------------------------------------------------------------
create table public.brand_settings (
  id                     boolean primary key default true check (id),
  college_name           text not null,
  short_name             text not null,
  abbreviation           text not null,
  website                text not null,
  counselling_code       text not null,
  logo_path              text not null,
  colors                 jsonb not null default '{}'::jsonb,
  tone                   text not null default '',
  preferred_terminology  text[] not null default '{}',
  departments            text[] not null default '{}',
  social_handles         jsonb not null default '{}'::jsonb,
  contact                jsonb not null default '{}'::jsonb,
  official_hashtags      text[] not null default '{}',
  forbidden_terminology  text[] not null default '{}',
  approval_rule          text not null default '',
  updated_at             timestamptz not null default now()
);

create trigger brand_settings_set_updated_at
  before update on public.brand_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: the entire Marketing Studio is admin-only and reached exclusively
-- through Next.js route handlers that already gate on requireAdmin().
-- Those handlers use the service role, which bypasses RLS. Enabling RLS with
-- zero policies means the publishable key sees none of this, even by accident.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'campaigns', 'campaign_facts', 'campaign_assets', 'content_versions',
    'approvals', 'seo_metadata', 'quality_scores', 'agent_runs',
    'social_accounts', 'publish_jobs', 'publish_attempts', 'audit_log',
    'campaign_messages', 'campaign_pending_questions', 'brand_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;
