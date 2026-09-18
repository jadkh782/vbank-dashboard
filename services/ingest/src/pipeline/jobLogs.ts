// Robot logs for faulted runs.
//
// REFramework processes end with a summary exception ("All transaction items
// failed: True. Please check log messages!", "Initialization failed 3 times …")
// and Orchestrator stores only that summary plus a .NET stack trace in Job.Info.
// The cause — "Wait Element Vanish … Activity timeout exceeded", "Excel konnte
// nicht gespeichert werden" — is only in the robot log. So for every faulted job
// we fetch the Error/Fatal log lines once, keep them for the drawer, and when the
// job Info is one of the generic summaries we classify on the first specific
// log line instead (`cause` → info_norm → family_key).

import { familyKey, normalizeMessage } from '@vbank/shared'
import { config } from '../config'
import { db, selectIn, upsertChunked } from '../db/client'
import type { JobRow, LogLine } from '../db/rows'
import { log, pooled } from '../log'
import { odata, type ODataResponse } from '../orchestrator/http'

const MAX_LINES = 40
const MAX_MESSAGE = 2000

/** REFramework summaries and other messages that say nothing about the cause. */
const GENERIC_INFO = [
  /please check log messages/i,
  /all transaction items failed/i,
  /initialization failed \d+ times/i,
  /^no fault details provided$/i,
  /without exception reason$/i,
]
/** Log lines that merely wrap an earlier, more specific line. */
const WRAPPER_LINE = [/^system exception\. max number of retries reached/i, /^throw:?\s*-?\s*all transaction items failed/i, /^throw:?\s*-?\s*initialization failed/i]

export const isGenericJobInfo = (info: string | null): boolean => !info || GENERIC_INFO.some((re) => re.test(info.split('\n')[0]))

interface OrchLog {
  TimeStamp: string
  Level: string
  Message: string | null
}

export async function fetchJobLogLines(folderId: number, jobKey: string): Promise<LogLine[]> {
  const res = await odata<ODataResponse<OrchLog>>(
    `RobotLogs?$filter=JobKey eq ${jobKey} and (Level eq 'Error' or Level eq 'Fatal')&$orderby=TimeStamp&$top=${MAX_LINES}&$select=TimeStamp,Level,Message`,
    folderId,
  )
  return res.value.map((l) => ({ t: l.TimeStamp, level: l.Level, message: (l.Message ?? '').trim().slice(0, MAX_MESSAGE) }))
}

/** First Error/Fatal line that is neither a generic summary nor a wrapper of an earlier line. */
export function pickCause(lines: LogLine[]): string | null {
  for (const l of lines) {
    const first = l.message.split('\n')[0].trim()
    if (!first) continue
    if (GENERIC_INFO.some((re) => re.test(first)) || WRAPPER_LINE.some((re) => re.test(first))) continue
    return first.replace(/^throw:?\s*-?\s*/i, '')
  }
  return null
}

function applyCause(row: JobRow): void {
  if (row.cause && isGenericJobInfo(row.info)) {
    row.info_norm = normalizeMessage(row.cause)
    row.family_key = familyKey(row.info_norm, 'job')
  }
}

/**
 * Fill log_lines/cause for the faulted jobs of a run. Logs already stored for an
 * unchanged job are reused (they never change once the job has ended); Orchestrator
 * is asked once per new faulted job.
 */
export async function enrichFaultedJobs(rows: JobRow[]): Promise<number> {
  const faulted = rows.filter((r) => r.state === 'Faulted' && r.key && r.end_time)
  if (faulted.length === 0) return 0
  const existing = new Map(
    (await selectIn<Pick<JobRow, 'id' | 'end_time' | 'log_lines' | 'cause' | 'log_fetched_at'>>('jobs', 'id, end_time, log_lines, cause, log_fetched_at', 'id', faulted.map((r) => r.id))).map((j) => [j.id, j]),
  )
  const todo: JobRow[] = []
  for (const r of faulted) {
    const have = existing.get(r.id)
    if (have?.log_fetched_at && have.end_time === r.end_time) {
      r.log_lines = have.log_lines
      r.cause = have.cause
      r.log_fetched_at = have.log_fetched_at
      applyCause(r)
    } else todo.push(r)
  }
  await pooled(todo, config().folderConcurrency, async (r) => {
    try {
      r.log_lines = await fetchJobLogLines(r.folder_id, r.key!)
      r.cause = pickCause(r.log_lines)
      r.log_fetched_at = new Date().toISOString()
      applyCause(r)
    } catch (e) {
      // Leave log_fetched_at null so the next run tries again.
      log.warn(`robot logs for job ${r.id}: ${(e as Error).message.slice(0, 160)}`)
    }
  })
  if (todo.length > 0) log.info(`robot logs: ${todo.length} faulted jobs fetched, ${todo.filter((r) => r.cause).length} with a specific cause`)
  return todo.length
}

/** One-off: fetch logs for every stored faulted job in a day range that has none yet. */
export async function backfillJobLogs(fromDay: string, toDay: string): Promise<{ jobs: number; withCause: number; empty: number }> {
  const rows: JobRow[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await db()
      .from('jobs')
      .select('*')
      .eq('state', 'Faulted')
      .is('log_fetched_at', null)
      .not('end_time', 'is', null)
      .gte('business_day', fromDay)
      .lte('business_day', toDay)
      .order('id')
      .range(off, off + 999)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as JobRow[]))
    if (!data || data.length < 1000) break
  }
  log.info(`robot logs backfill: ${rows.length} faulted jobs ${fromDay} … ${toDay} without logs`)
  const fetched = await enrichFaultedJobs(rows)
  const done = rows.filter((r) => r.log_fetched_at)
  // Full rows: a partial upsert would fire trg_days_upsert with a null business_day.
  const nowIso = new Date().toISOString()
  await upsertChunked('jobs', done.map((r) => ({ ...r, updated_at: nowIso })), 'id')
  const out = { jobs: fetched, withCause: done.filter((r) => r.cause).length, empty: done.filter((r) => (r.log_lines?.length ?? 0) === 0).length }
  log.info(`robot logs backfill: ${JSON.stringify(out)} (empty = nothing left in Orchestrator, retention)`)
  return out
}
