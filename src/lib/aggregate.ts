import type { JobState, OrchJob, OrchQueueItem, QueueItemStatus, TenantData } from '../api/types'
import type { AppSettings, ManualError } from '../api/store'
import { classifyAppEx } from './errors'
import { buildBuckets, bucketIndexOf, type Bucket, type BucketUnit } from './dates'

// ── Window splitting ────────────────────────────────────────────────────────
// fetchTenantData fetches [from - window, to]; these helpers slice the raw
// records into the current window and the previous equivalent window.

export function inWindow<T>(items: T[], timeOf: (t: T) => string, from: Date, to: Date): T[] {
  const f = from.getTime()
  const t = to.getTime()
  return items.filter((i) => {
    const ms = new Date(timeOf(i)).getTime()
    return ms >= f && ms <= t
  })
}

export function previousWindow(from: Date, to: Date): { from: Date; to: Date } {
  const span = to.getTime() - from.getTime()
  return { from: new Date(from.getTime() - span), to: from }
}

// ── Jobs ────────────────────────────────────────────────────────────────────

export interface JobKpis {
  total: number
  successful: number
  faulted: number
  stopped: number
  running: number
  successRate: number // % of finished runs
  avgDurationMs: number
}

export function jobKpis(jobs: OrchJob[]): JobKpis {
  let successful = 0
  let faulted = 0
  let stopped = 0
  let running = 0
  let durSum = 0
  let durCount = 0
  for (const j of jobs) {
    if (j.State === 'Successful') successful++
    else if (j.State === 'Faulted') faulted++
    else if (j.State === 'Stopped') stopped++
    else if (j.State === 'Running') running++
    if (j.StartTime && j.EndTime) {
      const d = new Date(j.EndTime).getTime() - new Date(j.StartTime).getTime()
      if (d >= 0) {
        durSum += d
        durCount++
      }
    }
  }
  const finished = successful + faulted + stopped
  return {
    total: jobs.length,
    successful,
    faulted,
    stopped,
    running,
    successRate: finished > 0 ? (successful / finished) * 100 : NaN,
    avgDurationMs: durCount > 0 ? durSum / durCount : NaN,
  }
}

export interface TimePoint {
  label: string
  start: Date
  [series: string]: string | number | Date
}

export function jobsOverTime(jobs: OrchJob[], from: Date, to: Date, states: JobState[]) {
  const { unit, buckets } = buildBuckets(from, to)
  const rows: TimePoint[] = buckets.map((b) => {
    const row: TimePoint = { label: b.label, start: b.start }
    for (const s of states) row[s] = 0
    return row
  })
  for (const j of jobs) {
    const idx = bucketIndexOf(new Date(j.CreationTime), from, unit, rows.length)
    if (idx < 0) continue
    const key = states.includes(j.State) ? j.State : null
    if (key) rows[idx][key] = (rows[idx][key] as number) + 1
  }
  return { unit, rows }
}

/** Success-rate % per bucket (finished runs only); null where no finished runs. */
export function successRateOverTime(jobs: OrchJob[], from: Date, to: Date) {
  const { unit, buckets } = buildBuckets(from, to)
  const ok = new Array(buckets.length).fill(0)
  const fin = new Array(buckets.length).fill(0)
  for (const j of jobs) {
    if (j.State !== 'Successful' && j.State !== 'Faulted' && j.State !== 'Stopped') continue
    const idx = bucketIndexOf(new Date(j.CreationTime), from, unit, buckets.length)
    if (idx < 0) continue
    fin[idx]++
    if (j.State === 'Successful') ok[idx]++
  }
  return buckets.map((b: Bucket, i: number) => ({
    label: b.label,
    rate: fin[i] > 0 ? (ok[i] / fin[i]) * 100 : null,
  }))
}

export interface ProcessRow {
  name: string
  runs: number
  successful: number
  faulted: number
  successRate: number
  avgDurationMs: number
  /** Total time this process spent running — the Betriebszeit. */
  runtimeMs: number
  lastRun: string
}

export function perProcess(jobs: OrchJob[]): ProcessRow[] {
  const map = new Map<string, ProcessRow & { durSum: number; durCount: number }>()
  for (const j of jobs) {
    let r = map.get(j.ReleaseName)
    if (!r) {
      r = {
        name: j.ReleaseName,
        runs: 0,
        successful: 0,
        faulted: 0,
        successRate: 0,
        avgDurationMs: NaN,
        runtimeMs: 0,
        lastRun: j.CreationTime,
        durSum: 0,
        durCount: 0,
      }
      map.set(j.ReleaseName, r)
    }
    r.runs++
    if (j.State === 'Successful') r.successful++
    if (j.State === 'Faulted') r.faulted++
    if (j.CreationTime > r.lastRun) r.lastRun = j.CreationTime
    if (j.StartTime && j.EndTime) {
      const d = new Date(j.EndTime).getTime() - new Date(j.StartTime).getTime()
      if (d >= 0) {
        r.durSum += d
        r.durCount++
      }
    }
  }
  return [...map.values()]
    .map((r) => {
      const finished = r.successful + r.faulted
      return {
        name: r.name,
        runs: r.runs,
        successful: r.successful,
        faulted: r.faulted,
        successRate: finished > 0 ? (r.successful / finished) * 100 : NaN,
        avgDurationMs: r.durCount > 0 ? r.durSum / r.durCount : NaN,
        runtimeMs: r.durSum,
        lastRun: r.lastRun,
      }
    })
    .sort((a, b) => b.runs - a.runs)
}

// ── Queues ──────────────────────────────────────────────────────────────────

export interface QueueKpis {
  total: number
  successful: number
  appExceptions: number
  bizExceptions: number
  pending: number
  successRate: number
  avgHandlingMs: number
}

export function queueKpis(items: OrchQueueItem[]): QueueKpis {
  let successful = 0
  let app = 0
  let biz = 0
  let pending = 0
  let handleSum = 0
  let handleCount = 0
  for (const q of items) {
    if (q.Status === 'Successful') successful++
    else if (q.Status === 'Failed' || q.Status === 'Abandoned' || q.Status === 'Retried') {
      if (q.ProcessingExceptionType === 'BusinessException') biz++
      else app++
    } else if (q.Status === 'New' || q.Status === 'InProgress') pending++
    if (q.StartProcessing && q.EndProcessing) {
      const d = new Date(q.EndProcessing).getTime() - new Date(q.StartProcessing).getTime()
      if (d >= 0) {
        handleSum += d
        handleCount++
      }
    }
  }
  const processed = successful + app + biz
  return {
    total: items.length,
    successful,
    appExceptions: app,
    bizExceptions: biz,
    pending,
    successRate: processed > 0 ? (successful / processed) * 100 : NaN,
    avgHandlingMs: handleCount > 0 ? handleSum / handleCount : NaN,
  }
}

export const QUEUE_OUTCOMES = ['Successful', 'App exception', 'Business exception', 'Pending'] as const

export function queueOutcomeOf(q: OrchQueueItem): (typeof QUEUE_OUTCOMES)[number] | null {
  if (q.Status === 'Successful') return 'Successful'
  if (q.Status === 'Failed' || q.Status === 'Abandoned' || q.Status === 'Retried') {
    return q.ProcessingExceptionType === 'BusinessException' ? 'Business exception' : 'App exception'
  }
  if (q.Status === 'New' || q.Status === 'InProgress') return 'Pending'
  return null
}

export function queueVolumeOverTime(items: OrchQueueItem[], from: Date, to: Date) {
  const { unit, buckets } = buildBuckets(from, to)
  const rows: TimePoint[] = buckets.map((b) => {
    const row: TimePoint = { label: b.label, start: b.start }
    for (const o of QUEUE_OUTCOMES) row[o] = 0
    return row
  })
  for (const q of items) {
    const idx = bucketIndexOf(new Date(q.CreationTime), from, unit, rows.length)
    if (idx < 0) continue
    const outcome = queueOutcomeOf(q)
    if (outcome) rows[idx][outcome] = (rows[idx][outcome] as number) + 1
  }
  return { unit, rows }
}

export function handlingTimeOverTime(items: OrchQueueItem[], from: Date, to: Date) {
  const { unit, buckets } = buildBuckets(from, to)
  const sums = new Array(buckets.length).fill(0)
  const counts = new Array(buckets.length).fill(0)
  for (const q of items) {
    if (!q.StartProcessing || !q.EndProcessing) continue
    const idx = bucketIndexOf(new Date(q.CreationTime), from, unit, buckets.length)
    if (idx < 0) continue
    const d = new Date(q.EndProcessing).getTime() - new Date(q.StartProcessing).getTime()
    if (d >= 0) {
      sums[idx] += d
      counts[idx]++
    }
  }
  return buckets.map((b: Bucket, i: number) => ({
    label: b.label,
    avgMs: counts[i] > 0 ? sums[i] / counts[i] : null,
  }))
}

export interface QueueRow {
  name: string
  folder: string
  total: number
  successful: number
  appExceptions: number
  bizExceptions: number
  pending: number
  successRate: number
  avgHandlingMs: number
  oldestPendingMs: number | null
}

export function perQueue(data: TenantData, items: OrchQueueItem[]): QueueRow[] {
  const byQueue = new Map<number, OrchQueueItem[]>()
  for (const q of items) {
    const arr = byQueue.get(q.QueueDefinitionId)
    if (arr) arr.push(q)
    else byQueue.set(q.QueueDefinitionId, [q])
  }
  const now = Date.now()
  const rows: QueueRow[] = []
  for (const def of data.queues) {
    const qi = byQueue.get(def.Id) ?? []
    if (qi.length === 0) continue
    const k = queueKpis(qi)
    let oldestPending: number | null = null
    for (const q of qi) {
      if (q.Status === 'New') {
        const age = now - new Date(q.CreationTime).getTime()
        if (oldestPending === null || age > oldestPending) oldestPending = age
      }
    }
    rows.push({
      name: def.Name,
      folder: def.FolderName,
      total: k.total,
      successful: k.successful,
      appExceptions: k.appExceptions,
      bizExceptions: k.bizExceptions,
      pending: k.pending,
      successRate: k.successRate,
      avgHandlingMs: k.avgHandlingMs,
      oldestPendingMs: oldestPending,
    })
  }
  return rows.sort((a, b) => b.total - a.total)
}

// ── Kennzahlen: transaction scorecard per queue ─────────────────────────────

export interface ScorecardRow {
  queue: string
  folder: string
  items: number
  successful: number
  appExSystem: number
  appExBot: number
  manual: number
  businessEx: number
  avgHandlingMs: number
  botHours: number // Σ measured handling time
}

export function scorecard(
  data: TenantData,
  items: OrchQueueItem[],
  manualErrors: ManualError[],
  settings: AppSettings,
): ScorecardRow[] {
  const rows = new Map<number, ScorecardRow & { handleSum: number; handleCount: number }>()
  for (const def of data.queues) {
    rows.set(def.Id, {
      queue: def.Name,
      folder: def.FolderName,
      items: 0,
      successful: 0,
      appExSystem: 0,
      appExBot: 0,
      manual: 0,
      businessEx: 0,
      avgHandlingMs: NaN,
      botHours: 0,
      handleSum: 0,
      handleCount: 0,
    })
  }
  for (const q of items) {
    const r = rows.get(q.QueueDefinitionId)
    if (!r) continue
    r.items++
    if (q.Status === 'Successful') r.successful++
    else if (q.Status === 'Failed' || q.Status === 'Retried' || q.Status === 'Abandoned') {
      if (q.ProcessingExceptionType === 'BusinessException') r.businessEx++
      else {
        const reason = q.ProcessingException?.Reason ?? ''
        if (classifyAppEx(reason, settings.systemKeywords) === 'system') r.appExSystem++
        else r.appExBot++
      }
    }
    if (q.StartProcessing && q.EndProcessing) {
      const d = new Date(q.EndProcessing).getTime() - new Date(q.StartProcessing).getTime()
      if (d >= 0) {
        r.handleSum += d
        r.handleCount++
      }
    }
  }

  // Manual errors attach to the row whose queue name matches the entered
  // process; unmatched processes get their own manual-only rows.
  const extra = new Map<string, ScorecardRow>()
  for (const m of manualErrors) {
    const match = [...rows.values()].find((r) => r.queue.toLowerCase() === m.process.toLowerCase())
    if (match) {
      match.manual++
      continue
    }
    let e = extra.get(m.process)
    if (!e) {
      e = {
        queue: m.process,
        folder: m.folder ?? '—',
        items: 0,
        successful: 0,
        appExSystem: 0,
        appExBot: 0,
        manual: 0,
        businessEx: 0,
        avgHandlingMs: NaN,
        botHours: 0,
      }
      extra.set(m.process, e)
    }
    e.manual++
  }

  return [
    ...[...rows.values()]
      .filter((r) => r.items > 0 || r.manual > 0)
      .map((r) => ({
        queue: r.queue,
        folder: r.folder,
        items: r.items,
        successful: r.successful,
        appExSystem: r.appExSystem,
        appExBot: r.appExBot,
        manual: r.manual,
        businessEx: r.businessEx,
        avgHandlingMs: r.handleCount > 0 ? r.handleSum / r.handleCount : NaN,
        botHours: r.handleSum / 3600_000,
      })),
    ...extra.values(),
  ].sort((a, b) => b.items - a.items)
}

// ── Kennzahlen: time saved vs. human processing ─────────────────────────────

export interface TimeSavedRow {
  queue: string
  items: number
  botHours: number
  botPT: number
  humanMinutesPerItem: number | null
  humanHours: number | null
  savedHours: number | null
  savedPT: number | null
  savedPct: number | null
}

export function timeSaved(rows: ScorecardRow[], settings: AppSettings): TimeSavedRow[] {
  const hoursPerPT = settings.hoursPerPT > 0 ? settings.hoursPerPT : 8
  return rows
    .filter((r) => r.items > 0)
    .map((r) => {
      const perItem = settings.humanMinutesPerItem[r.queue] ?? null
      const humanHours = perItem !== null ? (r.items * perItem) / 60 : null
      const savedHours = humanHours !== null ? humanHours - r.botHours : null
      return {
        queue: r.queue,
        items: r.items,
        botHours: r.botHours,
        botPT: r.botHours / hoursPerPT,
        humanMinutesPerItem: perItem,
        humanHours,
        savedHours,
        savedPT: savedHours !== null ? savedHours / hoursPerPT : null,
        savedPct: savedHours !== null && humanHours ? (savedHours / humanHours) * 100 : null,
      }
    })
}

// ── Kennzahlen: Leerläufe (idle runs) ───────────────────────────────────────

export interface IdleRunsResult {
  consideredRuns: number // successful runs with start & end times
  idleRuns: number
  idlePct: number
  byProcess: { name: string; runs: number; idle: number }[]
}

/**
 * A Leerlauf is a successful job run during which no queue item in the same
 * folder started processing — the bot ran, found nothing to do, and ended.
 * Folder-based heuristic: exact job↔item linkage is not available in the API.
 */
export function idleRuns(jobs: OrchJob[], items: OrchQueueItem[]): IdleRunsResult {
  const itemStarts = items
    .filter((q) => q.StartProcessing)
    .map((q) => ({ folder: q.FolderId, t: new Date(q.StartProcessing!).getTime() }))
    .sort((a, b) => a.t - b.t)

  const byProcess = new Map<string, { name: string; runs: number; idle: number }>()
  let considered = 0
  let idle = 0
  for (const j of jobs) {
    if (j.State !== 'Successful' || !j.StartTime || !j.EndTime) continue
    considered++
    const s = new Date(j.StartTime).getTime()
    const e = new Date(j.EndTime).getTime()
    const worked = itemStarts.some((it) => it.folder === j.FolderId && it.t >= s && it.t <= e)
    let p = byProcess.get(j.ReleaseName)
    if (!p) {
      p = { name: j.ReleaseName, runs: 0, idle: 0 }
      byProcess.set(j.ReleaseName, p)
    }
    p.runs++
    if (!worked) {
      idle++
      p.idle++
    }
  }
  return {
    consideredRuns: considered,
    idleRuns: idle,
    idlePct: considered > 0 ? (idle / considered) * 100 : NaN,
    byProcess: [...byProcess.values()].sort((a, b) => b.idle - a.idle),
  }
}

// ── Kennzahlen: robot/license utilization ───────────────────────────────────

export interface ConcurrencyResult {
  unit: BucketUnit
  rows: { label: string; active: number }[]
  peak: number
  peakTime: Date | null
}

/** Max concurrently running jobs per bucket (sweep line over start/end events). */
export function concurrencyOverTime(jobs: OrchJob[], from: Date, to: Date): ConcurrencyResult {
  const { unit, buckets } = buildBuckets(from, to)
  const events: { t: number; d: 1 | -1 }[] = []
  for (const j of jobs) {
    if (!j.StartTime) continue
    const s = new Date(j.StartTime).getTime()
    const e = j.EndTime ? new Date(j.EndTime).getTime() : to.getTime()
    if (e < from.getTime() || s > to.getTime()) continue
    events.push({ t: Math.max(s, from.getTime()), d: 1 })
    events.push({ t: Math.min(e, to.getTime()), d: -1 })
  }
  events.sort((a, b) => a.t - b.t || a.d - b.d)

  const maxPerBucket = new Array(buckets.length).fill(0)
  let current = 0
  let peak = 0
  let peakTime: Date | null = null
  for (const ev of events) {
    current += ev.d
    if (ev.d === 1) {
      const idx = bucketIndexOf(new Date(ev.t), from, unit, buckets.length)
      if (idx >= 0 && current > maxPerBucket[idx]) maxPerBucket[idx] = current
      if (current > peak) {
        peak = current
        peakTime = new Date(ev.t)
      }
    }
  }
  // Carry running jobs across bucket boundaries: a job spanning a whole bucket
  // must count in it even if no event falls inside.
  let carry = 0
  const eventsByBucket = new Map<number, number>()
  current = 0
  for (const ev of events) {
    const idx = bucketIndexOf(new Date(ev.t), from, unit, buckets.length)
    current += ev.d
    if (idx >= 0) eventsByBucket.set(idx, current)
  }
  for (let i = 0; i < buckets.length; i++) {
    if (maxPerBucket[i] < carry) maxPerBucket[i] = carry
    carry = eventsByBucket.has(i) ? eventsByBucket.get(i)! : carry
  }

  return {
    unit,
    rows: buckets.map((b: Bucket, i: number) => ({ label: b.label, active: maxPerBucket[i] })),
    peak,
    peakTime,
  }
}

// ── Activity heatmap: weekday × hour ────────────────────────────────────────

export interface ActivityMatrix {
  /** counts[weekday][hour] — weekday 0 = Monday. */
  counts: number[][]
  max: number
  total: number
}

export const WEEKDAYS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/** When do the automations actually work — transaction volume by weekday and hour. */
export function activityMatrix(items: OrchQueueItem[]): ActivityMatrix {
  const counts: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0))
  let max = 0
  let total = 0
  for (const q of items) {
    const d = new Date(q.CreationTime)
    const weekday = (d.getDay() + 6) % 7 // JS: 0 = Sunday -> we want 0 = Monday
    const hour = d.getHours()
    const next = ++counts[weekday][hour]
    if (next > max) max = next
    total++
  }
  return { counts, max, total }
}

// ── Errors over time ────────────────────────────────────────────────────────

export function errorsOverTime(
  occurrences: { time: string; source: string }[],
  from: Date,
  to: Date,
  sources: string[],
) {
  const { unit, buckets } = buildBuckets(from, to)
  const rows: TimePoint[] = buckets.map((b) => {
    const row: TimePoint = { label: b.label, start: b.start }
    for (const s of sources) row[s] = 0
    return row
  })
  for (const o of occurrences) {
    const idx = bucketIndexOf(new Date(o.time), from, unit, rows.length)
    if (idx < 0) continue
    rows[idx][o.source] = (rows[idx][o.source] as number) + 1
  }
  return { unit, rows }
}
