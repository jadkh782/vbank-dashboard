# Exelentic – V-Bank · Automatisierungsstatus

Monorepo for the V-Bank automation status report: a daily ingest from UiPath Orchestrator into
Supabase, an internal **Control Board** where Exelentic reviews and categorises every failure,
and the public **Statusbericht** dashboard that shows only published days.

```
apps/dashboard        public stakeholder dashboard (Vercel, Supabase Auth, demo mode)
apps/control-board    internal review app (VPN machine)
services/ingest       Orchestrator → Supabase worker
packages/shared       domain, categories, aggregates, classification, retry chains
packages/ui           React primitives + design-system CSS
supabase/migrations   schema, RLS, published views, RPCs, triggers
tools/classification  Python workbook builder (family-key oracle)
```

Start with **[HANDOVER.md](HANDOVER.md)** — architecture, domain rules, commands, environments,
hard-won facts and the cut-over checklist. Component docs: [services/ingest/README.md](services/ingest/README.md),
[supabase/README.md](supabase/README.md), [tools/classification/README.md](tools/classification/README.md).

```bash
npm install
npm run typecheck && npm test && npm run build
npm run dev          # dashboard  → http://localhost:5173/?demo
npm run dev:cb       # control board → http://localhost:5174
```
