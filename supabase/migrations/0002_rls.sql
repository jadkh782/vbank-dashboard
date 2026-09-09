-- Row-level security. No anonymous access anywhere: the anon key alone reads
-- nothing. Viewers see published data only, through the pub_* views (0003).
-- Reviewers/admins work on the staging tables. The ingest worker uses the
-- service-role key, which bypasses RLS.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

create or replace function public.is_reviewer() returns boolean
language sql stable as $$ select public.my_role() in ('reviewer', 'admin') $$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.my_role() = 'admin' $$;

-- profiles: everyone sees their own row; admins manage all.
alter table public.profiles enable row level security;
create policy profiles_self_read  on public.profiles for select using (user_id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- catalogue & settings: reviewers read and edit the editable fields.
alter table public.folders enable row level security;
create policy folders_reviewer_read on public.folders for select using (public.is_reviewer());

alter table public.automations enable row level security;
create policy automations_reviewer_read   on public.automations for select using (public.is_reviewer());
create policy automations_reviewer_update on public.automations for update using (public.is_reviewer()) with check (public.is_reviewer());
revoke update on public.automations from authenticated;
grant update (included, is_new, display_name, display_description, human_minutes_per_item, comment) on public.automations to authenticated;

alter table public.settings enable row level security;
create policy settings_reviewer_read   on public.settings for select using (public.is_reviewer());
create policy settings_reviewer_update on public.settings for update using (public.is_reviewer()) with check (public.is_reviewer());

-- raw rows: reviewers read (the drawer shows raw texts), nobody else.
alter table public.jobs enable row level security;
create policy jobs_reviewer_read on public.jobs for select using (public.is_reviewer());
alter table public.queue_items enable row level security;
create policy queue_items_reviewer_read on public.queue_items for select using (public.is_reviewer());
alter table public.transactions enable row level security;
create policy transactions_reviewer_read on public.transactions for select using (public.is_reviewer());

-- review layer
alter table public.days enable row level security;
create policy days_reviewer_read on public.days for select using (public.is_reviewer());
-- publish / unpublish only through the RPCs (security definer).

alter table public.review_items enable row level security;
create policy review_items_reviewer_read   on public.review_items for select using (public.is_reviewer());
create policy review_items_reviewer_update on public.review_items for update using (public.is_reviewer()) with check (public.is_reviewer());
revoke update on public.review_items from authenticated;
grant update (note) on public.review_items to authenticated;   -- status/category via RPC only

alter table public.manual_errors enable row level security;
create policy manual_errors_reviewer_all on public.manual_errors for all using (public.is_reviewer()) with check (public.is_reviewer());

alter table public.mapping_messages enable row level security;
create policy mapping_messages_reviewer_read   on public.mapping_messages for select using (public.is_reviewer());
create policy mapping_messages_reviewer_write  on public.mapping_messages for all using (public.is_reviewer()) with check (public.is_reviewer());
alter table public.mapping_families enable row level security;
create policy mapping_families_reviewer_read   on public.mapping_families for select using (public.is_reviewer());
create policy mapping_families_reviewer_write  on public.mapping_families for all using (public.is_reviewer()) with check (public.is_reviewer());

-- ingest bookkeeping
alter table public.ingest_runs enable row level security;
create policy ingest_runs_reviewer_read on public.ingest_runs for select using (public.is_reviewer());
alter table public.ingest_requests enable row level security;
create policy ingest_requests_reviewer_read   on public.ingest_requests for select using (public.is_reviewer());
create policy ingest_requests_reviewer_insert on public.ingest_requests for insert with check (public.is_reviewer() and requested_by = auth.uid());
alter table public.ingest_state enable row level security;
create policy ingest_state_reviewer_read on public.ingest_state for select using (public.is_reviewer());
alter table public.audit_log enable row level security;
create policy audit_log_reviewer_read on public.audit_log for select using (public.is_reviewer());
