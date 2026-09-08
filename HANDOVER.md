# Handover – Vbank Intelligent Analysis Dashboard

State as of 8 Sep 2026. Read this first in a new session; the README covers the
product, this file covers *how things are wired right now* and why.

## 1. What it is

React 18 + Vite + TypeScript single-page app over **UiPath Orchestrator**. No backend:
the Vite server (dev or preview) proxies API calls so the browser never talks to
Orchestrator directly. Data is fetched per folder, aggregated in the browser.

Two views, one codebase:

- **Stakeholder-Ansicht** (default, German, `?view=stakeholder`) – executive status report.
- **Technical view** (`?view=technical`) – Overview, Kennzahlen, Jobs, Queues, Errors,
  Manual Errors, Settings.

## 2. Where the live data comes from

| Item | Value |
|---|---|
| Orchestrator | standalone on-prem **22.10**, `https://asvbank17.v-bank.com` |
| Tenant | `Default` |
| Reachability | **only inside the V-Bank network / Barracuda VPN** (private IP 10.215.13.17). The public DNS record points at an AWS gateway that answers 403 to everyone. |
| Auth | External Application (client credentials), application scopes `OR.Jobs.Read OR.Queues.Read OR.Folders.Read OR.Monitoring.Read OR.Execution.Read` |
| Folders visible | 29 (12 contain queues) |
| License endpoint | returns 403 for the External App → utilization uses the capacity set under Settings |

Credentials live only in the gitignored `.env` (copy per machine). **Quote the client
ID and secret** – the secret contains `#`, which unquoted becomes a comment and empties the
value.

`.env` layout for this deployment:

```
VITE_UIPATH_ORCHESTRATOR_URL=https://asvbank17.v-bank.com
VITE_UIPATH_IDENTITY_URL=https://asvbank17.v-bank.com/identity
VITE_UIPATH_TENANT=Default
VITE_UIPATH_CLIENT_ID="…"
VITE_UIPATH_CLIENT_SECRET="…"
VITE_UIPATH_SCOPES=OR.Jobs.Read OR.Queues.Read OR.Folders.Read OR.Monitoring.Read OR.Execution.Read
VITE_DEMO_DEFAULT=false
```

## 3. Commands

| Command | Purpose |
|---|---|
| `npm run check` | Token → folders → jobs connectivity test with a hint per failure. Run this first when anything looks wrong. |
| `npm run dev` | Dev server on :5173, reads `.env` live. |
| `npm run serve` | **Builds** then serves `dist/` on :4173 with the same proxy; accepts any hostname (for tunnels). Rebuild is automatic, so `.env` changes are picked up. |
| `npm run build` | `tsc && vite build` → `dist/`. |

URL flags: `?demo` forces demo data, `?live` forces the real connection,
`?view=technical` / `?view=stakeholder`.

## 4. How it is hosted right now

- **Live, temporary:** a spare laptop on the Barracuda VPN runs `npm run serve`; VS Code's
  Ports panel forwards 4173 to a `devtunnels.ms` URL (visibility must be **Public** for
  others; Private = only the signed-in GitHub account). Works only while VS Code is open
  and signed in. No login in front of it – share the URL carefully.
- **Vercel:** public showcase only. Cannot reach the VPN. Set `VITE_DEMO_DEFAULT=true`
  in Vercel env vars so it shows demo data instead of the setup screen (not yet done at
  time of writing – check the Vercel project).
- **Planned proper hosting:** Oracle Cloud Always Free x86 VM with the Barracuda Linux
  client, nginx serving `dist/` with the two proxy rules and upstream keep-alive,
  Cloudflare Tunnel + Access in front. Alternative preferred by banks: an internal IIS/nginx
  site provided by V-Bank IT. Both variants are on the one-page deck
  `Vbank-Dashboard-Betriebsmodell.pptx` (Desktop).

The reverse-proxy rules any host needs:

```
/orch/*      → https://asvbank17.v-bank.com/*           (+ X-UIPATH-TenantName: Default is set by the app)
/identity/*  → https://asvbank17.v-bank.com/identity/*
```
Keep upstream connections alive – a new TLS connection to this host costs ~2.3 s.

## 5. Hard-won facts (don't re-learn these)

1. **22.10 rejects `$expand=ProcessingException`** (400 "Ungültige OData-Abfrageoptionen").
   The exception is a complex inline property → it is in `$select` instead
   (`src/api/endpoints.ts`, `QI_SELECT`). Works on Cloud too.
2. **Per-connection cost ~2.3 s.** The Vite proxy uses a keep-alive `https.Agent`
   (`vite.config.ts`). Without it a refresh took > 1 min.
3. **Fan-out is throttled.** Per-folder queries run through a pool of 5 (`pooled` in
   `endpoints.ts`); queue items are only fetched for folders that have queue definitions.
   Full load ≈ 5–9 s for the 7-day window.
4. **Tenant query:** `refetchOnWindowFocus: false`, `staleTime: 30 s`, refresh interval
   default 1 min (per browser, Refresh control in the technical view). Every open tab
   polls on its own (~70 requests per refresh).
5. **VPN can look up but be dead** (adapter "Up", routes present, no traffic, DNS falls
   back to the public 403 endpoint). Symptom in the app: "Token request failed (403/404)".
   Fix: reconnect the Barracuda client, then `npm run check`.
6. The stakeholder view renders nothing (no spinner) if the tenant query is disabled or
   paused; the technical view shows a loading block. Seen once after a Vite restart,
   not reproducible afterwards.

## 6. Code map

```
src/
  api/
    auth.ts        token cache; getAuthConfig() (cloud vs selfHosted); authHeaders()
    client.ts      orchFetch, paging (1000/page, 10 pages cap)
    endpoints.ts   fetchFolders, fetchTenantData (pool, queue-def gating), QI_SELECT
    demo.ts        deterministic demo data = V-Bank Prozessübersicht (26 real process names); isDemoMode()
    store.ts       Supabase or localStorage (manual errors, settings)
    types.ts
  hooks/
    useOrchestrator.ts  useFolders, useTenantData (react-query)
    usePageData.ts      window slicing, status filter, previous period
  lib/
    aggregate.ts   KPIs, scorecard, timeSaved, heatmap
    errors.ts      error normalisation/grouping, responsibility (IT / Exelentic / Fachbereich)
    health.ts      health thresholds, friendly names, stakeholder cards, status strips
    dates.ts, format.ts
  pages/           Overview, Kennzahlen, Jobs, Queues, Errors, ManualErrors, Settings
  pages/stakeholder/  StakeholderView, AutomationTable, DetailPanel, OutcomeStrip
  components/      layout (Header, FilterBar, StakeholderFilterBar), charts, ui
  state/FilterContext.tsx   from/to/preset/statuses/folder/refreshMs
  styles/global.css         token CSS ("Azure Clarity": ink 0F172A, brand 3B82F6)
  theme.ts
scripts/check-orchestrator.mjs   npm run check
vite.config.ts     proxy for dev + preview, keep-alive agent, self-hosted URL handling
vercel.json        rewrites for Automation Cloud only (placeholders) – irrelevant for V-Bank
supabase/schema.sql
```

Domain rules baked in: business exceptions are **not** failures ("korrekt erkannte
Aussteuerung"); each issue has a responsibility (V-Bank IT / Exelentic / Fachbereich);
no € figures, hours and PT only; chart palettes were validated for colour-vision safety –
don't reorder stack colours casually.

## 7. Git state

Local `main` is ahead of GitHub (`jadkh782/vbank-dashboard`) by the commits made in this
session; **push before starting elsewhere**:

```
git push origin main
```

Recent commits (newest first): serve rebuilds first · `npm run serve` proxy mode ·
demo data by default on public hosts + V-Bank demo processes · connect to self-hosted
Orchestrator behind VPN · restyle to Azure Clarity.

## 8. Open items / ideas

- Put a login in front of the live URL (Cloudflare Access) before wider sharing.
- Move hosting from the laptop to the Oracle VM or a V-Bank-internal server.
- Set `VITE_DEMO_DEFAULT=true` on Vercel.
- Supabase project for shared manual errors/settings not created yet (localStorage fallback active).
- Stakeholder view: show a loading/paused state instead of an empty page.
