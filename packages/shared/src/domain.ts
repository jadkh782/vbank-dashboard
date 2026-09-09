// The domain the dashboard and the Control Board reason about. Rows come from
// the published Supabase views (or the demo generator) and are mapped into these
// shapes once; every aggregate below works on them, never on Orchestrator records.

import type { Category } from './categories'

export type AutomationKind = 'process' | 'queue'

export interface Automation {
  /** Stable id: `p:<folder>/<name>` for processes, `q:<queueDefinitionId>` for queues. */
  id: string
  kind: AutomationKind
  technicalName: string
  /** Fachbereich — the Orchestrator folder's display name. */
  folder: string
  displayName: string
  description: string | null
  /** Manual handling time per transaction (queues only); drives Zeitersparnis. */
  humanMinutesPerItem: number | null
}

export type RunState = 'success' | 'faulted' | 'stopped' | 'running'

/** One process run (an Orchestrator job). */
export interface Run {
  automationId: string
  /** Business day (Europe/Berlin), YYYY-MM-DD. */
  day: string
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  state: RunState
  /** Reviewed category of a faulted run; null while unreviewed or when not faulted. */
  category: Category | null
  /** Normalised message of a faulted run — never the raw text. */
  family: string | null
}

/**
 * Outcome of one queue transaction (a whole retry chain):
 *  - success            final attempt succeeded (possibly after retries)
 *  - business_exception correctly recognised routing-out, counts as correct
 *  - failed             last attempt failed with an application exception
 *  - pending            still open (New / InProgress / orphan Retried)
 *  - ignored            reviewed as "Nicht als Fehler anzeigen": counts as correct,
 *                       never listed as an open point
 */
export type TxnOutcome = 'success' | 'business_exception' | 'failed' | 'pending' | 'ignored'

export interface Txn {
  automationId: string
  day: string
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  outcome: TxnOutcome
  /** Number of attempts in the chain (1 = never retried). */
  attempts: number
  /** Σ processing time over all attempts, ms; null when nothing was measured. */
  processingMs: number | null
  category: Category | null
  family: string | null
}

/** An IT incident reported by hand in the Control Board. */
export interface ManualErrorRow {
  id: string
  automationId: string | null
  /** Display name of the affected automation (or free text). */
  targetName: string
  occurredAt: string
  category: Category
  description: string
  downtimeMinutes: number | null
}

export interface Thresholds {
  okMin: number
  attentionMin: number
}

export interface DashboardSettings {
  hoursPerPT: number
  thresholds: Thresholds
}

/** Everything the stakeholder view needs for one window (plus the previous one). */
export interface DashboardData {
  /** Last published day, YYYY-MM-DD. */
  datenstand: string
  automations: Automation[]
  runs: Run[]
  txns: Txn[]
  manualErrors: ManualErrorRow[]
  settings: DashboardSettings
}
