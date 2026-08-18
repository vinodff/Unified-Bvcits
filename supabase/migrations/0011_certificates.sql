-- BVCITS 2.0 — 0011_certificates
-- Bulk certificate generation and public verification.
--
-- Two tables:
--   certificate_batches — one row per generation run (the event/workshop)
--   certificates        — one row per generated certificate
--
-- The public verification page reads certificates by certificate_number
-- without authentication, so every visitor can confirm a certificate is real.

-- ---------------------------------------------------------------------------
-- Batches
-- ---------------------------------------------------------------------------
create table public.certificate_batches (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  template_text text not null,
  total_count   integer not null default 0,
  generated_by  uuid not null references public.profiles (id),
  created_at    timestamptz not null default now()
);

alter table public.certificate_batches enable row level security;

-- Admins, management and faculty can see their own batches.
create policy "batch_select" on public.certificate_batches
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_active
        and profiles.role in ('admin', 'management', 'faculty')
    )
  );

create policy "batch_insert" on public.certificate_batches
  for insert with check (
    generated_by = auth.uid()
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_active
        and profiles.role in ('admin', 'management', 'faculty')
    )
  );

-- ---------------------------------------------------------------------------
-- Individual certificates
-- ---------------------------------------------------------------------------
create table public.certificates (
  id                 uuid primary key default gen_random_uuid(),
  certificate_number text not null unique,
  student_name       text not null,
  roll_number        text not null,
  branch             text not null,
  event_title        text not null,
  event_date         text,
  certificate_text   text not null,
  batch_id           uuid not null references public.certificate_batches (id) on delete cascade,
  generated_by       uuid not null references public.profiles (id),
  generated_at       timestamptz not null default now(),
  is_verified        boolean not null default true
);

create index certificates_batch_idx   on public.certificates (batch_id);
create index certificates_roll_idx    on public.certificates (roll_number);
create index certificates_number_idx  on public.certificates (certificate_number);

alter table public.certificates enable row level security;

-- Authenticated privileged users can manage certificates.
create policy "cert_select" on public.certificates
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_active
        and profiles.role in ('admin', 'management', 'faculty')
    )
  );

create policy "cert_insert" on public.certificates
  for insert with check (
    generated_by = auth.uid()
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_active
        and profiles.role in ('admin', 'management', 'faculty')
    )
  );

create policy "cert_update" on public.certificates
  for update using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_active
        and profiles.role in ('admin', 'management', 'faculty')
    )
  );

-- Public verification: anyone can look up a certificate by its number.
-- This uses the service-role client on the verification page, so no RLS
-- policy is needed for anonymous reads — the API route handles it.
