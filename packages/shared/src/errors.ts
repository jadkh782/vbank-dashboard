import type { OrchJob, OrchQueueItem } from './orchestrator.types'
import type { ManualError } from './settings'
import { normalizeMessage } from './classification/normalize'

export type ErrorSource =
  | 'Job fault'
  | 'App exception (system)'
  | 'App exception (bot)'
  | 'Business exception'
  | 'Manual (IT)'

/**
 * Classify an application exception as system-caused (infrastructure, servers,
 * connectivity) vs. bot-caused, by configurable keyword match on the message.
 */
export function classifyAppEx(reason: string, systemKeywords: string[]): 'system' | 'bot' {
  const lower = reason.toLowerCase()
  return systemKeywords.some((k) => k.trim() !== '' && lower.includes(k.trim().toLowerCase()))
    ? 'system'
    : 'bot'
}

/**
 * Who has to act on an occurrence.
 *  - `it`          infrastructure: servers, network, access, third-party systems
 *  - `automation`  the automation itself: a faulted process with a defect in its logic
 *  - `restartable` a transient system exception on a queue item ("Restartable
 *                  Element") — the item is simply retried; nobody has to act
 *  - `business`    nothing broken — the item was correctly routed out for manual handling
 */
export type Responsibility = 'it' | 'automation' | 'restartable' | 'business'

export function responsibilityOf(
  source: ErrorSource,
  raw: string,
  systemKeywords: string[],
): Responsibility {
  switch (source) {
    case 'Manual (IT)':
    case 'App exception (system)':
      return 'it'
    case 'App exception (bot)':
      // A system exception on a single queue item is not a defect in the
      // automation: the item can be restarted and normally goes through on
      // the retry. It is reported as a Restartable Element, owned by no one.
      return 'restartable'
    case 'Business exception':
      return 'business'
    case 'Job fault':
      // A job fault can be either — an unreachable server is infrastructure,
      // a broken selector is the automation. Same keyword rule decides.
      return classifyAppEx(raw, systemKeywords) === 'system' ? 'it' : 'automation'
  }
}

export interface ErrorOccurrence {
  source: ErrorSource
  message: string // normalized
  raw: string
  process: string // release or queue name
  time: string
  responsibility: Responsibility
}

export interface ErrorGroup {
  message: string
  source: ErrorSource
  responsibility: Responsibility
  count: number
  share: number // 0..1 of all occurrences
  processes: string[]
  lastSeen: string
  sample: string
}

export function collectErrors(
  jobs: OrchJob[],
  queueItems: OrchQueueItem[],
  queueNames: Map<number, string>,
  manualErrors: ManualError[] = [],
  systemKeywords: string[] = [],
): ErrorOccurrence[] {
  const out: ErrorOccurrence[] = []
  for (const j of jobs) {
    if (j.State !== 'Faulted') continue
    const raw = j.Info?.trim() || 'No fault details provided'
    out.push({
      source: 'Job fault',
      message: normalizeMessage(raw),
      raw,
      process: j.ReleaseName,
      time: j.CreationTime,
      responsibility: responsibilityOf('Job fault', raw, systemKeywords),
    })
  }
  for (const q of queueItems) {
    if (q.Status !== 'Failed' && q.Status !== 'Retried' && q.Status !== 'Abandoned') continue
    const raw = q.ProcessingException?.Reason?.trim() || `${q.Status} without exception reason`
    const source: ErrorSource =
      q.ProcessingExceptionType === 'BusinessException'
        ? 'Business exception'
        : classifyAppEx(raw, systemKeywords) === 'system'
          ? 'App exception (system)'
          : 'App exception (bot)'
    out.push({
      source,
      message: normalizeMessage(raw),
      raw,
      process: queueNames.get(q.QueueDefinitionId) ?? `Queue #${q.QueueDefinitionId}`,
      time: q.CreationTime,
      responsibility: responsibilityOf(source, raw, systemKeywords),
    })
  }
  for (const m of manualErrors) {
    const raw = `${m.category}: ${m.description}`
    out.push({
      source: 'Manual (IT)',
      message: normalizeMessage(raw),
      raw,
      process: m.process,
      time: m.time,
      responsibility: 'it',
    })
  }
  return out
}

export function groupErrors(occurrences: ErrorOccurrence[]): ErrorGroup[] {
  const map = new Map<string, ErrorGroup>()
  for (const o of occurrences) {
    const key = `${o.source}::${o.message}`
    const g = map.get(key)
    if (g) {
      g.count++
      if (!g.processes.includes(o.process)) g.processes.push(o.process)
      if (o.time > g.lastSeen) g.lastSeen = o.time
    } else {
      map.set(key, {
        message: o.message,
        source: o.source,
        responsibility: o.responsibility,
        count: 1,
        share: 0,
        processes: [o.process],
        lastSeen: o.time,
        sample: o.raw,
      })
    }
  }
  const total = occurrences.length || 1
  const groups = [...map.values()].sort((a, b) => b.count - a.count)
  for (const g of groups) g.share = g.count / total
  return groups
}
