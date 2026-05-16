-- Ejecutar en Supabase → SQL Editor antes de usar la pantalla Carga masiva.

create table if not exists public.member_visits (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  reference_phone text,
  record_type text not null default 'Miembros o Visitas',
  created_at timestamptz not null default now()
);

alter table public.member_visits enable row level security;

create policy "member_visits_select_anon"
  on public.member_visits for select to anon using (true);

create policy "member_visits_insert_anon"
  on public.member_visits for insert to anon with check (true);
