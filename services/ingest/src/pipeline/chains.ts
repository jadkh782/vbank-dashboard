// Turn queue items into retry chains. The batch is completed with attempts the
// database already holds (earlier days) and with ancestors outside the window
// (from the database, else fetched by id), so a chain is always judged whole.

import { collapseRetries, linkByReference, type Chain, type ChainItem } from '@vbank/shared'
import { log } from '../log'
import { loadQueueItemsByChainIds, loadQueueItemsByIds } from '../db/repo'
import type { QueueItemRow } from '../db/rows'
import { fetchQueueItemsByIds } from '../orchestrator/queries'
import type { SelectVariant } from '../orchestrator/select'
import type { OrchQueueItem } from '../orchestrator/types'
import type { Catalog } from './catalog'

export interface BatchItem {
  folderId: number
  item: OrchQueueItem
}

const queueIdOf = (automationId: string) => Number(automationId.slice(2))

export function fromOrch(i: OrchQueueItem): ChainItem {
  return {
    id: i.Id,
    queueId: i.QueueDefinitionId,
    status: i.Status as ChainItem['status'],
    exceptionType: i.ProcessingExceptionType,
    reason: i.ProcessingException?.Reason ?? null,
    creationTime: i.CreationTime,
    startProcessing: i.StartProcessing,
    endProcessing: i.EndProcessing,
    reference: i.Reference,
    ancestorId: i.AncestorId ?? null,
    manualAncestorId: i.ManualAncestorId ?? null,
    retryNumber: i.RetryNumber ?? 0,
  }
}

export function fromRow(r: QueueItemRow): ChainItem {
  return {
    id: r.id,
    queueId: queueIdOf(r.automation_id),
    status: r.status as ChainItem['status'],
    exceptionType: r.exception_type as ChainItem['exceptionType'],
    reason: r.exception_reason,
    creationTime: r.creation_time,
    startProcessing: r.start_processing,
    endProcessing: r.end_processing,
    reference: r.reference,
    ancestorId: r.ancestor_id,
    manualAncestorId: r.manual_ancestor_id,
    retryNumber: r.retry_number,
  }
}

export interface ChainBuild {
  chains: Chain[]
  /** Every item that belongs to the built chains (batch + completed), keyed by id. */
  items: Map<number, ChainItem>
  /** folder of each item (needed to write rows and to fetch by id). */
  folderOf: Map<number, number>
  linkMethod: 'ancestor' | 'reference'
}

export async function buildChains(batch: BatchItem[], variant: SelectVariant): Promise<ChainBuild> {
  const items = new Map<number, ChainItem>()
  const folderOf = new Map<number, number>()
  for (const b of batch) {
    items.set(b.item.Id, fromOrch(b.item))
    folderOf.set(b.item.Id, b.folderId)
  }

  const addRows = (rows: QueueItemRow[]) => {
    for (const r of rows) {
      if (items.has(r.id)) continue
      items.set(r.id, fromRow(r))
      folderOf.set(r.id, r.folder_id)
    }
  }

  // 1. ancestors referenced but not in the batch: database first, then Orchestrator
  const missing = () =>
    [...items.values()]
      .flatMap((i) => [i.ancestorId, i.manualAncestorId])
      .filter((id): id is number => id !== null && !items.has(id))
  let want = [...new Set(missing())]
  if (want.length) addRows(await loadQueueItemsByIds(want))
  want = [...new Set(missing())]
  if (want.length && variant !== 'min') {
    // group by the folder of the item that references the ancestor
    const byFolder = new Map<number, number[]>()
    for (const i of items.values()) {
      for (const p of [i.ancestorId, i.manualAncestorId]) {
        if (p !== null && want.includes(p)) {
          const f = folderOf.get(i.id)!
          ;(byFolder.get(f) ?? byFolder.set(f, []).get(f)!).push(p)
        }
      }
    }
    for (const [f, ids] of byFolder) {
      const fetched = await fetchQueueItemsByIds(f, [...new Set(ids)], variant)
      for (const it of fetched) {
        items.set(it.Id, fromOrch(it))
        folderOf.set(it.Id, f)
      }
    }
    if (missing().length) log.warn(`${missing().length} chain ancestors could not be found; chains start at the earliest known attempt`)
  }

  // 2. attempts already stored for the same chains
  let chains = collapseRetries([...items.values()])
  const roots = chains.map((c) => c.rootId)
  const stored = await loadQueueItemsByChainIds(roots)
  addRows(stored)
  // items that were themselves chain roots earlier keep their id as chain_id, so
  // the query above also returns them; nothing else to load.

  // 3. link + collapse
  let all = [...items.values()]
  let linkMethod: ChainBuild['linkMethod'] = 'ancestor'
  if (variant === 'min') {
    all = linkByReference(all)
    linkMethod = 'reference'
    for (const i of all) items.set(i.id, i)
  }
  chains = collapseRetries(all)
  return { chains, items, folderOf, linkMethod }
}

/** Rows for `queue_items`, with the chain assignment written back. */
export function toQueueItemRows(build: ChainBuild, catalog: Catalog): QueueItemRow[] {
  const rows: QueueItemRow[] = []
  const nowIso = new Date().toISOString()
  for (const c of build.chains) {
    c.attempts.forEach((a, idx) => {
      const automation = catalog.byQueue.get(a.queueId)
      if (!automation) return // queue definition unknown to the catalogue
      rows.push({
        id: a.id,
        automation_id: automation.id,
        folder_id: build.folderOf.get(a.id) ?? automation.folder_id,
        status: a.status,
        exception_type: a.exceptionType,
        exception_reason: a.reason,
        creation_time: a.creationTime,
        start_processing: a.startProcessing,
        end_processing: a.endProcessing,
        reference: a.reference,
        ancestor_id: a.ancestorId,
        manual_ancestor_id: a.manualAncestorId,
        retry_number: a.retryNumber,
        chain_id: c.rootId,
        attempt_no: idx + 1,
        link_method: idx === 0 ? 'root' : a.ancestorId !== null ? (build.linkMethod === 'reference' ? 'reference' : 'ancestor') : a.manualAncestorId !== null ? 'manual' : 'reference',
        updated_at: nowIso,
      })
    })
  }
  return rows
}
