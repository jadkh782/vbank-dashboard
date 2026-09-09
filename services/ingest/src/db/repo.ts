import type { ErrorKind, MappingRow } from '@vbank/shared'
import { check, db, selectIn, upsertChunked } from './client'
import type { AutomationRow, FolderRow, IngestRequestRow, JobRow, MappingRowDb, QueueItemRow, ReviewItemRow, TransactionRow } from './rows'

const now = () => new Date().toISOString()

// ── Catalogue ───────────────────────────────────────────────────────────────
export const upsertFolders = (rows: FolderRow[]) => upsertChunked('folders', rows, 'id')

/** Catalogue columns only — `included`, `is_new` and the display fields keep their values. */
export const upsertAutomations = (rows: Omit<AutomationRow, 'included' | 'is_new'>[]) => upsertChunked('automations', rows, 'id')

export async function loadAutomations(): Promise<AutomationRow[]> {
  return (check(await db().from('automations').select('*'), 'load automations') as AutomationRow[]) ?? []
}

export async function loadSettings(): Promise<{ keyword_fallback: string[]; go_live_day: string | null }> {
  const row = check(await db().from('settings').select('keyword_fallback, go_live_day').eq('id', 1).maybeSingle(), 'load settings') as {
    keyword_fallback: string[]
    go_live_day: string | null
  } | null
  return row ?? { keyword_fallback: [], go_live_day: null }
}

// ── Raw rows ────────────────────────────────────────────────────────────────
export const upsertJobs = (rows: JobRow[]) => upsertChunked('jobs', rows, 'id')
export const upsertQueueItems = (rows: QueueItemRow[]) => upsertChunked('queue_items', rows, 'id')

export const loadQueueItemsByIds = (ids: number[]) => selectIn<QueueItemRow>('queue_items', '*', 'id', ids)
export const loadQueueItemsByChainIds = (chainIds: number[]) => selectIn<QueueItemRow>('queue_items', '*', 'chain_id', chainIds)

/** Items still undecided that were created before `before` (outside the current lookback). */
export async function loadPendingItems(before: Date, limit = 2000): Promise<QueueItemRow[]> {
  return (
    (check(
      await db()
        .from('queue_items')
        .select('*')
        .in('status', ['New', 'InProgress', 'Retried'])
        .lt('creation_time', before.toISOString())
        .order('creation_time', { ascending: false })
        .limit(limit),
      'load pending items',
    ) as QueueItemRow[]) ?? []
  )
}

// ── Transactions ────────────────────────────────────────────────────────────
export const loadTransactions = (ids: number[]) =>
  selectIn<Pick<TransactionRow, 'id' | 'outcome' | 'attempts' | 'outcome_changed_at'>>('transactions', 'id, outcome, attempts, outcome_changed_at', 'id', ids)
export const upsertTransactions = (rows: TransactionRow[]) => upsertChunked('transactions', rows, 'id')

// ── Review items ────────────────────────────────────────────────────────────
export async function loadReviewItems(txIds: number[], jobIds: number[]): Promise<ReviewItemRow[]> {
  const a = txIds.length ? await selectIn<ReviewItemRow>('review_items', '*', 'transaction_id', txIds) : []
  const b = jobIds.length ? await selectIn<ReviewItemRow>('review_items', '*', 'job_id', jobIds) : []
  return [...a, ...b]
}
export const upsertReviewItemsByTx = (rows: ReviewItemRow[]) => upsertChunked('review_items', rows, 'transaction_id')
export const upsertReviewItemsByJob = (rows: ReviewItemRow[]) => upsertChunked('review_items', rows, 'job_id')
export async function deleteReviewItems(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  check(await db().from('review_items').delete().in('id', ids), 'delete review items')
}

// ── Mappings ────────────────────────────────────────────────────────────────
function toMapping(r: MappingRowDb): MappingRow {
  return { category: r.category, decidedCount: r.decided_count, categoryCounts: r.category_counts as MappingRow['categoryCounts'] }
}

export async function loadMappings(
  kind: ErrorKind,
  messages: string[],
  families: string[],
): Promise<{ byMessage: Map<string, MappingRow>; byFamily: Map<string, MappingRow> }> {
  const byMessage = new Map<string, MappingRow>()
  const byFamily = new Map<string, MappingRow>()
  const m = messages.length ? await selectIn<MappingRowDb>('mapping_messages', '*', 'message_norm', [...new Set(messages)]) : []
  for (const r of m) if (r.kind === kind) byMessage.set(r.message_norm!, toMapping(r))
  const f = families.length ? await selectIn<MappingRowDb>('mapping_families', '*', 'family_key', [...new Set(families)]) : []
  for (const r of f) if (r.kind === kind) byFamily.set(r.family_key!, toMapping(r))
  return { byMessage, byFamily }
}

// ── Days ────────────────────────────────────────────────────────────────────
/** Record how far the window reached for each day; never moves backwards. */
export async function touchDays(days: string[], fetchedThrough: Date): Promise<void> {
  if (days.length === 0) return
  check(await db().from('days').upsert(days.map((d) => ({ business_day: d })), { onConflict: 'business_day', ignoreDuplicates: true }), 'ensure days')
  const iso = fetchedThrough.toISOString()
  check(
    await db().from('days').update({ fetched_through: iso }).in('business_day', days).or(`fetched_through.is.null,fetched_through.lt.${iso}`),
    'touch days',
  )
}

// ── Runs, requests, state ───────────────────────────────────────────────────
export async function startRun(kind: string, from: Date | null, to: Date | null): Promise<number> {
  const row = check(
    await db()
      .from('ingest_runs')
      .insert({ kind, window_from: from?.toISOString() ?? null, window_to: to?.toISOString() ?? null })
      .select('id')
      .single(),
    'start run',
  ) as { id: number }
  return row.id
}

export async function finishRun(id: number, status: 'ok' | 'partial' | 'failed', stats: Record<string, unknown>, error?: string, foldersFailed: number[] = []) {
  check(
    await db().from('ingest_runs').update({ finished_at: now(), status, stats, error: error ?? null, folders_failed: foldersFailed }).eq('id', id),
    'finish run',
  )
}

export async function claimRequest(): Promise<IngestRequestRow | null> {
  const queued = check(
    await db().from('ingest_requests').select('*').eq('status', 'queued').order('requested_at').limit(1).maybeSingle(),
    'poll requests',
  ) as IngestRequestRow | null
  if (!queued) return null
  const claimed = check(
    await db().from('ingest_requests').update({ status: 'running', started_at: now() }).eq('id', queued.id).eq('status', 'queued').select('id'),
    'claim request',
  ) as { id: number }[]
  return claimed.length ? queued : null
}

export async function finishRequest(id: number, ok: boolean, result: Record<string, unknown> | null, error?: string) {
  check(
    await db().from('ingest_requests').update({ status: ok ? 'done' : 'failed', finished_at: now(), result, error: error ?? null }).eq('id', id),
    'finish request',
  )
}

export async function getState<T>(key: string): Promise<T | null> {
  const row = check(await db().from('ingest_state').select('value').eq('key', key).maybeSingle(), 'get state') as { value: T } | null
  return row?.value ?? null
}

export async function setState(key: string, value: unknown): Promise<void> {
  check(await db().from('ingest_state').upsert({ key, value, updated_at: now() }, { onConflict: 'key' }), 'set state')
}
