import { useQuery } from '@tanstack/react-query'
import { autoCleanName } from '@vbank/shared'
import { supabase } from '../auth/supabase'
import type {
  AutomationRow,
  DayStats,
  IngestRequestRow,
  IngestRunRow,
  IngestStateRow,
  JobRow,
  ManualErrorRow,
  MappingFamilyRow,
  MappingMessageRow,
  QueueItemRow,
  ReviewItemRow,
  ReviewRow,
  SettingsRow,
  TransactionRow,
} from './types'

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data as T
}

const PAGE = 1000
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; ; page++) {
    const data = unwrap(await build(page * PAGE, page * PAGE + PAGE - 1), what) ?? []
    out.push(...data)
    if (data.length < PAGE) return out
  }
}

async function selectIn<T>(table: string, columns: string, col: string, values: (string | number)[]): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < values.length; i += 200) {
    const part = values.slice(i, i + 200)
    out.push(...(unwrap(await supabase().from(table).select(columns).in(col, part), table) as T[]))
  }
  return out
}

export const displayNameOf = (a: AutomationRow | undefined) => a?.display_name?.trim() || (a ? autoCleanName(a.technical_name) : '–')

// ── Days ────────────────────────────────────────────────────────────────────
export function useDays() {
  return useQuery({
    queryKey: ['days'],
    queryFn: async () => unwrap(await supabase().from('day_review_stats').select('*').order('business_day', { ascending: false }), 'days') as DayStats[],
  })
}

// ── Automations ─────────────────────────────────────────────────────────────
export function useAutomationRows() {
  return useQuery({
    queryKey: ['automations'],
    queryFn: async () => fetchAll<AutomationRow>((f, t) => supabase().from('automations').select('*').order('folder_name').order('technical_name').range(f, t), 'automations'),
    staleTime: 60_000,
  })
}

// ── Review items of one day, enriched ───────────────────────────────────────
export function useDayReview(day: string | undefined) {
  const automations = useAutomationRows()
  return useQuery({
    queryKey: ['day-review', day, automations.data?.length ?? 0],
    enabled: !!day && !!automations.data,
    queryFn: async (): Promise<ReviewRow[]> => {
      const items = await fetchAll<ReviewItemRow>((f, t) => supabase().from('review_items').select('*').eq('business_day', day!).order('id').range(f, t), 'review_items')
      const txIds = items.map((i) => i.transaction_id).filter((x): x is number => x !== null)
      const jobIds = items.map((i) => i.job_id).filter((x): x is number => x !== null)
      const [txs, jobs] = await Promise.all([
        txIds.length ? selectIn<TransactionRow>('transactions', '*', 'id', txIds) : Promise.resolve([]),
        jobIds.length ? selectIn<JobRow>('jobs', '*', 'id', jobIds) : Promise.resolve([]),
      ])
      const txById = new Map(txs.map((t) => [t.id, t]))
      const jobById = new Map(jobs.map((j) => [j.id, j]))
      const autoById = new Map((automations.data ?? []).map((a) => [a.id, a]))
      return items.map<ReviewRow>((i) => {
        const transaction = i.transaction_id !== null ? txById.get(i.transaction_id) : undefined
        const job = i.job_id !== null ? jobById.get(i.job_id) : undefined
        return {
          ...i,
          automation: autoById.get(i.automation_id),
          transaction,
          job,
          time: transaction?.first_creation_time ?? job?.creation_time ?? '',
          reference: null,
          attempts: transaction?.attempts ?? 1,
          finalStatus: transaction?.final_status ?? job?.state ?? '',
          message: transaction?.reason_norm ?? job?.info_norm ?? null,
        }
      })
    },
  })
}

/** All attempts of a transaction's chain, with raw exception texts (drawer). */
export function useChainAttempts(transactionId: number | null | undefined) {
  return useQuery({
    queryKey: ['chain', transactionId],
    enabled: transactionId !== null && transactionId !== undefined,
    queryFn: async () =>
      unwrap(
        await supabase()
          .from('queue_items')
          .select('id, status, exception_type, exception_reason, creation_time, start_processing, end_processing, reference, retry_number, attempt_no, link_method')
          .eq('chain_id', transactionId!)
          .order('attempt_no'),
        'queue_items',
      ) as QueueItemRow[],
  })
}

// ── Manual errors ───────────────────────────────────────────────────────────
export function useManualErrors(fromDay?: string, toDay?: string) {
  return useQuery({
    queryKey: ['manual-errors', fromDay, toDay],
    queryFn: async () => {
      let q = supabase().from('manual_errors').select('*').order('occurred_at', { ascending: false })
      if (fromDay) q = q.gte('business_day', fromDay)
      if (toDay) q = q.lte('business_day', toDay)
      return unwrap(await q, 'manual_errors') as ManualErrorRow[]
    },
  })
}

// ── Settings, mappings, ingest ──────────────────────────────────────────────
export function useSettingsRow() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => unwrap(await supabase().from('settings').select('*').eq('id', 1).single(), 'settings') as SettingsRow,
  })
}

export function useMappingFamilies() {
  return useQuery({
    queryKey: ['mapping-families'],
    queryFn: async () => fetchAll<MappingFamilyRow>((f, t) => supabase().from('mapping_families').select('*').order('last_seen', { ascending: false }).range(f, t), 'mapping_families'),
  })
}

export function useMappingMessages() {
  return useQuery({
    queryKey: ['mapping-messages'],
    queryFn: async () => fetchAll<MappingMessageRow>((f, t) => supabase().from('mapping_messages').select('*').order('message_norm').range(f, t), 'mapping_messages'),
  })
}

export function useIngestRuns() {
  return useQuery({
    queryKey: ['ingest-runs'],
    queryFn: async () => unwrap(await supabase().from('ingest_runs').select('*').order('started_at', { ascending: false }).limit(20), 'ingest_runs') as IngestRunRow[],
  })
}

export function useIngestRequests(poll: boolean) {
  return useQuery({
    queryKey: ['ingest-requests'],
    refetchInterval: poll ? 10_000 : false,
    queryFn: async () => unwrap(await supabase().from('ingest_requests').select('*').order('requested_at', { ascending: false }).limit(10), 'ingest_requests') as IngestRequestRow[],
  })
}

export function useIngestState() {
  return useQuery({
    queryKey: ['ingest-state'],
    queryFn: async () => unwrap(await supabase().from('ingest_state').select('*'), 'ingest_state') as IngestStateRow[],
  })
}

// ── Auswertung: transactions + jobs over a period (internal view) ───────────
export interface IntTransaction {
  id: number
  automation_id: string
  day: string
  created_at: string
  attempts: number
  processing_ms: number | null
  outcome: string
  family: string | null
  family_key: string | null
  review_status: string | null
  category: string | null
}

export function usePeriodTransactions(fromDay: string, toDay: string) {
  return useQuery({
    queryKey: ['int-transactions', fromDay, toDay],
    queryFn: async () => fetchAll<IntTransaction>((f, t) => supabase().from('int_transactions').select('*').gte('day', fromDay).lte('day', toDay).range(f, t), 'int_transactions'),
  })
}

export function usePeriodFaultedJobs(fromDay: string, toDay: string) {
  return useQuery({
    queryKey: ['int-jobs', fromDay, toDay],
    queryFn: async () =>
      fetchAll<JobRow & { business_day: string }>(
        (f, t) => supabase().from('jobs').select('*').eq('state', 'Faulted').gte('business_day', fromDay).lte('business_day', toDay).range(f, t),
        'jobs',
      ),
  })
}

export function usePeriodReviewItems(fromDay: string, toDay: string) {
  return useQuery({
    queryKey: ['int-review', fromDay, toDay],
    queryFn: async () => fetchAll<ReviewItemRow>((f, t) => supabase().from('review_items').select('*').gte('business_day', fromDay).lte('business_day', toDay).range(f, t), 'review_items'),
  })
}
