import type { Automation, Category, ManualErrorRow, Run, Txn } from '@vbank/shared'
import { autoCleanName, berlinDayEnd, berlinDayStart } from '@vbank/shared'
import { supabase } from '../auth/supabase'
import type { DataSource, WindowRows } from './source'

// Row shapes of the pub_* views (supabase/migrations/0003_views_rpc.sql).
interface AutomationRow {
  id: string
  kind: 'process' | 'queue'
  technical_name: string
  folder: string
  display_name: string | null
  description: string | null
  human_minutes_per_item: number | null
}
interface JobRow {
  automation_id: string
  day: string
  created_at: string
  started_at: string | null
  ended_at: string | null
  state: string
  category: Category | null
  family: string | null
}
interface TxnRow {
  automation_id: string
  day: string
  created_at: string
  started_at: string | null
  ended_at: string | null
  outcome: Txn['outcome']
  attempts: number
  processing_ms: number | null
  category: Category | null
  family: string | null
}
interface ManualRow {
  id: string
  automation_id: string | null
  target_name: string
  occurred_at: string
  category: Category
  description: string
  downtime_minutes: number | null
}
interface SettingsRow {
  hours_per_pt: number
  ok_min: number
  attention_min: number
}

const PAGE = 1000

/** PostgREST caps a request at 1000 rows; page with .range() until a short page. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; ; page++) {
    const { data, error } = await build(page * PAGE, page * PAGE + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

const runState = (s: string): Run['state'] =>
  s === 'Successful' ? 'success' : s === 'Faulted' ? 'faulted' : s === 'Stopped' ? 'stopped' : 'running'

export function supabaseSource(): DataSource {
  const sb = supabase()
  return {
    kind: 'supabase',
    datenstand: async () => {
      const { data, error } = await sb.from('pub_datenstand').select('day').maybeSingle<{ day: string | null }>()
      if (error) throw new Error(error.message)
      return data?.day ?? null
    },
    automations: async () => {
      const rows = await fetchAll<AutomationRow>((f, t) => sb.from('pub_automations').select('*').order('id').range(f, t))
      return rows.map<Automation>((r) => ({
        id: r.id,
        kind: r.kind,
        technicalName: r.technical_name,
        folder: r.folder,
        displayName: r.display_name?.trim() || autoCleanName(r.technical_name),
        description: r.description?.trim() || null,
        humanMinutesPerItem: r.human_minutes_per_item,
      }))
    },
    settings: async () => {
      const { data, error } = await sb.from('pub_settings').select('*').maybeSingle<SettingsRow>()
      if (error) throw new Error(error.message)
      return {
        hoursPerPT: data?.hours_per_pt ?? 8,
        thresholds: { okMin: data?.ok_min ?? 90, attentionMin: data?.attention_min ?? 75 },
      }
    },
    rows: async (fromDay, toDay): Promise<WindowRows> => {
      const [jobs, txns, manual] = await Promise.all([
        fetchAll<JobRow>((f, t) => sb.from('pub_jobs').select('*').gte('day', fromDay).lte('day', toDay).order('created_at').range(f, t)),
        fetchAll<TxnRow>((f, t) =>
          sb.from('pub_transactions').select('*').gte('day', fromDay).lte('day', toDay).order('created_at').range(f, t),
        ),
        fetchAll<ManualRow>((f, t) =>
          sb
            .from('pub_manual_errors')
            .select('*')
            .gte('occurred_at', berlinDayStart(fromDay).toISOString())
            .lt('occurred_at', berlinDayEnd(toDay).toISOString())
            .order('occurred_at')
            .range(f, t),
        ),
      ])
      return {
        runs: jobs.map<Run>((j) => ({
          automationId: j.automation_id,
          day: j.day,
          createdAt: j.created_at,
          startedAt: j.started_at,
          endedAt: j.ended_at,
          state: runState(j.state),
          category: j.category,
          family: j.family,
        })),
        txns: txns.map<Txn>((t) => ({
          automationId: t.automation_id,
          day: t.day,
          createdAt: t.created_at,
          startedAt: t.started_at,
          endedAt: t.ended_at,
          outcome: t.outcome,
          attempts: t.attempts,
          processingMs: t.processing_ms,
          category: t.category,
          family: t.family,
        })),
        manualErrors: manual.map<ManualErrorRow>((m) => ({
          id: m.id,
          automationId: m.automation_id,
          targetName: m.target_name,
          occurredAt: m.occurred_at,
          category: m.category,
          description: m.description,
          downtimeMinutes: m.downtime_minutes,
        })),
      }
    },
  }
}
