// Re-run the suggestion step over every OPEN review item. Needed after the
// workbook import or after decisions in the Fehlerkatalog: the daily run only
// re-suggests items inside its own window, backfilled items would otherwise
// keep "ohne Vorschlag" forever.

import { suggest } from '@vbank/shared'
import { check, db, selectIn, upsertChunked } from '../db/client'
import { loadMappings, loadSettings } from '../db/repo'
import type { ReviewItemRow } from '../db/rows'
import { log } from '../log'

interface OpenItem extends ReviewItemRow {
  id: number
}

export async function resuggestOpen(): Promise<{ total: number; suggested: number }> {
  const settings = await loadSettings()
  const items: OpenItem[] = []
  for (let from = 0; ; from += 1000) {
    const page = check(await db().from('review_items').select('*').eq('status', 'open').order('id').range(from, from + 999), 'load open items') as OpenItem[]
    items.push(...(page ?? []))
    if (!page || page.length < 1000) break
  }
  if (items.length === 0) return { total: 0, suggested: 0 }

  const txIds = items.map((i) => i.transaction_id).filter((x): x is number => x !== null)
  const jobIds = items.map((i) => i.job_id).filter((x): x is number => x !== null)
  const txs = new Map((await selectIn<{ id: number; reason_norm: string | null; family_key: string | null }>('transactions', 'id, reason_norm, family_key', 'id', txIds)).map((t) => [t.id, t]))
  const jobs = new Map((await selectIn<{ id: number; info_norm: string | null; family_key: string | null }>('jobs', 'id, info_norm, family_key', 'id', jobIds)).map((j) => [j.id, j]))

  const appMaps = await loadMappings('app', [...txs.values()].map((t) => t.reason_norm!).filter(Boolean), [...txs.values()].map((t) => t.family_key!).filter(Boolean))
  const jobMaps = await loadMappings('job', [...jobs.values()].map((j) => j.info_norm!).filter(Boolean), [...jobs.values()].map((j) => j.family_key!).filter(Boolean))

  const nowIso = new Date().toISOString()
  const rows: OpenItem[] = []
  let suggested = 0
  for (const it of items) {
    const src = it.transaction_id !== null ? txs.get(it.transaction_id) : jobs.get(it.job_id!)
    const messageNorm = src ? ('reason_norm' in src ? src.reason_norm : src.info_norm) : null
    const family = src?.family_key ?? null
    const maps = it.kind === 'job' ? jobMaps : appMaps
    const s = suggest(
      { kind: it.kind, messageNorm: messageNorm ?? '', familyKey: family ?? '', recovered: false },
      { message: messageNorm ? maps.byMessage.get(messageNorm) ?? null : null, family: family ? maps.byFamily.get(family) ?? null : null, keywordFallback: settings.keyword_fallback },
    )
    if (s) suggested++
    const changed = s?.category !== it.suggested_category || s?.confidence !== it.suggested_confidence || !s !== it.unknown_family
    if (changed) rows.push({ ...it, suggested_category: s?.category ?? null, suggested_confidence: s?.confidence ?? null, suggested_reason: s?.reason ?? null, unknown_family: !s, updated_at: nowIso })
  }
  if (rows.length) await upsertChunked('review_items', rows, 'id')
  log.info(`resuggest: ${items.length} open items, ${suggested} with a suggestion, ${rows.length} updated`)
  return { total: items.length, suggested }
}
