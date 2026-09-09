// One `transactions` row per chain, attributed to the Berlin day of its first attempt.

import { berlinDay, chainOutcome, familyKey, lastFailureReason, normalizeMessage, processingMs, reviewKind, type Chain } from '@vbank/shared'
import { loadTransactions, upsertTransactions } from '../db/repo'
import type { TransactionRow } from '../db/rows'
import type { Catalog } from './catalog'
import type { ChainBuild } from './chains'

export function toTransactionRows(build: ChainBuild, catalog: Catalog): TransactionRow[] {
  const nowIso = new Date().toISOString()
  const rows: TransactionRow[] = []
  for (const c of build.chains) {
    const automation = catalog.byQueue.get(c.queueId)
    if (!automation) continue
    const outcome = chainOutcome(c.final)
    const kind = reviewKind(c.final)
    const reasonRaw = outcome === 'failed' || outcome === 'business_exception' ? c.final.reason ?? lastFailureReason(c) : lastFailureReason(c)
    const reasonNorm = reasonRaw ? normalizeMessage(reasonRaw) : null
    rows.push({
      id: c.rootId,
      automation_id: automation.id,
      folder_id: build.folderOf.get(c.final.id) ?? automation.folder_id,
      first_creation_time: c.firstCreated,
      last_creation_time: c.lastCreated,
      business_day: berlinDay(c.firstCreated),
      attempts: c.attempts.length,
      was_retried: c.wasRetried,
      final_item_id: c.final.id,
      final_status: c.final.status,
      final_exception_type: c.final.exceptionType,
      reason_raw: reasonRaw,
      reason_norm: reasonNorm,
      family_key: reasonNorm ? familyKey(reasonNorm, kind) : null,
      kind: reasonNorm ? kind : null,
      outcome,
      processing_ms: processingMs(c),
      updated_at: nowIso,
    })
  }
  return rows
}

/** Upsert, marking transactions whose outcome changed since the last run. */
export async function storeTransactions(rows: TransactionRow[]): Promise<{ changed: number }> {
  if (rows.length === 0) return { changed: 0 }
  const existing = new Map((await loadTransactions(rows.map((r) => r.id))).map((t) => [t.id, t]))
  let changed = 0
  for (const r of rows) {
    const e = existing.get(r.id)
    if (e && (e.outcome !== r.outcome || e.attempts !== r.attempts)) {
      r.outcome_changed_at = r.updated_at
      changed++
    } else if (e) {
      r.outcome_changed_at = e.outcome_changed_at ?? null
    }
  }
  await upsertTransactions(rows)
  return { changed }
}

export function chainsById(chains: Chain[]): Map<number, Chain> {
  return new Map(chains.map((c) => [c.rootId, c]))
}
