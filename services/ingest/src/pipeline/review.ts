// Review items: what a person has to look at. One per failed transaction
// (final attempt failed with an application exception) and per faulted job;
// recovered chains get an informational, non-blocking item. Suggestions come
// from the mapping tables; a person confirms in the Control Board.

import { recovered, suggest, type Chain, type MappingRow } from '@vbank/shared'
import { log } from '../log'
import { deleteReviewItems, loadMappings, loadReviewItems, loadSettings, upsertReviewItemsByJob, upsertReviewItemsByTx } from '../db/repo'
import type { JobRow, ReviewItemRow, TransactionRow } from '../db/rows'

type Desired = { status: 'open' } | { status: 'info' } | null

function desiredForTx(t: TransactionRow, chain: Chain | undefined): Desired {
  if (chain && recovered(chain)) return { status: 'info' }
  if (t.outcome === 'failed' && t.kind === 'app') return { status: 'open' }
  return null
}

export async function syncReviewItems(txRows: TransactionRow[], chains: Map<number, Chain>, jobRows: JobRow[]): Promise<{ open: number; info: number; deleted: number; unknown: number }> {
  const settings = await loadSettings()
  const existing = await loadReviewItems(
    txRows.map((t) => t.id),
    jobRows.map((j) => j.id),
  )
  const byTx = new Map(existing.filter((r) => r.transaction_id !== null).map((r) => [r.transaction_id!, r]))
  const byJob = new Map(existing.filter((r) => r.job_id !== null).map((r) => [r.job_id!, r]))
  const nowIso = new Date().toISOString()

  const appMaps = await loadMappings(
    'app',
    txRows.map((t) => t.reason_norm).filter((x): x is string => !!x),
    txRows.map((t) => t.family_key).filter((x): x is string => !!x),
  )
  const jobMaps = await loadMappings(
    'job',
    jobRows.map((j) => j.info_norm).filter((x): x is string => !!x),
    jobRows.map((j) => j.family_key).filter((x): x is string => !!x),
  )

  const txUpserts: ReviewItemRow[] = []
  const jobUpserts: ReviewItemRow[] = []
  const toDelete: number[] = []
  let unknown = 0

  const suggestion = (kind: 'app' | 'job', messageNorm: string | null, family: string | null, isRecovered: boolean, maps: { byMessage: Map<string, MappingRow>; byFamily: Map<string, MappingRow> }) => {
    const s = suggest(
      { kind, messageNorm: messageNorm ?? '', familyKey: family ?? '', recovered: isRecovered },
      { message: messageNorm ? maps.byMessage.get(messageNorm) ?? null : null, family: family ? maps.byFamily.get(family) ?? null : null, keywordFallback: settings.keyword_fallback },
    )
    return s
  }

  for (const t of txRows) {
    const chain = chains.get(t.id)
    const want = desiredForTx(t, chain)
    const have = byTx.get(t.id)
    if (!want) {
      if (have?.status === 'open' || have?.status === 'info') toDelete.push(have.id!)
      else if (have?.status === 'confirmed' && !have.outcome_changed) txUpserts.push({ ...have, outcome_changed: true, updated_at: nowIso })
      continue
    }
    if (have?.status === 'confirmed') {
      if (want.status === 'info' && !have.outcome_changed) txUpserts.push({ ...have, outcome_changed: true, updated_at: nowIso })
      continue
    }
    const s = suggestion('app', t.reason_norm, t.family_key, want.status === 'info', appMaps)
    if (!s && want.status === 'open') unknown++
    txUpserts.push({
      ...(have ? { id: have.id } : {}),
      kind: 'app',
      transaction_id: t.id,
      job_id: null,
      automation_id: t.automation_id,
      business_day: t.business_day,
      status: want.status,
      category: want.status === 'info' ? 'neustartfaehig' : null,
      suggested_category: s?.category ?? null,
      suggested_confidence: s?.confidence ?? null,
      suggested_reason: s?.reason ?? null,
      unknown_family: !s,
      outcome_changed: false,
      updated_at: nowIso,
    })
  }

  for (const j of jobRows) {
    const have = byJob.get(j.id)
    if (j.state !== 'Faulted') {
      if (have?.status === 'open') toDelete.push(have.id!)
      continue
    }
    if (have?.status === 'confirmed') continue
    const s = suggestion('job', j.info_norm, j.family_key, false, jobMaps)
    if (!s) unknown++
    jobUpserts.push({
      ...(have ? { id: have.id } : {}),
      kind: 'job',
      transaction_id: null,
      job_id: j.id,
      automation_id: j.automation_id,
      business_day: j.business_day,
      status: 'open',
      category: null,
      suggested_category: s?.category ?? null,
      suggested_confidence: s?.confidence ?? null,
      suggested_reason: s?.reason ?? null,
      unknown_family: !s,
      outcome_changed: false,
      updated_at: nowIso,
    })
  }

  await deleteReviewItems(toDelete)
  if (txUpserts.length) await upsertReviewItemsByTx(txUpserts)
  if (jobUpserts.length) await upsertReviewItemsByJob(jobUpserts)
  const open = [...txUpserts, ...jobUpserts].filter((r) => r.status === 'open').length
  const info = txUpserts.filter((r) => r.status === 'info').length
  log.info(`review: ${open} open, ${info} info, ${toDelete.length} removed, ${unknown} without suggestion`)
  return { open, info, deleted: toDelete.length, unknown }
}
