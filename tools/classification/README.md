# Error classification workbook

Round trip for classifying Orchestrator errors (Exelentic / V-Bank IT /
Neustartfähiger Vorgang / Nicht als Fehler anzeigen) and deciding which
processes and queues the dashboard includes.

1. The data: the worker (`npm run ingest -- backfill`) stores every job and queue item in
   Supabase. This workbook was built once from a full-history JSON export
   (`Desktop/Vbank-Fehlerklassifizierung-daten.json`, Sep 9, 2026) of all faulted jobs and
   failed/retried/abandoned queue items plus all Releases and QueueDefinitions.
2. `python tools/classification/build_xlsx.py Vbank-Fehlerklassifizierung-daten.json Vbank-Fehlerklassifizierung.xlsx`
   — groups messages into families (`family.py`, on top of `normalizeMessage`
   from `packages/shared/src/classification/normalize.ts`) and writes the workbook with dropdowns.
3. The filled workbook comes back and is imported with
   `npm run ingest -- import-workbook <xlsx>`: families and variants become mapping rows,
   "Einbeziehen" sets `automations.included`. `dump_family_keys.py` writes the oracle for
   `packages/shared`'s TypeScript port of `family.py` (test/family.equivalence.test.ts).

The workbook contains raw error samples with customer names — keep it out of git.
