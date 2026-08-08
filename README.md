# Exelentic – Vbank · Intelligent Analysis Dashboard

A live analytics dashboard over **UiPath Automation Cloud Orchestrator**: job runs,
processes, queue transactions, and a dedicated error-frequency analysis — with global
time-range (presets or any from → to window) and job-status filters, folder scoping,
and configurable auto-refresh.

## Setup

1. Install dependencies (once):

   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your tenant details:

   - `VITE_UIPATH_ORG` / `VITE_UIPATH_TENANT` — the two names in your Orchestrator URL:
     `https://cloud.uipath.com/{org}/{tenant}/...`
   - **Either** a Personal Access Token (`VITE_UIPATH_PAT`) — Automation Cloud →
     Preferences → Personal Access Tokens, with read access to Orchestrator —
   - **or** an External Application (`VITE_UIPATH_CLIENT_ID` + `VITE_UIPATH_CLIENT_SECRET`) —
     Automation Cloud → Admin → External Applications → *Add application* (confidential),
     granting these **application scopes**:
     `OR.Jobs.Read`, `OR.Queues.Read`, `OR.Folders.Read`, `OR.Monitoring.Read`, `OR.Execution.Read`

   `.env` is gitignored; credentials never leave this machine. The dev server proxies all
   API calls to `cloud.uipath.com` (browsers cannot call the UiPath API directly).

3. Start:

   ```
   npm run dev
   ```

   and open http://localhost:5173

## Shared storage (Supabase)

Manually entered errors and dashboard settings (keyword rules, human minutes-per-item,
PT hours, license capacity) are shared across the whole team via a free Supabase project:

1. Create a project at https://supabase.com (free tier).
2. Open its **SQL Editor** and run [supabase/schema.sql](supabase/schema.sql).
3. Copy Project Settings → API → **URL** and **anon public key** into `.env`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

Without these values the dashboard still works — entries are then stored per-browser
(localStorage) and a notice says so.

## Deploying (Vercel)

1. In [vercel.json](vercel.json), replace `YOUR-ORG` / `YOUR-TENANT` with the same values
   as in `.env` (rewrites replace the local dev proxy for the UiPath API).
2. Add all `VITE_*` variables as Vercel environment variables.
3. Anyone with the link can see operational data and add manual errors — put Vercel
   access protection (or similar) in front for anything beyond internal use.

## Pages

| Page | Contents |
|---|---|
| **Overview** | KPI tiles with deltas vs. the previous equivalent period; job runs and queue transactions over time; most frequent errors |
| **Kennzahlen** | The V-Bank scorecard: per-queue items / Successful / AppEx System / AppEx Bot / Manual (IT) / BusinessEx with shares; Zeitersparnis (bot hours → PT vs. human time); Botläufe; Leerläufe (idle runs); Roboterauslastung with Belastungsspitzen and license capacity |
| **Jobs & Processes** | Runs by final state, success-rate trend, per-process table (runs, success %, avg duration, last run), longest-running processes, faulted-run drill-down |
| **Queues & Transactions** | Outcome volumes (successful / app exception / business exception), average handling time trend, per-queue table incl. oldest pending item |
| **Errors & Alerts** | Error counts by source (job faults, AppEx system/bot split via keyword rules, business exceptions, manual IT entries), error timeline, grouped error-frequency table, most affected processes, Orchestrator alerts feed |
| **Manual Errors** | Record IT/server/machine-caused errors (category, process, description, downtime); entries flow into all error reporting; JSON export/import |
| **Settings** | AppEx System keyword rules with live preview, human minutes-per-item per queue, hours per PT, license capacity |

## Stakeholder view (default)

The app opens in the German-language **Stakeholder-Ansicht** for business readers; the
technical dashboard is one click away in the header (or `?view=technical`). It offers:

- **Gesamtstatus** headline, four KPI tiles, and per-process cards grouped by Bereich —
  each with a status-page style timeline strip showing which days had trouble.
- **Click any card** for a slide-over with that process's own trend, figures and causes
  in plain German (Esc or click outside to close).
- **Alle / Nur Auffälligkeiten** filter and sorting by Status, Volumen or Name.
- Ergebnisverteilung, Zeitersparnis (manual vs. automated), Verlauf, and a weekday × hour
  activity heatmap.
- **Präsentation** button — fullscreen with larger type for meeting-room screens (Esc exits).
- **Print / Save as PDF** produces a clean board-pack page (controls hidden, period in the
  header, cards kept whole across page breaks).

Friendly process names, descriptions and the health thresholds are maintained under
Settings in the technical view.

## Notes

- The **From → To** pickers accept any window; presets (Today / 24 h / 7 / 30 days) pre-fill them.
- Each data query is fetched with the *previous equivalent window* included, so KPI deltas
  cost no extra round-trips.
- Queries page through results 1,000 records at a time with a 10,000-record safety cap per
  folder and window; a notice appears if a window is truncated.
- If the token lacks `OR.Monitoring.Read`, the alerts panel degrades gracefully and says so.
