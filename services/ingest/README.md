# @vbank/ingest — Orchestrator → Supabase worker

Runs on a machine inside the Barracuda VPN (the spare laptop today, the Oracle VM later).
Reads UiPath Orchestrator 22.10 once a day and writes raw rows, retry chains, transactions
and review items to Supabase with the service-role key. Nothing else ever talks to Orchestrator.

```bash
cp services/ingest/.env.example services/ingest/.env   # fill in; quote the client secret (#)
npm run ingest -w services/ingest -- check             # token · folders · jobs · select variant · Supabase write
npm run ingest -w services/ingest -- catalog           # folders / processes / queues → automations
npm run ingest -w services/ingest -- import-workbook "C:/…/Vbank-Fehlerklassifizierung_v2.xlsx"
npm run ingest -w services/ingest -- backfill --from 2026-06-11 --to 2026-09-08
npm run ingest -w services/ingest -- daily
npm run ingest -w services/ingest -- serve             # scheduler + "Jetzt abrufen" requests
```

## How a run works

1. **Catalogue**: folders, releases and queue definitions are upserted into `automations`
   (`p:<folder>/<release>` / `q:<queue id>`). New rows start `included = true, is_new = true`;
   decisions from the Control Board (included, display names, human minutes) are never overwritten.
2. **Select variant**: `QueueItems` is probed with `$select` FULL (AncestorId, RetryNumber,
   ManualAncestorId) → BASE → MIN. 22.10 answers 400 for unknown columns. The variant in use is
   stored in `ingest_state.qi_select_variant`; MIN switches chain linking to "same queue + same
   reference within 7 days" (`ingest_state.chain_linking = reference`).
3. **Window**: jobs and queue items with `CreationTime` in the window, per included folder, five
   folders at a time over one keep-alive connection pool. Excluded queues are filtered server-side
   (`QueueDefinitionId ne …`) and client-side; excluded processes client-side.
4. **Chains**: items are completed with ancestors outside the window (DB, else fetched by id) and
   with attempts already stored for the same chain, then collapsed — one transaction per chain,
   judged by its final attempt, attributed to the Berlin day of its *first* attempt.
5. **Pending**: items that were New/InProgress/Retried when they left the lookback are re-read.
6. **Review items**: failed application-exception transactions and faulted jobs become `open`
   items with a suggestion (exact message → family → keyword fallback); recovered chains become
   `info` items pre-set to "Neustartfähiger Vorgang"; confirmed items are never touched — a later
   outcome change only sets `outcome_changed`.
7. **Days**: `days.fetched_through` advances to the window end when no folder failed. A failed
   folder makes the run `partial`; the next run's 3-day lookback repairs it.

`daily` covers `[start of (today − LOOKBACK_DAYS), now]`. `serve` runs it at `DAILY_AT`
(Europe/Berlin) and retries every 30 minutes until 08:00 when Orchestrator is unreachable
(typical symptom: a 403 HTML page from the public gateway = VPN down).

## Windows service (laptop)

Task Scheduler → *Create Task*: trigger "At log on", action `cmd /c npm run ingest -w services/ingest -- serve`,
start in the repo folder, "Run whether user is logged on or not", restart on failure. On the
Oracle VM a systemd unit does the same.
