-- V-Bank automation status · schema
-- Applied with `npx supabase db push` (see supabase/README.md). Business days are
-- computed by the ingest worker (packages/shared/src/time/berlin.ts) and stored;
-- Postgres cannot use `at time zone` in a generated column because it is not
-- immutable, so TypeScript is the single source of truth for day attribution.

create extension if not exists pgcrypto;

-- ── Enums ───────────────────────────────────────────────────────────────────
create type public.error_category as enum
  ('exelentic_uipath', 'vbank_it', 'neustartfaehig', 'nicht_anzeigen', 'fachbereich', 'avaloq');
create type public.error_kind as enum ('job', 'app', 'biz');
create type public.tx_outcome as enum ('successful', 'business_exception', 'failed', 'pending', 'deleted');
create type public.review_status as enum ('open', 'confirmed', 'info');
create type public.confidence as enum ('hoch', 'mittel', 'niedrig');
create type public.day_state as enum ('open', 'published');
create type public.user_role as enum ('viewer', 'reviewer', 'admin');
create type public.automation_kind as enum ('process', 'queue');

-- ── Identity ────────────────────────────────────────────────────────────────
create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  role         public.user_role not null default 'viewer',
  display_name text,
  created_at   timestamptz not null default now()
);

create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid()
$$;

-- True for the ingest worker / seed script (service-role key) and for SQL-editor sessions.
create or replace function public.is_service() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', current_user::text) in ('service_role', 'postgres')
$$;

-- ── Catalogue ───────────────────────────────────────────────────────────────
create table public.folders (
  id                   bigint primary key,
  display_name         text not null,
  fully_qualified_name text not null,
  first_seen           timestamptz not null default now(),
  last_seen            timestamptz not null default now()
);

-- One row per process (release) or queue. id: 'p:<folder display name>/<release name>' | 'q:<queue definition id>'.
create table public.automations (
  id                     text primary key,
  kind                   public.automation_kind not null,
  folder_id              bigint not null references public.folders (id),
  folder_name            text not null,
  technical_name         text not null,
  orch_id                bigint,                 -- release id / queue definition id
  process_key            text,
  version                text,
  description            text,
  included               boolean not null default true,
  is_new                 boolean not null default true,
  display_name           text,
  display_description    text,
  human_minutes_per_item numeric,
  comment                text,
  first_seen             timestamptz not null default now(),
  last_seen              timestamptz not null default now(),
  unique (kind, folder_id, technical_name)
);

create table public.settings (
  id                   integer primary key default 1 check (id = 1),
  hours_per_pt         numeric not null default 8,
  health_ok_min        numeric not null default 90,
  health_attention_min numeric not null default 75,
  license_capacity     integer,
  go_live_day          date,
  keyword_fallback     text[] not null default array['server','timeout','connection','network','login','unavailable','remote','disconnected','502','503','crashed'],
  updated_at           timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ── Raw Orchestrator rows (service role only) ───────────────────────────────
create table public.jobs (
  id            bigint primary key,
  key           uuid,
  automation_id text not null references public.automations (id),
  folder_id     bigint not null,
  release_name  text not null,
  state         text not null,
  host_machine  text,
  source        text,
  creation_time timestamptz not null,
  start_time    timestamptz,
  end_time      timestamptz,
  info          text,
  info_norm     text,
  family_key    text,
  business_day  date not null,
  fetched_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index jobs_day_idx on public.jobs (business_day);
create index jobs_automation_time_idx on public.jobs (automation_id, creation_time);
create index jobs_faulted_idx on public.jobs (business_day) where state = 'Faulted';

create table public.queue_items (
  id                 bigint primary key,
  automation_id      text not null references public.automations (id),
  folder_id          bigint not null,
  status             text not null,
  exception_type     text,
  exception_reason   text,
  creation_time      timestamptz not null,
  start_processing   timestamptz,
  end_processing     timestamptz,
  reference          text,
  ancestor_id        bigint,
  manual_ancestor_id bigint,
  retry_number       integer not null default 0,
  chain_id           bigint,
  attempt_no         integer,
  link_method        text,                       -- ancestor | manual | reference | root
  fetched_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index queue_items_chain_idx on public.queue_items (chain_id);
create index queue_items_automation_time_idx on public.queue_items (automation_id, creation_time);
create index queue_items_open_idx on public.queue_items (id) where status in ('New', 'InProgress', 'Retried');
create index queue_items_reference_idx on public.queue_items (automation_id, reference);

-- One row per retry chain = one transaction, judged by its final attempt.
create table public.transactions (
  id                   bigint primary key,       -- chain root item id
  automation_id        text not null references public.automations (id),
  folder_id            bigint not null,
  first_creation_time  timestamptz not null,
  last_creation_time   timestamptz not null,
  business_day         date not null,            -- Berlin day of first_creation_time
  attempts             integer not null default 1,
  was_retried          boolean not null default false,
  final_item_id        bigint not null,
  final_status         text not null,
  final_exception_type text,
  reason_raw           text,
  reason_norm          text,
  family_key           text,
  kind                 public.error_kind,
  outcome              public.tx_outcome not null,
  processing_ms        bigint,
  outcome_changed_at   timestamptz,
  updated_at           timestamptz not null default now()
);
create index transactions_day_idx on public.transactions (business_day);
create index transactions_automation_day_idx on public.transactions (automation_id, business_day);
create index transactions_outcome_day_idx on public.transactions (outcome, business_day);
create index transactions_family_idx on public.transactions (kind, family_key);

-- ── Review layer ────────────────────────────────────────────────────────────
create table public.days (
  business_day     date primary key,
  state            public.day_state not null default 'open',
  fetched_through  timestamptz,
  stale            boolean not null default false,
  stale_reason     text,
  published_at     timestamptz,
  published_by     uuid references auth.users (id),
  unpublished_at   timestamptz,
  unpublished_by   uuid references auth.users (id),
  unpublish_reason text
);

create table public.review_items (
  id                   bigserial primary key,
  kind                 public.error_kind not null check (kind <> 'biz'),
  transaction_id       bigint unique references public.transactions (id) on delete cascade,
  job_id               bigint unique references public.jobs (id) on delete cascade,
  automation_id        text not null references public.automations (id),
  business_day         date not null,
  status               public.review_status not null default 'open',
  category             public.error_category,
  suggested_category   public.error_category,
  suggested_confidence public.confidence,
  suggested_reason     text,
  unknown_family       boolean not null default false,
  confirmed_by         uuid references auth.users (id),
  confirmed_at         timestamptz,
  note                 text,
  outcome_changed      boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((transaction_id is null) <> (job_id is null)),
  check (status <> 'confirmed' or category is not null)
);
create index review_items_day_status_idx on public.review_items (business_day, status);
create index review_items_open_idx on public.review_items (status) where status = 'open';

create table public.manual_errors (
  id               uuid primary key default gen_random_uuid(),
  business_day     date not null,
  occurred_at      timestamptz not null,
  category         public.error_category not null,
  automation_id    text references public.automations (id),
  target_name      text not null,
  description      text not null,
  downtime_minutes integer,
  reported_by      text,
  created_by       uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index manual_errors_day_idx on public.manual_errors (business_day);

-- Learned / imported mappings: exact normalised message and error family.
create table public.mapping_messages (
  kind            public.error_kind not null,
  message_norm    text not null,
  category        public.error_category not null,
  source          text not null default 'decision',   -- workbook | decision
  decided_count   integer not null default 0,
  category_counts jsonb not null default '{}'::jsonb,
  last_decided_at timestamptz,
  last_decided_by uuid references auth.users (id),
  primary key (kind, message_norm)
);

create table public.mapping_families (
  kind            public.error_kind not null,
  family_key      text not null,
  category        public.error_category not null,
  workbook_nr     text,
  source          text not null default 'decision',
  decided_count   integer not null default 0,
  category_counts jsonb not null default '{}'::jsonb,
  first_seen      timestamptz not null default now(),
  last_seen       timestamptz not null default now(),
  primary key (kind, family_key)
);

-- ── Ingest bookkeeping ──────────────────────────────────────────────────────
create table public.ingest_runs (
  id             bigserial primary key,
  kind           text not null,                 -- daily | backfill | on_demand | check | catalog
  window_from    timestamptz,
  window_to      timestamptz,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running', -- running | ok | partial | failed
  stats          jsonb not null default '{}'::jsonb,
  error          text,
  folders_failed bigint[] not null default '{}'
);

create table public.ingest_requests (
  id           bigserial primary key,
  kind         text not null,                   -- fetch_now | backfill | check
  params       jsonb not null default '{}'::jsonb,
  requested_by uuid references auth.users (id),
  requested_at timestamptz not null default now(),
  status       text not null default 'queued',  -- queued | running | done | failed
  started_at   timestamptz,
  finished_at  timestamptz,
  result       jsonb,
  error        text
);

create table public.ingest_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  actor        uuid,
  actor_email  text,
  action       text not null,
  entity       text not null,
  entity_id    text,
  business_day date,
  before       jsonb,
  after        jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
