# Handover – V-Bank Automatisierung (v2)

State as of 10 Sep 2026, branch **`v2`** (not yet merged; `main` = old v1 SPA, tag `v1-spa-demo`,
no longer deployed anywhere). Read this first in a new session; §7 lists what is live.

## 1. What it is

An npm-workspaces monorepo with three deliverables and two shared packages:

| Path | What | Where it runs |
|---|---|---|
| `apps/dashboard` | **Statusbericht** — the public stakeholder dashboard (German). Reads **published days only** from Supabase, or demo data. Login via Supabase Auth. | Vercel |
| `apps/control-board` | **Control Board** — internal review app (German). Every failed transaction and faulted run is categorised by a person; days are published as a queue. | VPN laptop (static build) |
| `services/ingest` | Worker: UiPath Orchestrator → Supabase, daily at 02:00 Berlin + on-demand. The only component that talks to Orchestrator. | VPN laptop (`ingest serve`) |
| `packages/shared` | Pure TS: domain types, six categories (+ validated colours), aggregates, `normalizeMessage`, `familyKey` (Python-parity), `suggest`, retry-chain collapse, Berlin-day helpers, demo generator. | — |
| `packages/ui` | React primitives (DataTable, StatTile, ChartKit, Drawer, badges, theme) and the design-system CSS (tokens, base, chrome, forms, drawer). | — |
| `supabase/migrations` | 0001 schema · 0002 RLS · 0003 published views + RPCs · 0004 triggers. | Supabase (EU) |
| `tools/classification` | Python workbook builder (`build_xlsx.py`, `family.py` = oracle for `familyKey`, `dump_family_keys.py`). | dev machine |

**The customer never sees the Control Board.** The dashboard shows "Datenstand: <letzter
veröffentlichter Tag>", presets end there, and nothing in it names review, publication or
Orchestrator. Grep gates in §6 keep it that way.

## 2. Domain rules (decided Sep 9, 2026)

- **Six categories** for every open point: Exelentic/UiPath · V-Bank IT · Neustartfähiger Vorgang
  (neutral, nobody blamed) · Nicht als Fehler anzeigen (counts as correct, never listed) ·
  Fachbereich · Avaloq. Keys in `packages/shared/src/categories.ts`. Colours validated with the
  dataviz checker in the bar order violet → teal → amber → blue, slate last.
- **Retry chains**: one transaction per chain, judged by its **final attempt**, attributed to the
  Berlin day of its **first** attempt. Retried-then-successful = **one success** (shown as
  "Nach Neustart erfolgreich"). An orphan `Retried` is pending, never a failure.
- **Business exceptions** = "Korrekt erkannte Aussteuerung", counted as correct.
- **Review**: everything open must be confirmed by a person (bulk "Vorschläge übernehmen" counts).
  Suggestions: recovered → Neustartfähig · business → nicht anzeigen · exact normalised message
  mapping · family mapping · keyword fallback (V-Bank IT, low) · none → "ohne Vorschlag".
  Every confirmation feeds `mapping_messages` / `mapping_families` (trigger `trg_learn`).
- **Publishing**: once a day, by a person, **in order** (oldest unpublished day first; the
  dashboard's Datenstand waits). Published days are **frozen** (`DAY_FROZEN`); un-publish with a
  reason (latest day only, admins may override). Late ingest changes set `days.stale`.
- Positive framing ("30 von 34 laufen störungsfrei", "Offene Punkte"), no € figures, hours + PT.

## 3. Commands

```
npm install                       # once; links the workspaces
npm run typecheck                 # every package
npm test                          # vitest: shared (aggregates, chains, suggest, Berlin days, family parity), apps
npm run build                     # every app
npm run dev                       # dashboard on :5173  (add ?demo for demo data)
npm run dev:cb                    # control board on :5174 (needs apps/control-board/.env)
npm run ingest -- <cmd>           # worker CLI, see services/ingest/README.md
```

Ingest commands: `check` · `catalog` · `daily` · `backfill --from YYYY-MM-DD [--to …]` ·
`import-workbook <xlsx> [--force] [--allow-mismatch]` · `serve`.

Demo: `?demo` on any dashboard URL, or `VITE_DEMO_DEFAULT=true` at build time (the
`vbank-dashboard-demo` Vercel project). No login, no database, 90 days of generated data up to
yesterday. `?live` forces the real connection.

## 4. Environments

| File | Keys |
|---|---|
| `apps/dashboard/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DEMO_DEFAULT` (demo build only) |
| `apps/control-board/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `services/ingest/.env` | `ORCH_URL`, `IDENTITY_URL`, `TENANT`, `CLIENT_ID`, `CLIENT_SECRET` (**quote it, it contains `#`**), `SCOPES`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOOKBACK_DAYS`, `DAILY_AT` |

The anon key is public by design; RLS + the `profiles.role` decide. The service-role key lives
only in `services/ingest/.env` on the VPN machine (outside OneDrive sync; rotate when moving to
the VM). Orchestrator facts: standalone **22.10** at `https://asvbank17.v-bank.com`, tenant
`Default`, reachable only inside the Barracuda VPN (public DNS answers 403 = VPN down).

## 5. Hard-won facts (don't re-learn these)

1. 22.10 rejects `$expand=ProcessingException` → it is in `$select`. It may also reject
   `AncestorId/RetryNumber/ManualAncestorId` → the worker probes FULL → BASE → MIN per run and
   stores the variant in `ingest_state.qi_select_variant`; MIN links chains by reference.
2. Every new TLS connection to the host costs ~2.3 s → one keep-alive pool (undici), 5 folders in
   parallel.
3. `business_day` is computed in TS (`berlinDay`), not SQL: `at time zone` is not immutable, so
   Postgres cannot do it in a generated column.
4. `familyKey` must stay byte-identical to `tools/classification/family.py`: the equivalence test
   runs against a gitignored oracle (`packages/shared/test/fixtures/family-keys.json`, written by
   `dump_family_keys.py` from `Desktop/Vbank-Fehlerklassifizierung-daten.json`) — 2 075/2 075.
   `import-workbook` re-checks every variant against the workbook's Muster.
5. Shell heredocs longer than ~200 lines get truncated in this environment; use the file tool.
6. Vercel CLI: `vercel login --non-interactive` prints a device code to approve in the browser
   (interactive prompts hang in this shell). A static folder deploy still triggers `npm install`
   on Vercel; use `--prebuilt` with a Build Output (`scripts/deploy-demo.mjs`).

## 6. Verification gates

- `npm run typecheck && npm test && npm run build` (unused locals/params are errors).
- Public dashboard must not mention the review layer:
  `grep -rniE "control board|veröffentlich|orchestrator" apps/dashboard/src` → only auth wording.
- Dashboard in the browser (`?demo`): Datenstand in the header, presets end there, phone width
  shows name/status/volume/quality without horizontal scroll, drawer opens/closes with Esc.

## 7. Environments in place (Sep 10, 2026)

| What | Where | Notes |
|---|---|---|
| Supabase | project `VbankDashboard`, ref `icflpfjgkcbvmiusskrr`, eu-central-1 | migrations 0001–0004 applied via the Management API (`supabase login --token …`; the browser login flow needs a TTY). `settings.go_live_day = 2026-06-12`. |
| Admin user | `rpaorch@exelentic.com`, role `admin` | initial password in `C:/Users/JadKhater/.supabase/vbank-admin-initial-password.txt` — change it after the first login. Add users under Authentication → Users plus a `profiles` row (see `supabase/README.md`). |
| Real dashboard | **https://vbank-dashboard.vercel.app** | prebuilt static deploy (`npm run deploy:dashboard`), reads the Supabase project; shows "Noch keine Daten" until the first day is published. The Vercel project's Git integration is **disconnected** — pushes never rebuild it. |
| Demo dashboard | **https://vbank-dashboard-demo.vercel.app** | `npm run deploy:demo`; no backend, no login. |
| Control Board | `npm run dev:cb` → http://localhost:5174 (dev) or `npm run build -w apps/control-board` + any static server | reviewer/admin login; runs anywhere with outbound HTTPS to Supabase. |
| Worker | `npm run ingest -- serve` | must run on a VPN machine (laptop: Task Scheduler at logon, see `services/ingest/README.md`). Daily 02:00 Berlin + "Jetzt abrufen" / "Vorschläge aktualisieren" / "Katalog aktualisieren" requests. |

Backfill done: 2026-06-12 … 2026-09-10 (13 chunks), 6 748 runs, 11 443 transactions, 888 open
review items (823 without suggestion until the workbook is imported), 187 recovered chains.
Select variant on 22.10 is **base** (AncestorId + RetryNumber, no ManualAncestorId).

### Next steps

1. Fill the classification workbook (internal meeting) → `npm run ingest -- import-workbook <xlsx>`
   (re-suggests all open items) → Control Board: "Vorschläge übernehmen", review the rest, publish
   the days in order. Until then, decide families one by one in the Fehlerkatalog ("Neue
   Zuordnung") and press "Vorschläge aktualisieren".
2. Start the worker on the laptop (Task Scheduler). Without it there is no nightly fetch.
3. Merge `v2` → `main` when convenient (nothing on Vercel depends on `main` any more).
4. Later: Oracle VM, pgTAP smoke tests, `tools/seed-demo`.

## 8. Open items

- `tools/seed-demo` (demo rows in a demo Supabase project for showing the Control Board) — optional.
- pgTAP smoke tests for RLS/RPCs on a staging project (no local Postgres here).
- Oracle VM instead of the laptop (Barracuda Linux client, systemd units).
