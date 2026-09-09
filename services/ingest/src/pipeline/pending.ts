// Items that were still undecided (New / InProgress / orphan Retried) when they
// left the lookback window are re-read so their chains can be finished.

import { log } from '../log'
import { loadPendingItems } from '../db/repo'
import { fetchQueueItemsByIds } from '../orchestrator/queries'
import type { SelectVariant } from '../orchestrator/select'
import type { BatchItem } from './chains'

export async function refreshPending(before: Date, variant: SelectVariant): Promise<BatchItem[]> {
  const pending = await loadPendingItems(before)
  if (pending.length === 0) return []
  const byFolder = new Map<number, number[]>()
  for (const p of pending) (byFolder.get(p.folder_id) ?? byFolder.set(p.folder_id, []).get(p.folder_id)!).push(p.id)
  const changed: BatchItem[] = []
  const known = new Map(pending.map((p) => [p.id, p]))
  for (const [folderId, ids] of byFolder) {
    try {
      const fresh = await fetchQueueItemsByIds(folderId, ids, variant)
      for (const item of fresh) {
        const old = known.get(item.Id)
        if (old && old.status !== item.Status) changed.push({ folderId, item })
      }
    } catch (e) {
      log.warn(`pending re-check failed for folder ${folderId}: ${(e as Error).message}`)
    }
  }
  log.info(`pending: ${pending.length} re-checked, ${changed.length} changed`)
  return changed
}
