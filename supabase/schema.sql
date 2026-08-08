-- Exelentic – Vbank Dashboard · Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).

create table if not exists public.manual_errors (
  id uuid primary key,
  time timestamptz not null,
  category text not null,
  process text not null,
  folder text,
  description text not null,
  downtime_minutes integer,
  reported_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id integer primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

-- Anyone with the anon key (i.e. anyone with the dashboard link) can read and write.
alter table public.manual_errors enable row level security;
alter table public.app_settings enable row level security;

create policy "anon read manual_errors" on public.manual_errors for select using (true);
create policy "anon insert manual_errors" on public.manual_errors for insert with check (true);
create policy "anon update manual_errors" on public.manual_errors for update using (true);
create policy "anon delete manual_errors" on public.manual_errors for delete using (true);

create policy "anon read app_settings" on public.app_settings for select using (true);
create policy "anon insert app_settings" on public.app_settings for insert with check (true);
create policy "anon update app_settings" on public.app_settings for update using (true);
