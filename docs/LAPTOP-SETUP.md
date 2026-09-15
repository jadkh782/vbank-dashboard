# Worker machine setup (Windows laptop on the Barracuda VPN)

The ingest worker is the only component that talks to UiPath Orchestrator, so it must run on a
machine inside the Barracuda VPN. Everything else (dashboard, Control Board, database) lives on
Vercel and Supabase and never touches this machine. This guide sets the worker up once; afterwards
the machine needs no attention beyond staying on.

## 0. What you need in hand

- The laptop, Windows 10/11 x64, power supply, network.
- Barracuda VPN client with a VPN identity that may **connect automatically at Windows start**.
- `services\ingest\.env` from the previous worker machine (Orchestrator credentials + Supabase
  service-role key). It is the only secret; nothing else is configured.
- Roughly 30 minutes.

## 1. Barracuda first

1. Install the client, log in, tick **auto-connect at start / reconnect on failure**, save credentials.
2. Reboot. After the reboot, without touching anything, open a browser and load
   `https://asvbank17.v-bank.com/identity/.well-known/openid-configuration`. JSON = the tunnel
   is up. A 403 page or a timeout = it is not; fix this before continuing. (A known failure mode
   is "connected" in the client but every DNS lookup times out — disconnect and reconnect.)

## 2. Software

1. Install **Node.js 22 LTS** (https://nodejs.org, Windows x64 installer) and **Git for Windows**.
2. Open PowerShell and clone **outside OneDrive**:
   ```powershell
   mkdir C:\vbank; cd C:\vbank
   git clone -b v2 https://github.com/jadkh782/vbank-dashboard.git
   cd vbank-dashboard
   npm install
   ```
3. Copy the `.env` to `C:\vbank\vbank-dashboard\services\ingest\.env`.

## 3. Verify

```powershell
npm run ingest -- check
```
Expected: five ✓ lines — token, 29 folders, jobs count, select variant `base`, supabase write —
then "All good.". Anything else: VPN (403/timeout) or a wrong `.env`.

Close the gap since the last fetch (dates inclusive; the run is idempotent):
```powershell
npm run ingest -- backfill --from 2026-09-10 --to 2026-09-15
```

## 4. Install the service

From an **elevated** PowerShell (for the power settings), in the repo folder:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\laptop\Install-Worker.ps1 -NoSleep
```
This registers the scheduled task **"V-Bank Ingest Worker"** (at startup, 2-minute delay, restart
on failure, no time limit, runs whether the user is logged on or not), sets the power plan to never
sleep or hibernate on mains and to ignore the lid, and starts the task.

Check: Control Board → Einstellungen shows **Worker aktiv** with a fresh "Letztes Lebenszeichen"
and "Nächster planmäßiger Abruf" tomorrow 02:00. Press **Jetzt abrufen**: the request goes
queued → running → done within a minute. Log: `C:\vbank\vbank-dashboard\logs\ingest.log`.

## 5. Windows housekeeping

- Windows Update: Settings → Windows Update → Advanced → **Active hours** covering 01:00–09:00, so
  restarts never land on the 02:00 run. A restart is harmless anyway (the task restarts and the
  lookback repairs the run), the VPN just has to come back with the machine.
- Sign-in: the task uses S4U, so nobody needs to stay logged in. Leave the laptop at the lock screen.
- Antivirus/sleep tools: exclude `C:\vbank` if scans slow Node down; nothing else.

## 6. Day-to-day behaviour

| Situation | What happens |
|---|---|
| Normal night | 02:00 Berlin: the last 3 days are fetched again; new failures become review items. |
| VPN down at 02:00 | run fails, retried every 30 min until 08:00; visible as `failed` under "Letzte Abrufe". |
| Machine was off for days | the next successful run stretches back to the last good day (up to 14 days) — no manual backfill. Longer gaps: `backfill --from …`. |
| "Jetzt abrufen" | the button writes a request to Supabase; the worker picks it up within 30 s. |
| Code update | `powershell -ExecutionPolicy Bypass -File scripts\laptop\Update-Worker.ps1` (pull, install, check, restart). |
| Moving to another machine | repeat this guide there, then delete `services\ingest\.env` here and rotate the Supabase service key. |

## 7. Alternative: no long-running process

If a long-running task is not wanted, register `npm run ingest -- once` every 5 minutes instead of
`serve`: it processes queued requests, runs the daily fetch when due, and exits. Same `.env`, same
log. Change the action in Task Scheduler or adapt `Install-Worker.ps1` (`serve` → `once`, trigger
"repeat every 5 minutes").
