# Exelentic – Vbank · Intelligent Analysis Dashboard

A live analytics dashboard over **UiPath Orchestrator** (Automation Cloud or self-hosted): job runs,
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
   API calls to Orchestrator (browsers cannot call the UiPath API directly).

   **Self-hosted Orchestrator (on-premises / Automation Suite, e.g. only reachable through
   the Barracuda VPN):** leave `VITE_UIPATH_ORG` empty and set instead

   - `VITE_UIPATH_ORCHESTRATOR_URL` — standalone: `https://<host>`; Automation Suite:
     `https://<host>/{org}/{tenant}/orchestrator_`
   - `VITE_UIPATH_IDENTITY_URL` — standalone: `https://<host>/identity`; Automation Suite:
     `https://<host>/identity_`
   - `VITE_UIPATH_TENANT` — the tenant name (sent as `X-UIPATH-TenantName` on standalone)
   - `VITE_UIPATH_TLS_INSECURE=true` only if the server uses an internal CA certificate

   The External Application is created in the Orchestrator's identity management portal
   (`https://<host>/identity/management` → External Applications, confidential app, with
   the application scopes listed above). Because the proxy runs on your machine, connect
   the VPN client first — the browser itself never talks to Orchestrator.

   Put the client ID and secret in **double quotes** in `.env` — UiPath secrets often
   contain `#`, which otherwise starts a comment and silently empties the value.

3. Test the connection (token → folders → jobs, with a hint for every failure):

   ```
   npm run check
   ```

4. Start:

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

## Deploying

**Automation Cloud (Vercel):**

1. In [vercel.json](vercel.json), replace `YOUR-ORG` / `YOUR-TENANT` with the same values
   as in `.env` (rewrites replace the local dev proxy for the UiPath API).
2. Add all `VITE_*` variables as Vercel environment variables.
3. Anyone with the link can see operational data and add manual errors — put Vercel
   access protection (or similar) in front for anything beyond internal use.

**Self-hosted Orchestrator behind a VPN:** Vercel (or any public host) cannot reach it. Set
the Vercel environment variable `VITE_DEMO_DEFAULT=true` so the public link shows the demo
data instead of the setup screen. For live data,
the dashboard has to run where the VPN does — either each user runs `npm run dev` on a
VPN-connected machine, or the built app (`npm run build` → `dist/`) is served from a web
server inside the V-Bank network with the same two reverse-proxy rules as the dev server:
`/orch/*` → `VITE_UIPATH_ORCHESTRATOR_URL/*` and `/identity/*` → `VITE_UIPATH_IDENTITY_URL/*`.
The reverse proxy must keep upstream connections alive (nginx: `proxy_http_version 1.1;`
and `proxy_set_header Connection "";`) — a fresh TLS connection to this Orchestrator costs
about 2 s, and a refresh issues ~70 requests.

Verified against V-Bank's standalone Orchestrator **22.10**: it rejects
`$expand=ProcessingException` (the exception is selected inline instead) and the license
endpoint returns 403 for an External Application, so the utilization view uses the
license capacity configured under Settings.

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
