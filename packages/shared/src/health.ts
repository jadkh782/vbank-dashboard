// Health scoring and the stakeholder cards — pure presentation logic on top of
// the aggregates.

import type { Category } from './categories'
import type { Automation, ManualErrorRow, Run, Thresholds, Txn } from './domain'
import type { IssueGroup } from './issues'
import { ISSUE_KIND_LABELS_DE } from './issues'
import { buildBuckets, bucketIndexOf, type Bucket } from './dates'

export type Health = 'ok' | 'attention' | 'critical'

export const HEALTH_LABELS_DE: Record<Health, string> = {
  ok: 'läuft normal',
  attention: 'benötigt Aufmerksamkeit',
  critical: 'gestört',
}

// One-word form for phones, where "benötigt Aufmerksamkeit" does not fit.
export const HEALTH_SHORT_DE: Record<Health, string> = {
  ok: 'normal',
  attention: 'auffällig',
  critical: 'gestört',
}

export function healthOf(successRate: number, manualErrorCount: number, thresholds: Thresholds): Health {
  let h: Health
  if (!isFinite(successRate)) h = 'ok'
  else if (successRate >= thresholds.okMin) h = 'ok'
  else if (successRate >= thresholds.attentionMin) h = 'attention'
  else h = 'critical'
  if (manualErrorCount > 0 && h === 'ok') h = 'attention'
  return h
}

/**
 * "A-20401-008-ÜberweisungExtern" -> "Überweisung Extern",
 * "Vbank_InvoiceProcessing" -> "Invoice Processing".
 * Strips the V-Bank process code, a vendor prefix and a "-Queue" suffix.
 */
export function autoCleanName(technical: string): string {
  const cleaned = technical
    .replace(/^[A-Z]-\d{5}-\d{3}-/, '')
    .replace(/^vbank[_\-\s]*/i, '')
    .replace(/[_-]?queue$/i, ' Queue')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-zäöü])([A-ZÄÖÜ])/g, '$1 $2')
    .replace(/([A-ZÄÖÜ]+)([A-ZÄÖÜ][a-zäöü])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || technical
}

// ── Stakeholder cards ───────────────────────────────────────────────────────

export interface StakeholderCard {
  /** = automation id; also the DOM focus key of the table row. */
  key: string
  automationId: string
  technicalName: string
  displayName: string
  description: string | null
  /** Bereich (folder display name). */
  area: string
  kind: 'process' | 'queue'
  /** Vorgänge for queues (transactions), Läufe for processes (runs). */
  count: number
  countLabel: string
  successRate: number
  /** Betriebsstunden — how long this automation actually worked in the window. */
  runtimeHours: number
  /** Transactions that succeeded after a retry (queues only). */
  recovered: number
  lastActivity: string | null
  health: Health
  /** Plain-German reason, only when unhealthy. */
  issue?: string
  /** Category of the dominant issue — only set when unhealthy. */
  issueCategory?: Category
}

function issueFor(automationId: string, groups: IssueGroup[], manual: ManualErrorRow[]): { text: string; category: Category } | undefined {
  if (manual.length > 0) {
    const m = manual[0]
    return { text: `${manual.length}× IT-Störung gemeldet, zuletzt: ${m.description}`.slice(0, 140), category: m.category }
  }
  const relevant = groups
    .filter((g) => g.kind !== 'manual' && g.category && g.automationIds.includes(automationId))
    .sort((a, b) => b.count - a.count)
  if (relevant.length === 0) return undefined
  const top = relevant[0]
  return {
    text: `${top.count}× ${ISSUE_KIND_LABELS_DE[top.kind]}${relevant.length > 1 ? ` (und ${relevant.length - 1} weitere Ursachen)` : ''}`,
    category: top.category!,
  }
}

export function buildStakeholderCards(
  automations: Automation[],
  runs: Run[],
  txns: Txn[],
  issueGroups: IssueGroup[],
  manual: ManualErrorRow[],
  thresholds: Thresholds,
): StakeholderCard[] {
  const runsBy = new Map<string, Run[]>()
  for (const r of runs) (runsBy.get(r.automationId) ?? runsBy.set(r.automationId, []).get(r.automationId)!).push(r)
  const txnsBy = new Map<string, Txn[]>()
  for (const t of txns) (txnsBy.get(t.automationId) ?? txnsBy.set(t.automationId, []).get(t.automationId)!).push(t)
  const manualBy = (id: string) => manual.filter((m) => m.automationId === id)

  const cards: StakeholderCard[] = []
  for (const a of automations) {
    const own = manualBy(a.id)
    if (a.kind === 'process') {
      const rs = runsBy.get(a.id) ?? []
      if (rs.length === 0 && own.length === 0) continue
      let ok = 0
      let fin = 0
      let runtimeMs = 0
      let last: string | null = null
      for (const r of rs) {
        if (r.state !== 'running') {
          fin++
          if (r.state === 'success') ok++
        }
        if (!last || r.createdAt > last) last = r.createdAt
        if (r.startedAt) {
          const end = r.endedAt ? new Date(r.endedAt).getTime() : Date.now()
          const d = end - new Date(r.startedAt).getTime()
          if (d > 0) runtimeMs += d
        }
      }
      const rate = fin > 0 ? (ok / fin) * 100 : NaN
      const health = healthOf(rate, own.length, thresholds)
      const issue = health === 'ok' ? undefined : issueFor(a.id, issueGroups, own)
      cards.push({
        key: a.id,
        automationId: a.id,
        technicalName: a.technicalName,
        displayName: a.displayName,
        description: a.description,
        area: a.folder,
        kind: 'process',
        count: rs.length,
        countLabel: rs.length === 1 ? 'Lauf' : 'Läufe',
        successRate: rate,
        runtimeHours: runtimeMs / 3600_000,
        recovered: 0,
        lastActivity: last,
        health,
        issue: issue?.text,
        issueCategory: issue?.category,
      })
    } else {
      const ts = txnsBy.get(a.id) ?? []
      if (ts.length === 0 && own.length === 0) continue
      let correct = 0
      let failed = 0
      let recovered = 0
      let processingMs = 0
      let last: string | null = null
      for (const t of ts) {
        if (t.outcome === 'failed') failed++
        else if (t.outcome !== 'pending') {
          correct++
          if (t.outcome === 'success' && t.attempts > 1) recovered++
        }
        if (t.processingMs) processingMs += t.processingMs
        if (!last || t.createdAt > last) last = t.createdAt
      }
      const processed = correct + failed
      const rate = processed > 0 ? (correct / processed) * 100 : NaN
      const health = healthOf(rate, own.length, thresholds)
      const issue = health === 'ok' ? undefined : issueFor(a.id, issueGroups, own)
      cards.push({
        key: a.id,
        automationId: a.id,
        technicalName: a.technicalName,
        displayName: a.displayName,
        description: a.description,
        area: a.folder,
        kind: 'queue',
        count: ts.length,
        countLabel: ts.length === 1 ? 'Vorgang' : 'Vorgänge',
        successRate: rate,
        runtimeHours: processingMs / 3600_000,
        recovered,
        lastActivity: last,
        health,
        issue: issue?.text,
        issueCategory: issue?.category,
      })
    }
  }

  const order: Record<Health, number> = { critical: 0, attention: 1, ok: 2 }
  return cards.sort((a, b) => a.area.localeCompare(b.area) || order[a.health] - order[b.health] || b.count - a.count)
}

// ── Status timeline strip ──────────────────────────────────────────────────

export interface StripCell {
  label: string
  start: Date
  total: number
  successful: number
  successRate: number
  /** 'idle' = no activity in this block (neutral, not a problem). */
  health: Health | 'idle'
}

/**
 * Per-bucket health for one automation — the status-page style strip.
 * Buckets follow the global window (hourly for short ranges, daily beyond).
 */
export function healthStrip(card: StakeholderCard, runs: Run[], txns: Txn[], from: Date, to: Date, thresholds: Thresholds): StripCell[] {
  const { unit, buckets } = buildBuckets(from, to)
  const total = new Array(buckets.length).fill(0)
  const ok = new Array(buckets.length).fill(0)

  if (card.kind === 'process') {
    for (const r of runs) {
      if (r.automationId !== card.automationId || r.state === 'running') continue
      const idx = bucketIndexOf(new Date(r.createdAt), from, unit, buckets.length)
      if (idx < 0) continue
      total[idx]++
      if (r.state === 'success') ok[idx]++
    }
  } else {
    for (const t of txns) {
      if (t.automationId !== card.automationId || t.outcome === 'pending') continue
      const idx = bucketIndexOf(new Date(t.createdAt), from, unit, buckets.length)
      if (idx < 0) continue
      total[idx]++
      if (t.outcome !== 'failed') ok[idx]++
    }
  }

  return buckets.map((b: Bucket, i: number) => {
    const rate = total[i] > 0 ? (ok[i] / total[i]) * 100 : NaN
    return {
      label: b.label,
      start: b.start,
      total: total[i],
      successful: ok[i],
      successRate: rate,
      health: total[i] === 0 ? ('idle' as const) : healthOf(rate, 0, thresholds),
    }
  })
}

export function overallHealth(cards: StakeholderCard[]): { health: Health; affected: StakeholderCard[] } {
  const affected = cards.filter((c) => c.health !== 'ok')
  const health: Health = affected.some((c) => c.health === 'critical') ? 'critical' : affected.length > 0 ? 'attention' : 'ok'
  return { health, affected }
}
