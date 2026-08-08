// Health scoring, friendly naming and German plain-language helpers for the
// stakeholder view. Pure presentation logic on top of the existing aggregates.

import type { AppSettings, ManualError } from '../api/store'
import type { OrchJob, OrchQueueItem, TenantData } from '../api/types'
import type { ErrorGroup, ErrorSource, Responsibility } from './errors'
import type { ScorecardRow } from './aggregate'
import { buildBuckets, bucketIndexOf, type Bucket } from './dates'

export type Health = 'ok' | 'attention' | 'critical'

export const HEALTH_LABELS_DE: Record<Health, string> = {
  ok: 'läuft normal',
  attention: 'benötigt Aufmerksamkeit',
  critical: 'gestört',
}

export const SOURCE_LABELS_DE: Record<ErrorSource, string> = {
  'Job fault': 'Prozessabbruch',
  'App exception (system)': 'Nicht erfolgreich',
  'App exception (bot)': 'Prozessfehler',
  // Not a failure: the automation correctly recognised that this item belongs
  // in manual handling and routed it out.
  'Business exception': 'Korrekt erkannte Aussteuerung',
  'Manual (IT)': 'IT-Störung',
}

// ── Responsibility: who has to act ─────────────────────────────────────────

export const RESPONSIBILITY_LABELS: Record<Responsibility, string> = {
  it: 'V-Bank IT',
  automation: 'Exelentic',
  business: 'Fachbereich',
}

export const RESPONSIBILITY_HINTS: Record<Responsibility, string> = {
  it: 'Server, Netzwerk, Zugänge und angebundene Fremdsysteme',
  automation: 'Automatisierung selbst — Selektoren, Abläufe, Prozesslogik',
  business: 'kein Fehler — korrekt ausgesteuert zur manuellen Bearbeitung',
}

/** Validated together with the outcome palette; badges always carry their label too. */
export const RESPONSIBILITY_COLORS: Record<'light' | 'dark', Record<Responsibility, string>> = {
  light: { automation: '#4a3aa7', it: '#eda100', business: '#2a78d6' },
  dark: { automation: '#9085e9', it: '#c98500', business: '#3987e5' },
}

/** Order used wherever the three appear as one bar — adjacent pairs validated. */
export const RESPONSIBILITY_ORDER: Responsibility[] = ['automation', 'it', 'business']

export function healthOf(
  successRate: number,
  manualErrorCount: number,
  thresholds: AppSettings['healthThresholds'],
): Health {
  let h: Health
  if (!isFinite(successRate)) h = 'ok'
  else if (successRate >= thresholds.okMin) h = 'ok'
  else if (successRate >= thresholds.attentionMin) h = 'attention'
  else h = 'critical'
  if (manualErrorCount > 0 && h === 'ok') h = 'attention'
  return h
}

// ── Naming ─────────────────────────────────────────────────────────────────

/** "Vbank_InvoiceProcessing" -> "Invoice Processing" */
export function autoCleanName(technical: string): string {
  const cleaned = technical
    .replace(/^vbank[_\-\s]*/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-zäöü])([A-ZÄÖÜ])/g, '$1 $2')
    .replace(/([A-ZÄÖÜ]+)([A-ZÄÖÜ][a-zäöü])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || technical
}

export function friendlyName(technical: string, settings: AppSettings): string {
  return settings.displayInfo[technical]?.name?.trim() || autoCleanName(technical)
}

export function friendlyDescription(technical: string, settings: AppSettings): string | undefined {
  return settings.displayInfo[technical]?.description?.trim() || undefined
}

// ── German formatting ──────────────────────────────────────────────────────

export function deInt(n: number): string {
  return n.toLocaleString('de-DE')
}

export function dePct(n: number, digits = 1): string {
  if (!isFinite(n)) return '–'
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`
}

export function deHours(h: number): string {
  if (!isFinite(h)) return '–'
  return `${h.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Std.`
}

export function dePT(pt: number): string {
  if (!isFinite(pt)) return '–'
  return `${pt.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Personentage`
}

export function deDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleString('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ── Stakeholder cards: "Was passiert wo" ───────────────────────────────────

export interface StakeholderCard {
  key: string
  technicalName: string
  displayName: string
  description?: string
  area: string // Bereich (folder display name)
  kind: 'process' | 'queue'
  /** Vorgänge for queues (items), Läufe for processes (runs). */
  count: number
  countLabel: string
  successRate: number
  /** Betriebsstunden — how long this automation actually worked in the window. */
  runtimeHours: number
  lastActivity: string | null
  health: Health
  issue?: string // plain-German reason, only when unhealthy
  /** Who has to act on the dominant issue — only set when unhealthy. */
  issueResponsibility?: Responsibility
}

function issueFor(
  technicalName: string,
  groups: ErrorGroup[],
  manualForName: ManualError[],
): { text: string; responsibility: Responsibility } | undefined {
  if (manualForName.length > 0) {
    const m = manualForName[0]
    return {
      text: `${manualForName.length}× IT-Störung gemeldet, zuletzt: ${m.category} – ${m.description}`.slice(0, 140),
      responsibility: 'it',
    }
  }
  // Correctly routed-out items are not a problem — never explain a card with them.
  const relevant = groups
    .filter(
      (g) =>
        g.responsibility !== 'business' &&
        g.processes.some((p) => p.toLowerCase() === technicalName.toLowerCase()),
    )
    .sort((a, b) => b.count - a.count)
  if (relevant.length === 0) return undefined
  const top = relevant[0]
  return {
    text: `${top.count}× ${SOURCE_LABELS_DE[top.source]}${relevant.length > 1 ? ` (und ${relevant.length - 1} weitere Ursachen)` : ''}`,
    responsibility: top.responsibility,
  }
}

export function buildStakeholderCards(
  data: TenantData,
  jobs: OrchJob[],
  scorecardRows: ScorecardRow[],
  errorGroups: ErrorGroup[],
  manualErrors: ManualError[],
  settings: AppSettings,
): StakeholderCard[] {
  const manualByName = (name: string) =>
    manualErrors.filter((m) => m.process.toLowerCase() === name.toLowerCase())

  const cards: StakeholderCard[] = []

  // Processes (bots) — run-based figures, grouped per folder.
  const byProcess = new Map<
    string,
    { folder: string; runs: number; ok: number; fin: number; last: string; runtimeMs: number }
  >()
  for (const j of jobs) {
    const key = `${j.ReleaseName}::${j.FolderName}`
    let p = byProcess.get(key)
    if (!p) {
      p = { folder: j.FolderName, runs: 0, ok: 0, fin: 0, last: j.CreationTime, runtimeMs: 0 }
      byProcess.set(key, p)
    }
    p.runs++
    if (j.State === 'Successful' || j.State === 'Faulted' || j.State === 'Stopped') {
      p.fin++
      if (j.State === 'Successful') p.ok++
    }
    if (j.CreationTime > p.last) p.last = j.CreationTime
    // Betriebszeit: a still-running job counts up to now.
    if (j.StartTime) {
      const end = j.EndTime ? new Date(j.EndTime).getTime() : Date.now()
      const d = end - new Date(j.StartTime).getTime()
      if (d > 0) p.runtimeMs += d
    }
  }
  for (const [key, p] of byProcess) {
    const name = key.split('::')[0]
    const rate = p.fin > 0 ? (p.ok / p.fin) * 100 : NaN
    const manual = manualByName(name)
    const health = healthOf(rate, manual.length, settings.healthThresholds)
    const issue = health === 'ok' ? undefined : issueFor(name, errorGroups, manual)
    cards.push({
      key: `p:${key}`,
      technicalName: name,
      displayName: friendlyName(name, settings),
      description: friendlyDescription(name, settings),
      area: p.folder,
      kind: 'process',
      count: p.runs,
      countLabel: p.runs === 1 ? 'Lauf' : 'Läufe',
      successRate: rate,
      runtimeHours: p.runtimeMs / 3600_000,
      lastActivity: p.last,
      health,
      issue: issue?.text,
      issueResponsibility: issue?.responsibility,
    })
  }

  // Queues — transaction-based figures.
  for (const r of scorecardRows) {
    if (r.items === 0 && r.manual === 0) continue
    const processed = r.successful + r.appExSystem + r.appExBot + r.businessEx
    // A business exception is a correct outcome (the item was recognised as
    // one for manual handling), so it counts as correctly processed — not as
    // a failure. Only genuine application errors reduce the rate.
    const rate = processed > 0 ? ((r.successful + r.businessEx) / processed) * 100 : NaN
    const manual = manualByName(r.queue)
    const health = healthOf(rate, manual.length + r.manual, settings.healthThresholds)
    const lastItem = data.queueItems
      .filter((q) => data.queues.find((d) => d.Id === q.QueueDefinitionId)?.Name === r.queue)
      .reduce<string | null>((acc, q) => (acc === null || q.CreationTime > acc ? q.CreationTime : acc), null)
    const issue = health === 'ok' ? undefined : issueFor(r.queue, errorGroups, manual)
    cards.push({
      key: `q:${r.queue}::${r.folder}`,
      technicalName: r.queue,
      displayName: friendlyName(r.queue, settings),
      description: friendlyDescription(r.queue, settings),
      area: r.folder,
      kind: 'queue',
      count: r.items,
      countLabel: r.items === 1 ? 'Vorgang' : 'Vorgänge',
      successRate: rate,
      // Same figure the Kennzahlen page reports as "Bot processing time".
      runtimeHours: r.botHours,
      lastActivity: lastItem,
      health,
      issue: issue?.text,
      issueResponsibility: issue?.responsibility,
    })
  }

  const order: Record<Health, number> = { critical: 0, attention: 1, ok: 2 }
  return cards.sort(
    (a, b) => a.area.localeCompare(b.area) || order[a.health] - order[b.health] || b.count - a.count,
  )
}

// ── Per-card data slices (drill-down) ──────────────────────────────────────

/** Queue name -> the queue ids carrying that name (a name can repeat across folders). */
export function queueIdsByName(data: TenantData): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (const q of data.queues) {
    const key = q.Name.toLowerCase()
    const ids = map.get(key)
    if (ids) ids.push(q.Id)
    else map.set(key, [q.Id])
  }
  return map
}

export function jobsForCard(card: StakeholderCard, jobs: OrchJob[]): OrchJob[] {
  if (card.kind !== 'process') return []
  return jobs.filter((j) => j.ReleaseName === card.technicalName && j.FolderName === card.area)
}

export function queueItemsForCard(
  card: StakeholderCard,
  items: OrchQueueItem[],
  idsByName: Map<string, number[]>,
): OrchQueueItem[] {
  if (card.kind !== 'queue') return []
  const ids = new Set(idsByName.get(card.technicalName.toLowerCase()) ?? [])
  return items.filter((q) => ids.has(q.QueueDefinitionId))
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
 * Per-bucket health for one process/queue — the status-page style strip.
 * Buckets follow the global window (hourly for short ranges, daily beyond).
 */
export function healthStrip(
  card: StakeholderCard,
  jobs: OrchJob[],
  queueItems: OrchQueueItem[],
  idsByName: Map<string, number[]>,
  from: Date,
  to: Date,
  thresholds: AppSettings['healthThresholds'],
): StripCell[] {
  const { unit, buckets } = buildBuckets(from, to)
  const total = new Array(buckets.length).fill(0)
  const ok = new Array(buckets.length).fill(0)

  if (card.kind === 'process') {
    for (const j of jobsForCard(card, jobs)) {
      if (j.State !== 'Successful' && j.State !== 'Faulted' && j.State !== 'Stopped') continue
      const idx = bucketIndexOf(new Date(j.CreationTime), from, unit, buckets.length)
      if (idx < 0) continue
      total[idx]++
      if (j.State === 'Successful') ok[idx]++
    }
  } else {
    for (const q of queueItemsForCard(card, queueItems, idsByName)) {
      if (q.Status !== 'Successful' && q.Status !== 'Failed' && q.Status !== 'Retried' && q.Status !== 'Abandoned')
        continue
      const idx = bucketIndexOf(new Date(q.CreationTime), from, unit, buckets.length)
      if (idx < 0) continue
      total[idx]++
      // Correctly routed-out items count as correctly handled, as on the card.
      if (q.Status === 'Successful' || q.ProcessingExceptionType === 'BusinessException') ok[idx]++
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
  const health: Health = affected.some((c) => c.health === 'critical')
    ? 'critical'
    : affected.length > 0
      ? 'attention'
      : 'ok'
  return { health, affected }
}
