-- BVCITS 2.0 — 0005_announcement_oversight
--
-- Fixes an inconsistency in can_read_announcement() from 0004.
--
-- That function already let management and admin bypass DEPARTMENT scoping
-- (`or public.is_staff_level()` in the department clause) but still applied
-- AUDIENCE scoping to them. The result: an administrator could not see a notice
-- published to students, so the people responsible for the platform were the
-- only ones unable to audit what had gone out on it. Faculty appeared to work
-- only because authors see their own posts via announcements_select_own.
--
-- Staff-level roles now bypass both filters. Everyone else is unchanged:
-- a student still sees only student-targeted and untargeted notices.

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
    -- Oversight: management and admin see every published notice, whoever it
    -- was aimed at. This is the audit path, and it is why the two clauses
    -- below are skipped rather than widened.
    public.is_staff_level()
    or (
      (cardinality(p_audience) = 0 or public.current_user_role() = any (p_audience))
      and (
        p_department is null
        or p_department = (select department from public.profiles where id = auth.uid())
      )
    );
$$;
