// Aggregates over the domain rows (published views or demo data). Pure
// functions; the dashboard and the Control Board's Auswertung share them so
// the numbers agree before and after publishing.

import type { Category } from './categories'
import type { Automation, ManualErrorRow, Run, Txn } from './domain'
import { buildBuckets, bucketIndexOf } from './dates'

// ── Window splitting ────────────────────────────────────────────────────────

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

// ── Process runs ────────────────────────────────────────────────────────────

export interface RunKpis {
  total: number
  success: number
  faulted: number
  stopped: number
  running: number
  /** % of finished runs that succeeded. */
  successRate: number
  runtimeMs: number
}

export function runKpis(runs: Run[]): RunKpis {
  let success = 0
  let faulted = 0
  let stopped = 0
  let running = 0
  let runtimeMs = 0
  for (const r of runs) {
    if (r.state === 'success') success++
    else if (r.state === 'faulted') faulted++
    else if (r.state === 'stopped') stopped++
    else running++
    if (r.startedAt) {
      const end = r.endedAt ? new Date(r.endedAt).getTime() : Date.now()
      const d = end - new Date(r.startedAt).getTime()
      if (d > 0) runtimeMs += d
    }
  }
  const finished = success + faulted + stopped
  return { total: runs.length, success, faulted, stopped, running, successRate: finished > 0 ? (success / finished) * 100 : NaN, runtimeMs }
}

// ── Queue transactions ──────────────────────────────────────────────────────

export interface TxnKpis {
  total: number
  success: number
  businessExceptions: number
  ignored: number
  failed: number
  pending: number
  /** Successful transactions that needed more than one attempt. */
  recovered: number
  /** Correctly handled = success + business exceptions + ignored. */
  correct: number
  /** Decided transactions = correct + failed. */
  processed: number
  /** % correct of processed. */
  successRate: number
  processingMs: number
}

export function txnKpis(txns: Txn[]): TxnKpis {
  const k: TxnKpis = {
    total: txns.length,
    success: 0,
    businessExceptions: 0,
    ignored: 0,
    failed: 0,
    pending: 0,
    recovered: 0,
    correct: 0,
    processed: 0,
    successRate: NaN,
    processingMs: 0,
  }
  for (const t of txns) {
    switch (t.outcome) {
      case 'success':
        k.success++
        if (t.attempts > 1) k.recovered++
        break
      case 'business_exception':
        k.businessExceptions++
        break
      case 'ignored':
        k.ignored++
        break
      case 'failed':
        k.failed++
        break
      default:
        k.pending++
    }
    if (t.processingMs) k.processingMs += t.processingMs
  }
  k.correct = k.success + k.businessExceptions + k.ignored
  k.processed = k.correct + k.failed
  k.successRate = k.processed > 0 ? (k.correct / k.processed) * 100 : NaN
  return k
}

/** Failed transactions by category (the open points of the queues). */
export function failedByCategory(txns: Txn[]): Partial<Record<Category, number>> {
  const out: Partial<Record<Category, number>> = {}
  for (const t of txns) {
    if (t.outcome !== 'failed' || !t.category) continue
    out[t.category] = (out[t.category] ?? 0) + 1
  }
  return out
}

export interface VolumePoint {
  label: string
  start: Date
  'Korrekt verarbeitet': number
  'Nicht erfolgreich': number
  [series: string]: string | number | Date
}

/** Transactions per bucket: correct vs. failed (pending left out). */
export function volumeOverTime(txns: Txn[], from: Date, to: Date) {
  const { unit, buckets } = buildBuckets(from, to)
  const rows: VolumePoint[] = buckets.map((b) => ({ label: b.label, start: b.start, 'Korrekt verarbeitet': 0, 'Nicht erfolgreich': 0 }))
  for (const t of txns) {
    const idx = bucketIndexOf(new Date(t.createdAt), from, unit, rows.length)
    if (idx < 0) continue
    if (t.outcome === 'failed') rows[idx]['Nicht erfolgreich']++
    else if (t.outcome !== 'pending') rows[idx]['Korrekt verarbeitet']++
  }
  return { unit, rows }
}

// ── Scorecard per queue ─────────────────────────────────────────────────────

export interface ScorecardRow {
  automationId: string
  technicalName: string
  displayName: string
  folder: string
  items: number
  correct: number
  failed: number
  byCategory: Partial<Record<Category, number>>
  /** Manual IT incidents attached to this automation. */
  manual: number
  /** Σ measured processing time in hours — the "Betriebsstunden" of a queue. */
  botHours: number
  humanMinutesPerItem: number | null
}

export function scorecard(automations: Automation[], txns: Txn[], manual: ManualErrorRow[]): ScorecardRow[] {
  const rows = new Map<string, ScorecardRow>()
  for (const a of automations) {
    if (a.kind !== 'queue') continue
    rows.set(a.id, {
      automationId: a.id,
      technicalName: a.technicalName,
      displayName: a.displayName,
      folder: a.folder,
      items: 0,
      correct: 0,
      failed: 0,
      byCategory: {},
      manual: 0,
      botHours: 0,
      humanMinutesPerItem: a.humanMinutesPerItem,
    })
  }
  for (const t of txns) {
    const r = rows.get(t.automationId)
    if (!r) continue
    r.items++
    if (t.outcome === 'failed') {
      r.failed++
      if (t.category) r.byCategory[t.category] = (r.byCategory[t.category] ?? 0) + 1
    } else if (t.outcome !== 'pending') r.correct++
    if (t.processingMs) r.botHours += t.processingMs / 3600_000
  }
  for (const m of manual) {
    const r = m.automationId ? rows.get(m.automationId) : undefined
    if (r) r.manual++
  }
  return [...rows.values()].filter((r) => r.items > 0 || r.manual > 0).sort((a, b) => b.items - a.items)
}

// ── Time saved vs. human processing ─────────────────────────────────────────

export interface TimeSavedRow {
  automationId: string
  displayName: string
  items: number
  botHours: number
  botPT: number
  humanMinutesPerItem: number | null
  humanHours: number | null
  savedHours: number | null
  savedPT: number | null
  savedPct: number | null
}

export function timeSaved(rows: ScorecardRow[], hoursPerPT: number): TimeSavedRow[] {
  const perPT = hoursPerPT > 0 ? hoursPerPT : 8
  return rows
    .filter((r) => r.items > 0)
    .map((r) => {
      const humanHours = r.humanMinutesPerItem !== null ? (r.items * r.humanMinutesPerItem) / 60 : null
      const savedHours = humanHours !== null ? humanHours - r.botHours : null
      return {
        automationId: r.automationId,
        displayName: r.displayName,
        items: r.items,
        botHours: r.botHours,
        botPT: r.botHours / perPT,
        humanMinutesPerItem: r.humanMinutesPerItem,
        humanHours,
        savedHours,
        savedPT: savedHours !== null ? savedHours / perPT : null,
        savedPct: savedHours !== null && humanHours ? (savedHours / humanHours) * 100 : null,
      }
    })
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
export function activityMatrix(txns: Txn[]): ActivityMatrix {
  const counts: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0))
  let max = 0
  let total = 0
  for (const t of txns) {
    const d = new Date(t.createdAt)
    const weekday = (d.getDay() + 6) % 7 // JS: 0 = Sunday -> we want 0 = Monday
    const hour = d.getHours()
    const next = ++counts[weekday][hour]
    if (next > max) max = next
    total++
  }
  return { counts, max, total }
}
