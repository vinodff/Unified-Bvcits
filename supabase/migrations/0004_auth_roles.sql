-- BVCITS 2.0 — 0004_auth_roles
-- Role-based accounts on top of Supabase Auth (GoTrue).
--
-- Roles mirror the seven stakeholder portals in src/data/portals.ts (see
-- docs/IA-STAKEHOLDER-NAV.md) plus `admin`, so a signed-in user's role maps
-- directly onto the portal they already navigate to. No new audience taxonomy.
--
-- Security posture: **self-signup can never grant privilege.** Every new account
-- lands as 'student' regardless of what the client sends, and only an admin can
-- change a role afterwards. The two ways that could otherwise leak are both
-- closed here:
--   1. handle_new_user() ignores raw_user_meta_data for `role` — that field is
--      attacker-controlled at signup time.
--   2. guard_profile_role_change() rejects a self-service role edit, so the
--      "update your own profile" policy cannot be used to become an admin.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create type public.user_role as enum (
  'student',
  'parent',
  'faculty',      -- the /staff portal is titled "For Faculty & Staff"
  'management',
  'regulatory',
  'recruiter',
  'trainer',
  'admin'
);

-- ---------------------------------------------------------------------------
-- Profiles — one row per auth.users row
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  full_name     text check (full_name is null or length(btrim(full_name)) between 2 and 120),
  role          public.user_role not null default 'student',

  -- Role-specific, all optional: a recruiter has an organization but no roll
  -- number. Kept on one table because every field is 1:1 with the account and
  -- splitting per role would mean a union query on every page load.
  department    text,
  roll_number   text,
  employee_id   text,
  study_year    smallint check (study_year is null or study_year between 1 and 4),
  section       text,
  phone         text check (phone is null or phone ~ '^[0-9+][0-9 +()-]{6,19}$'),
  organization  text,

  -- Deactivation instead of deletion: an alumnus or a departed staff member
  -- must stop being able to sign in without breaking the announcements and
  -- audit rows that reference them.
  is_active     boolean not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_role_idx       on public.profiles (role) where is_active;
create index profiles_department_idx on public.profiles (department) where department is not null;
create unique index profiles_roll_number_idx on public.profiles (roll_number) where roll_number is not null;
create unique index profiles_employee_id_idx on public.profiles (employee_id) where employee_id is not null;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- current_user_role()
--
-- SECURITY DEFINER so it reads profiles as the table owner. This is what keeps
-- the profiles RLS policies from recursing: a policy that called a plain
-- function to read profiles would re-enter its own policy forever.
--
-- For the same reason profiles deliberately does NOT `force row level
-- security` — forcing it would subject the owner to the policies too and
-- reintroduce the recursion.
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

/** Admin or management — the two roles allowed to see institutional data. */
create or replace function public.is_staff_level()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() in ('admin', 'management'), false);
$$;

-- ---------------------------------------------------------------------------
-- Profile creation on signup
--
-- `role` is hardcoded to the column default. It is NEVER read from
-- raw_user_meta_data, which the client controls at signup — accepting it there
-- would let anyone register as an admin.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privilege-escalation guard
--
-- The "users may update their own profile" policy below is what makes a normal
-- profile editable. Without this trigger that same policy would let any student
-- run `update profiles set role = 'admin' where id = auth.uid()`.
--
-- auth.uid() is null for the service role, which is trusted server-side code —
-- that is the path admin provisioning uses.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;  -- service role / server-side provisioning
  end if;

  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an administrator can change an account role.'
      using errcode = '42501';
  end if;

  if new.is_active is distinct from old.is_active and not public.is_admin() then
    raise exception 'Only an administrator can activate or deactivate an account.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privilege
  before update on public.profiles
  for each row execute function public.guard_profile_privilege_change();

-- ---------------------------------------------------------------------------
-- Announcements — the cross-role feature that signing in actually unlocks.
--
-- `audience` empty means everyone; otherwise the reader's role must appear in
-- it. `department` narrows further (null = all departments).
-- ---------------------------------------------------------------------------
create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) between 3 and 200),
  body        text not null check (length(btrim(body)) between 1 and 8000),
  author_id   uuid references public.profiles (id) on delete set null,

  audience    public.user_role[] not null default '{}',
  department  text,

  published   boolean not null default false,
  publish_at  timestamptz not null default now(),
  expires_at  timestamptz,

  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  check (expires_at is null or expires_at > publish_at)
);

create index announcements_feed_idx
  on public.announcements (pinned desc, publish_at desc)
  where published;
create index announcements_audience_idx on public.announcements using gin (audience);

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

/** True when the current user should see this announcement. */
create or replace function public.can_read_announcement(
  p_audience   public.user_role[],
  p_department text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (cardinality(p_audience) = 0 or public.current_user_role() = any (p_audience))
    and (
      p_department is null
      or public.is_staff_level()
      or p_department = (select department from public.profiles where id = auth.uid())
    );
$$;

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table public.profiles      enable row level security;
alter table public.announcements enable row level security;
alter table public.announcements force row level security;
-- NB: profiles is intentionally NOT forced — see current_user_role() above.

-- --- profiles ---
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (public.is_staff_level());

-- Column-level protection for role/is_active comes from the trigger above;
-- policies in Postgres cannot restrict which columns an update touches.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- --- announcements ---
create policy announcements_select_visible on public.announcements
  for select to authenticated
  using (
    published
    and publish_at <= now()
    and (expires_at is null or expires_at > now())
    and public.can_read_announcement(audience, department)
  );

-- Authors see their own drafts.
create policy announcements_select_own on public.announcements
  for select to authenticated
  using (author_id = auth.uid());

create policy announcements_insert_staff on public.announcements
  for insert to authenticated
  with check (
    public.current_user_role() in ('faculty', 'management', 'admin')
    and author_id = auth.uid()
  );

create policy announcements_update_own on public.announcements
  for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

create policy announcements_delete_own on public.announcements
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- anon gets nothing on either table.
revoke all on public.profiles      from anon;
revoke all on public.announcements from anon;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.announcements to authenticated;

-- ---------------------------------------------------------------------------
-- Admin provisioning helper. Service-role only (the API layer checks the
-- caller is an admin before invoking it) — anon and authenticated get no
-- execute grant.
-- ---------------------------------------------------------------------------
create or replace function public.set_user_role(
  p_user_id uuid,
  p_role    public.user_role
)
returns public.profiles
language plpgsql
as $$
declare
  v_row public.profiles;
begin
  update public.profiles
     set role = p_role
   where id = p_user_id
  returning * into v_row;

  if not found then
    raise exception 'No profile for user %', p_user_id using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.set_user_role(uuid, public.user_role) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Directory view for the admin user-management screen.
-- ---------------------------------------------------------------------------
create or replace view public.user_directory as
select
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.department,
  p.roll_number,
  p.employee_id,
  p.organization,
  p.is_active,
  p.created_at
from public.profiles p
order by p.role, p.full_name nulls last, p.email;

revoke all on public.user_directory from anon, authenticated;
