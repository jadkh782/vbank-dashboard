# Supabase project

Two projects on the free tier, both **EU region**:

| Project | Purpose | Who reads it |
|---|---|---|
| `vbank-prod` | live data from Orchestrator (ingest worker), Control Board, dashboard | reviewers, viewers |
| `vbank-demo` | seeded demo rows (optional; the dashboard demo needs no database) | demo viewer |

## Apply the schema

```bash
npx supabase login                      # once per machine
npx supabase link --project-ref <ref>   # from Project Settings → General
npx supabase db push                    # applies supabase/migrations/*.sql in order
```

Migrations:

1. `0001_schema.sql` — enums, tables, indexes, `profiles` + `my_role()`
2. `0002_rls.sql` — no anon access; reviewers on staging tables, viewers via views only
3. `0003_views_rpc.sql` — `pub_*` views for the dashboard, `day_review_stats`, RPCs
   (`confirm_items`, `set_item_category`, `reopen_item`, `publish_day`, `unpublish_day`, `request_ingest`)
4. `0004_triggers.sql` — frozen published days, stale marking, learning, audit log, days ledger

## Users

Create users under Authentication → Users (e-mail + password), then give each one a role:

```sql
insert into public.profiles (user_id, email, role, display_name)
select id, email, 'reviewer', 'Vorname Nachname' from auth.users where email = 'name@exelentic.com';
```

Roles: `viewer` (dashboard only), `reviewer` (Control Board + dashboard), `admin` (may un-publish
older days, manages profiles). A user without a profile row sees nothing.

## Keys

- **anon key** → `VITE_SUPABASE_ANON_KEY` of both apps. Public by design; RLS decides.
- **service-role key** → only `services/ingest/.env` (and the seed script). Never in an app, never in git.

## Business day

`business_day` columns are written by the ingest worker with `berlinDay()` from
`packages/shared/src/time/berlin.ts` (Europe/Berlin). Postgres cannot compute this in a
generated column (`at time zone` is not immutable), so TypeScript is the single source of truth.
