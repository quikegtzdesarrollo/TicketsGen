-- Ejecutar en Supabase → SQL Editor antes de usar Miembros y Visitas.

create table if not exists public.member_visits (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  reference_phone text,
  inviting_church text,
  record_type text not null default 'Miembros o Visitas',
  created_at timestamptz not null default now()
);

alter table public.member_visits enable row level security;

drop policy if exists "member_visits_select_anon" on public.member_visits;
drop policy if exists "member_visits_insert_anon" on public.member_visits;
drop policy if exists "member_visits_delete_anon" on public.member_visits;

create policy "member_visits_select_anon"
  on public.member_visits for select to anon using (true);

create policy "member_visits_insert_anon"
  on public.member_visits for insert to anon with check (true);

create policy "member_visits_delete_anon"
  on public.member_visits for delete to anon using (true);

-- Si la tabla ya existía sin inviting_church:
-- alter table public.member_visits add column if not exists inviting_church text;
