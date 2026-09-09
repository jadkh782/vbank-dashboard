-- Triggers: frozen published days, stale marking, learning from decisions,
-- audit trail, and the days ledger.

-- ── Frozen days ─────────────────────────────────────────────────────────────
-- Once a day is published, people cannot change its categories or manual
-- errors; the ingest worker (service role) may still write.
create or replace function public.trg_freeze() returns trigger
language plpgsql as $$
declare d date;
begin
  if public.is_service() then return coalesce(new, old); end if;
  d := coalesce(new.business_day, old.business_day);
  if exists (select 1 from public.days where business_day = d and state = 'published') then
    raise exception 'DAY_FROZEN' using hint = 'Veröffentlichung zurücknehmen, dann ändern.';
  end if;
  return coalesce(new, old);
end $$;

create trigger review_items_freeze before insert or update or delete on public.review_items
  for each row execute function public.trg_freeze();
create trigger manual_errors_freeze before insert or update or delete on public.manual_errors
  for each row execute function public.trg_freeze();

-- ── Stale marking ───────────────────────────────────────────────────────────
-- Late ingest changes to a published day do not silently change published
-- numbers; the day is flagged for a person to re-publish.
create or replace function public.trg_stale() returns trigger
language plpgsql as $$
declare d date; changed boolean := true;
begin
  d := new.business_day;
  if tg_table_name = 'transactions' and tg_op = 'UPDATE' then
    changed := new.outcome is distinct from old.outcome or new.attempts is distinct from old.attempts;
  elsif tg_table_name = 'jobs' and tg_op = 'UPDATE' then
    changed := new.state is distinct from old.state;
  elsif tg_table_name = 'review_items' and tg_op = 'UPDATE' then
    changed := new.category is distinct from old.category or new.status is distinct from old.status;
  end if;
  if changed then
    update public.days set stale = true,
           stale_reason = coalesce(stale_reason, tg_table_name || ' ' || lower(tg_op) || ' ' || now()::text)
     where business_day = d and state = 'published' and not stale;
  end if;
  return new;
end $$;

create trigger transactions_stale after insert or update on public.transactions for each row execute function public.trg_stale();
create trigger jobs_stale after insert or update on public.jobs for each row execute function public.trg_stale();
create trigger review_items_stale after insert or update on public.review_items for each row execute function public.trg_stale();

-- ── Learning ────────────────────────────────────────────────────────────────
-- Every confirmed decision feeds the message- and family-level mappings.
create or replace function public.trg_learn() returns trigger
language plpgsql security definer set search_path = public as $$
declare k public.error_kind; msg text; fam text;
begin
  if new.status <> 'confirmed' or new.category is null then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' and old.category = new.category then return new; end if;
  if new.transaction_id is not null then
    select t.kind, t.reason_norm, t.family_key into k, msg, fam from public.transactions t where t.id = new.transaction_id;
  else
    select 'job'::public.error_kind, j.info_norm, j.family_key into k, msg, fam from public.jobs j where j.id = new.job_id;
  end if;
  if msg is not null then
    insert into public.mapping_messages (kind, message_norm, category, source, decided_count, category_counts, last_decided_at, last_decided_by)
    values (k, msg, new.category, 'decision', 1, jsonb_build_object(new.category::text, 1), now(), new.confirmed_by)
    on conflict (kind, message_norm) do update
      set decided_count = public.mapping_messages.decided_count + 1,
          category_counts = public.mapping_messages.category_counts
            || jsonb_build_object(new.category::text, coalesce((public.mapping_messages.category_counts ->> new.category::text)::int, 0) + 1),
          source = 'decision', last_decided_at = now(), last_decided_by = new.confirmed_by;
    update public.mapping_messages m set category = (
      select key::public.error_category from jsonb_each_text(m.category_counts) order by value::int desc, key limit 1)
     where m.kind = k and m.message_norm = msg;
  end if;
  if fam is not null then
    insert into public.mapping_families (kind, family_key, category, source, decided_count, category_counts, last_seen)
    values (k, fam, new.category, 'decision', 1, jsonb_build_object(new.category::text, 1), now())
    on conflict (kind, family_key) do update
      set decided_count = public.mapping_families.decided_count + 1,
          category_counts = public.mapping_families.category_counts
            || jsonb_build_object(new.category::text, coalesce((public.mapping_families.category_counts ->> new.category::text)::int, 0) + 1),
          source = 'decision', last_seen = now();
    update public.mapping_families f set category = (
      select key::public.error_category from jsonb_each_text(f.category_counts) order by value::int desc, key limit 1)
     where f.kind = k and f.family_key = fam;
  end if;
  return new;
end $$;

create trigger review_items_learn after insert or update of status, category on public.review_items
  for each row execute function public.trg_learn();

-- ── Audit trail ─────────────────────────────────────────────────────────────
create or replace function public.trg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, business_day, before, after)
  values (auth.uid(), auth.jwt() ->> 'email', lower(tg_op), tg_table_name,
          coalesce(to_jsonb(coalesce(new, old)) ->> 'id', to_jsonb(coalesce(new, old)) ->> 'business_day', to_jsonb(coalesce(new, old)) ->> 'user_id'),
          case when to_jsonb(coalesce(new, old)) ? 'business_day' then (to_jsonb(coalesce(new, old)) ->> 'business_day')::date end,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger review_items_audit after update or delete on public.review_items for each row execute function public.trg_audit();
create trigger manual_errors_audit after insert or update or delete on public.manual_errors for each row execute function public.trg_audit();
create trigger automations_audit after update on public.automations for each row execute function public.trg_audit();
create trigger settings_audit after update on public.settings for each row execute function public.trg_audit();
create trigger mapping_messages_audit after update or delete on public.mapping_messages for each row execute function public.trg_audit();
create trigger mapping_families_audit after update or delete on public.mapping_families for each row execute function public.trg_audit();
create trigger profiles_audit after insert or update or delete on public.profiles for each row execute function public.trg_audit();

-- ── Days ledger ─────────────────────────────────────────────────────────────
create or replace function public.trg_days_upsert() returns trigger
language plpgsql as $$
begin
  insert into public.days (business_day) values (new.business_day) on conflict do nothing;
  return new;
end $$;

create trigger transactions_days before insert on public.transactions for each row execute function public.trg_days_upsert();
create trigger jobs_days before insert on public.jobs for each row execute function public.trg_days_upsert();
create trigger manual_errors_days before insert on public.manual_errors for each row execute function public.trg_days_upsert();
