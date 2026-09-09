-- Published views for the dashboard, review statistics, and the RPCs that
-- change review state. The pub_* views run with the owner's rights
-- (security_invoker = false), so they can read the staging tables; each one
-- checks the caller's role itself and exposes neither raw texts nor references.

create or replace function public.is_reader() returns boolean
language sql stable as $$ select public.my_role() in ('viewer', 'reviewer', 'admin') $$;

-- ── Dashboard views ─────────────────────────────────────────────────────────
create or replace view public.pub_datenstand with (security_invoker = false) as
  select max(business_day) as day
  from public.days
  where state = 'published' and public.is_reader();

create or replace view public.pub_automations with (security_invoker = false) as
  select id, kind, technical_name, folder_name as folder, display_name, display_description as description,
         human_minutes_per_item
  from public.automations
  where included and public.is_reader();

create or replace view public.pub_jobs with (security_invoker = false) as
  select j.automation_id, j.business_day as day, j.creation_time as created_at, j.start_time as started_at,
         j.end_time as ended_at, j.state,
         case when j.state = 'Faulted' then r.category end as category,
         case when j.state = 'Faulted' and r.category is distinct from 'nicht_anzeigen' then j.info_norm end as family
  from public.jobs j
  join public.days d on d.business_day = j.business_day and d.state = 'published'
  join public.automations a on a.id = j.automation_id and a.included
  left join public.review_items r on r.job_id = j.id and r.status = 'confirmed'
  where public.is_reader();

create or replace view public.pub_transactions with (security_invoker = false) as
  select t.automation_id, t.business_day as day, t.first_creation_time as created_at,
         i.start_processing as started_at, i.end_processing as ended_at,
         case
           when t.outcome = 'failed' and r.category = 'nicht_anzeigen' then 'ignored'
           when t.outcome = 'successful' then 'success'
           else t.outcome::text
         end as outcome,
         t.attempts, t.processing_ms,
         case when t.outcome = 'failed' and r.category is distinct from 'nicht_anzeigen' then r.category end as category,
         case when t.outcome = 'failed' and r.category is distinct from 'nicht_anzeigen' then t.reason_norm end as family
  from public.transactions t
  join public.days d on d.business_day = t.business_day and d.state = 'published'
  join public.automations a on a.id = t.automation_id and a.included
  left join public.queue_items i on i.id = t.final_item_id
  left join public.review_items r on r.transaction_id = t.id and r.status = 'confirmed'
  where t.outcome <> 'deleted' and public.is_reader();

create or replace view public.pub_manual_errors with (security_invoker = false) as
  select m.id, m.automation_id, m.target_name, m.occurred_at, m.category, m.description, m.downtime_minutes
  from public.manual_errors m
  join public.days d on d.business_day = m.business_day and d.state = 'published'
  where m.category <> 'nicht_anzeigen' and public.is_reader();

create or replace view public.pub_settings with (security_invoker = false) as
  select hours_per_pt, health_ok_min as ok_min, health_attention_min as attention_min
  from public.settings
  where public.is_reader();

grant select on public.pub_datenstand, public.pub_automations, public.pub_jobs, public.pub_transactions,
                public.pub_manual_errors, public.pub_settings to authenticated;

-- ── Control Board: review statistics per day ────────────────────────────────
create or replace view public.day_review_stats with (security_invoker = true) as
  select d.business_day, d.state, d.fetched_through, d.stale, d.stale_reason, d.published_at, d.published_by,
         count(*) filter (where r.status = 'open')      as open_count,
         count(*) filter (where r.status = 'confirmed') as confirmed_count,
         count(*) filter (where r.status = 'info')      as info_count,
         count(*) filter (where r.status = 'open' and r.unknown_family) as unknown_count,
         (select count(*) from public.transactions t where t.business_day = d.business_day and t.outcome = 'pending') as pending_tx,
         (select count(*) from public.manual_errors m where m.business_day = d.business_day) as manual_count
  from public.days d
  left join public.review_items r on r.business_day = d.business_day
  group by d.business_day;
grant select on public.day_review_stats to authenticated;

-- The internal counterpart of the pub_* views for the Auswertung page: same
-- columns, all days, reviewer only (RLS on the base tables applies).
create or replace view public.int_transactions with (security_invoker = true) as
  select t.id, t.automation_id, t.business_day as day, t.first_creation_time as created_at, t.attempts,
         t.processing_ms, t.outcome::text as outcome, t.reason_norm as family, t.family_key,
         r.status as review_status, r.category, r.suggested_category, r.suggested_confidence
  from public.transactions t
  left join public.review_items r on r.transaction_id = t.id;
grant select on public.int_transactions to authenticated;

-- ── RPCs ────────────────────────────────────────────────────────────────────
create or replace function public.assert_reviewer() returns void
language plpgsql stable as $$
begin
  if not public.is_reviewer() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
end $$;

create or replace function public.confirm_items(ids bigint[], cat public.error_category default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform public.assert_reviewer();
  update public.review_items
     set category = coalesce(cat, suggested_category),
         status = 'confirmed',
         confirmed_by = auth.uid(),
         confirmed_at = now(),
         updated_at = now()
   where id = any (ids) and status <> 'confirmed'
     and coalesce(cat, suggested_category) is not null;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.set_item_category(item_id bigint, cat public.error_category, item_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_reviewer();
  update public.review_items
     set category = cat, status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(),
         note = coalesce(item_note, note), updated_at = now()
   where id = item_id;
end $$;

create or replace function public.reopen_item(item_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_reviewer();
  update public.review_items
     set status = 'open', category = null, confirmed_by = null, confirmed_at = null, updated_at = now()
   where id = item_id;
end $$;

-- Days publish as a queue: every earlier day since go-live must be published first.
create or replace function public.publish_day(d date)
returns void language plpgsql security definer set search_path = public as $$
declare rec public.days%rowtype; live date; day_end timestamptz;
begin
  perform public.assert_reviewer();
  select * into rec from public.days where business_day = d for update;
  if not found then raise exception 'DAY_UNKNOWN'; end if;
  if rec.state = 'published' then raise exception 'DAY_ALREADY_PUBLISHED'; end if;
  -- the day must have been fetched completely (00:00 Berlin of the following day)
  day_end := ((d + 1)::timestamp at time zone 'Europe/Berlin');
  if rec.fetched_through is null or rec.fetched_through < day_end then raise exception 'DAY_INCOMPLETE'; end if;
  if exists (select 1 from public.review_items where business_day = d and status = 'open') then
    raise exception 'DAY_HAS_OPEN_ITEMS';
  end if;
  select go_live_day into live from public.settings where id = 1;
  if exists (select 1 from public.days where business_day < d and business_day >= coalesce(live, d) and state <> 'published') then
    raise exception 'PREVIOUS_DAY_UNPUBLISHED';
  end if;
  update public.days set state = 'published', published_at = now(), published_by = auth.uid(), stale = false, stale_reason = null
   where business_day = d;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, business_day)
  values (auth.uid(), auth.jwt() ->> 'email', 'publish_day', 'days', d::text, d);
end $$;

create or replace function public.unpublish_day(d date, reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_reviewer();
  if reason is null or length(trim(reason)) = 0 then raise exception 'REASON_REQUIRED'; end if;
  if not exists (select 1 from public.days where business_day = d and state = 'published') then raise exception 'DAY_NOT_PUBLISHED'; end if;
  -- only the latest published day may be reopened (keeps the queue gap-free); admins may override
  if not public.is_admin() and exists (select 1 from public.days where business_day > d and state = 'published') then
    raise exception 'NOT_LATEST_PUBLISHED_DAY';
  end if;
  update public.days set state = 'open', unpublished_at = now(), unpublished_by = auth.uid(), unpublish_reason = reason
   where business_day = d;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, business_day, after)
  values (auth.uid(), auth.jwt() ->> 'email', 'unpublish_day', 'days', d::text, d, jsonb_build_object('reason', reason));
end $$;

create or replace function public.request_ingest(kind text, params jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  perform public.assert_reviewer();
  insert into public.ingest_requests (kind, params, requested_by) values (kind, params, auth.uid()) returning id into new_id;
  return new_id;
end $$;

grant execute on function public.confirm_items, public.set_item_category, public.reopen_item,
  public.publish_day, public.unpublish_day, public.request_ingest to authenticated;
