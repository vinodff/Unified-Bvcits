-- BVCITS 2.0 — 0009_blog
-- Blog Agent persistence: the daily topic queue, the generated posts that back
-- /blog, their images, and the agent run log.
--
-- Deliberately a separate table family from `campaigns`. A campaign is an event
-- that happened and needs promoting — it carries a photo gate, required facts
-- per type, and a five-platform fan-out. A blog post is evergreen editorial
-- ("How to choose an engineering branch") with no event behind it. Forcing one
-- through the other's state machine would mean either weakening the campaign
-- photo gate or inventing facts to satisfy REQUIRED_FIELDS. Neither is
-- acceptable, so they stay siblings sharing the LLM, brand and SEO layers.
--
-- Ids keep the app's newId() text format for the same reasons as 0002.

-- ---------------------------------------------------------------------------
-- Enums (mirror src/lib/marketing/blog/domain.ts)
-- ---------------------------------------------------------------------------
create type public.blog_topic_status as enum ('proposed', 'approved', 'rejected', 'used', 'expired');
create type public.blog_topic_source as enum ('agent', 'admin');

create type public.blog_post_status as enum (
  'GENERATING',      -- the pipeline is running
  'NEEDS_REVIEW',    -- quality gate found something an admin must look at
  'PUBLISHED',       -- live on /blog
  'UNPUBLISHED',     -- pulled back off the site, still editable
  'FAILED'           -- generation errored; retryable
);

create type public.blog_audience as enum ('students', 'parents', 'both', 'recruiters', 'faculty');

-- ---------------------------------------------------------------------------
-- Topic queue — the "10 ideas a day" the admin picks from
-- ---------------------------------------------------------------------------
create table public.blog_topics (
  id                  text primary key,
  title               text not null check (length(btrim(title)) > 0),

  -- Why this topic is worth writing, in the agent's own words. Shown on the
  -- idea card so the admin is choosing on reasoning, not on a headline alone.
  angle               text not null default '',
  rationale           text not null default '',

  -- Search side: what a person types, and what they want when they type it.
  search_intent       text not null default '',
  primary_keyword     text not null default '',
  secondary_keywords  text[] not null default '{}',

  -- How this serves BVCITS specifically. Separate from `rationale` so the
  -- quality gate can check that promotion never displaces usefulness.
  promo_angle         text not null default '',

  audience            public.blog_audience not null default 'students',
  category            text not null default 'Student Life',

  -- 0–100 opportunity score: search demand × fit × freshness, agent-assigned.
  score               integer not null default 50 check (score between 0 and 100),

  status              public.blog_topic_status not null default 'proposed',
  source              public.blog_topic_source not null default 'agent',

  -- The batch this idea belongs to, so "today's ten" is one query.
  proposed_on         date not null default (now() at time zone 'Asia/Kolkata')::date,

  decided_by          text,
  decided_at          timestamptz,
  post_id             text,

  created_at          timestamptz not null default now()
);

create index blog_topics_batch_idx  on public.blog_topics (proposed_on desc, score desc);
create index blog_topics_status_idx on public.blog_topics (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Posts — what /blog actually renders
-- ---------------------------------------------------------------------------
create table public.blog_posts (
  id               text primary key,

  -- The slug is the public URL. Unique across every status, including
  -- UNPUBLISHED, so pulling a post down never frees its URL for a different
  -- article — an old link must not silently start resolving to new content.
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  title            text not null check (length(btrim(title)) > 0),
  excerpt          text not null default '',

  -- Markdown. Rendered by a strict allowlist renderer, never dangerouslySetInnerHTML
  -- over raw model output — see src/components/blog/markdown.tsx.
  body_md          text not null default '',

  category         text not null default 'Student Life',
  tags             text[] not null default '{}',
  audience         public.blog_audience not null default 'students',

  hero_image_url   text,
  hero_image_alt   text,

  reading_minutes  integer not null default 0,
  word_count       integer not null default 0,

  status           public.blog_post_status not null default 'GENERATING',

  -- SeoMetadata-shaped, plus the JSON-LD blob served in the page head.
  seo              jsonb not null default '{}'::jsonb,
  -- QualityReport: score, issues, verdict, and what the revise pass changed.
  quality          jsonb not null default '{}'::jsonb,
  -- The grounded facts the writer was given, kept for provenance: every number
  -- in a published post must be traceable to something in here.
  grounding        jsonb not null default '{}'::jsonb,

  topic_id         text references public.blog_topics (id) on delete set null,

  created_by       text not null default 'blog-agent',
  published_at     timestamptz,
  unpublished_at   timestamptz,
  publish_error    text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index blog_posts_status_idx    on public.blog_posts (status, published_at desc nulls last);
create index blog_posts_category_idx  on public.blog_posts (category, published_at desc nulls last);

create trigger blog_posts_set_updated_at
  before update on public.blog_posts
  for each row execute function public.set_updated_at();

alter table public.blog_topics
  add constraint blog_topics_post_fk
  foreign key (post_id) references public.blog_posts (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Images — hero plus in-body section graphics
-- ---------------------------------------------------------------------------
create table public.blog_post_images (
  id             text primary key,
  post_id        text not null references public.blog_posts (id) on delete cascade,

  url            text not null,
  alt            text not null default '',
  caption        text,

  -- 'hero' renders above the article; 'section' is placed after the H2 at
  -- section_index. 'og' is the social card, never rendered in-body.
  placement      text not null default 'section' check (placement in ('hero', 'section', 'og')),
  section_index  integer,

  width          integer,
  height         integer,

  -- Real campus photograph vs brand-typographic composition. The quality gate
  -- requires that any image captioned as campus life is `photo_backed`.
  photo_backed   boolean not null default false,
  source_note    text not null default '',

  created_at     timestamptz not null default now()
);

create index blog_post_images_post_idx on public.blog_post_images (post_id, placement, section_index);

-- ---------------------------------------------------------------------------
-- Agent run log — same shape as agent_runs, keyed to a post or a topic batch
-- ---------------------------------------------------------------------------
create table public.blog_agent_runs (
  id           text primary key,
  post_id      text references public.blog_posts (id) on delete cascade,
  topic_batch  date,

  agent_name   text not null,
  status       public.agent_run_status not null default 'running',
  summary      text not null default '',
  model        text not null default '',

  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  duration_ms  integer,
  error        text,
  tokens       jsonb,

  -- One of the two anchors must be present, or the run is unattributable.
  constraint blog_agent_runs_anchor check (post_id is not null or topic_batch is not null)
);

create index blog_agent_runs_post_idx  on public.blog_agent_runs (post_id, started_at desc);
create index blog_agent_runs_batch_idx on public.blog_agent_runs (topic_batch desc, started_at desc);

-- ---------------------------------------------------------------------------
-- RLS: identical posture to 0002. Every read and write — including the public
-- /blog pages — goes through a Next.js server component or route handler using
-- the service role. The publishable key never touches these tables, so a
-- mistake in client code cannot expose unpublished drafts.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['blog_topics', 'blog_posts', 'blog_post_images', 'blog_agent_runs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;
