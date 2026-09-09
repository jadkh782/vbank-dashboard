// Open points: what the dashboard lists under "Offene Punkte & Zuständigkeit".
// A faulted run, a failed transaction (final attempt failed) or a manual IT
// incident — never a business exception, never something reviewed as
// "Nicht als Fehler anzeigen" (those rows arrive as outcome 'ignored').

import { CATEGORIES, type Category } from './categories'
import type { ManualErrorRow, Run, Txn } from './domain'

export type IssueKind = 'run' | 'txn' | 'manual'

export const ISSUE_KIND_LABELS_DE: Record<IssueKind, string> = {
  run: 'Prozessabbruch',
  txn: 'Nicht erfolgreich',
  manual: 'IT-Störung',
}

export interface Issue {
  kind: IssueKind
  automationId: string | null
  time: string
  category: Category | null
  /** Normalised message (runs, transactions) or the incident description (manual). */
  family: string | null
}

export function openPoints(runs: Run[], txns: Txn[], manual: ManualErrorRow[]): Issue[] {
  const out: Issue[] = []
  for (const r of runs) {
    if (r.state !== 'faulted' || r.category === 'nicht_anzeigen') continue
    out.push({ kind: 'run', automationId: r.automationId, time: r.createdAt, category: r.category, family: r.family })
  }
  for (const t of txns) {
    if (t.outcome !== 'failed') continue
    out.push({ kind: 'txn', automationId: t.automationId, time: t.createdAt, category: t.category, family: t.family })
  }
  for (const m of manual) {
    if (m.category === 'nicht_anzeigen') continue
    out.push({ kind: 'manual', automationId: m.automationId, time: m.occurredAt, category: m.category, family: m.description })
  }
  return out
}

export interface IssueGroup {
  key: string
  kind: IssueKind
  category: Category | null
  family: string | null
  count: number
  /** 0..1 of all open points. */
  share: number
  automationIds: string[]
  lastSeen: string
}

export function groupIssues(issues: Issue[]): IssueGroup[] {
  const map = new Map<string, IssueGroup>()
  for (const i of issues) {
    const key = `${i.kind}::${i.category ?? '-'}::${i.family ?? '-'}`
    const g = map.get(key)
    if (g) {
      g.count++
      if (i.automationId && !g.automationIds.includes(i.automationId)) g.automationIds.push(i.automationId)
      if (i.time > g.lastSeen) g.lastSeen = i.time
    } else {
      map.set(key, {
        key,
        kind: i.kind,
        category: i.category,
        family: i.family,
        count: 1,
        share: 0,
        automationIds: i.automationId ? [i.automationId] : [],
        lastSeen: i.time,
      })
    }
  }
  const total = issues.length || 1
  const groups = [...map.values()].sort((a, b) => b.count - a.count)
  for (const g of groups) g.share = g.count / total
  return groups
}

export function categoryCounts(issues: Issue[]): Record<Category, number> {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>
  for (const i of issues) if (i.category) out[i.category]++
  return out
}
