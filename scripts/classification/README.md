# Error classification workbook

Round trip for classifying Orchestrator errors (Exelentic / V-Bank IT /
Neustartfähiger Vorgang / Nicht als Fehler anzeigen) and deciding which
processes and queues the dashboard includes.

1. `node scripts/export-errors.mjs out.json` — pulls every faulted job and every
   failed/retried/abandoned queue item (all folders, full history) plus all
   Releases and QueueDefinitions. Needs the VPN and `.env`.
2. `python scripts/classification/build_xlsx.py out.json Vbank-Fehlerklassifizierung.xlsx`
   — groups messages into families (`family.py`, on top of `normalizeMessage`
   from `src/lib/errors.ts`) and writes the workbook with dropdowns.
3. The filled workbook comes back; the "Varianten (Detail)" sheet maps every
   normalised message to its family number, which drives the code update.

The workbook contains raw error samples with customer names — keep it out of git.
