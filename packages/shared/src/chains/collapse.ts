// Retry chains. Orchestrator retries a failed queue item by creating a NEW item
// whose AncestorId points at the original (RetryNumber 1..n) and flipping the
// original's status to 'Retried'; a manual retry sets ManualAncestorId and
// keeps RetryNumber 0. One transaction = the whole chain, judged by its final
// attempt. Used by the ingest worker and the demo generator.

export type ItemStatus = 'New' | 'InProgress' | 'Successful' | 'Failed' | 'Abandoned' | 'Retried' | 'Deleted'

export interface ChainItem {
  id: number
  queueId: number
  status: ItemStatus
  exceptionType: 'ApplicationException' | 'BusinessException' | null
  reason: string | null
  creationTime: string
  startProcessing: string | null
  endProcessing: string | null
  reference: string | null
  ancestorId: number | null
  manualAncestorId: number | null
  retryNumber: number
}

export interface Chain {
  /** Id of the first attempt — the transaction's identity. */
  rootId: number
  queueId: number
  /** Attempts in order, first to last. */
  attempts: ChainItem[]
  final: ChainItem
  retryCount: number
  wasRetried: boolean
  firstCreated: string
  lastCreated: string
}

const parentOf = (it: ChainItem) => it.ancestorId ?? it.manualAncestorId ?? null

/**
 * Group items into chains. Items whose ancestor is not in the input head their
 * own chain (the earliest fetched attempt stands in for the root).
 */
export function collapseRetries(items: ChainItem[]): Chain[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const memo = new Map<number, { root: number; depth: number }>()

  const resolve = (it: ChainItem): { root: number; depth: number } => {
    const seen = new Set<number>()
    const path: ChainItem[] = []
    let cur: ChainItem | undefined = it
    let result: { root: number; depth: number } | null = null
    while (cur) {
      const hit = memo.get(cur.id)
      if (hit) {
        result = hit
        break
      }
      if (seen.has(cur.id)) break // defensive: a cycle in the data
      seen.add(cur.id)
      path.push(cur)
      const p = parentOf(cur)
      cur = p === null ? undefined : byId.get(p)
    }
    if (!result) {
      const top = path[path.length - 1]
      result = { root: top.id, depth: 0 }
      memo.set(top.id, result)
      path.pop()
    }
    // Unwind: each item on the path is one level below the item after it.
    for (let i = path.length - 1; i >= 0; i--) {
      result = { root: result.root, depth: result.depth + 1 }
      memo.set(path[i].id, result)
    }
    return memo.get(it.id)!
  }

  const groups = new Map<number, { item: ChainItem; depth: number }[]>()
  for (const it of items) {
    const { root, depth } = resolve(it)
    const g = groups.get(root)
    if (g) g.push({ item: it, depth })
    else groups.set(root, [{ item: it, depth }])
  }

  const chains: Chain[] = []
  for (const [rootId, members] of groups) {
    // Sort by depth, then time, then id — not by RetryNumber (manual retries carry 0).
    members.sort(
      (a, b) =>
        a.depth - b.depth ||
        a.item.creationTime.localeCompare(b.item.creationTime) ||
        a.item.id - b.item.id,
    )
    const attempts = members.map((m) => m.item)
    const final = attempts[attempts.length - 1]
    const retryCount = Math.max(attempts.length - 1, final.retryNumber)
    chains.push({
      rootId,
      queueId: final.queueId,
      attempts,
      final,
      retryCount,
      wasRetried: retryCount > 0 || attempts.some((a) => a.status === 'Retried'),
      firstCreated: attempts[0].creationTime,
      lastCreated: final.creationTime,
    })
  }
  return chains
}

/**
 * Fallback when the tenant does not expose AncestorId: link each 'Retried' item
 * to the next item of the same queue and reference created within 7 days.
 * Returns copies with `ancestorId` filled in; existing links are kept.
 */
export function linkByReference(items: ChainItem[]): ChainItem[] {
  const out = items.map((i) => ({ ...i }))
  const byKey = new Map<string, ChainItem[]>()
  for (const it of out) {
    if (!it.reference) continue
    const k = `${it.queueId}::${it.reference}`
    const arr = byKey.get(k)
    if (arr) arr.push(it)
    else byKey.set(k, [it])
  }
  const WEEK = 7 * 24 * 3600_000
  for (const arr of byKey.values()) {
    if (arr.length < 2) continue
    arr.sort((a, b) => a.creationTime.localeCompare(b.creationTime) || a.id - b.id)
    for (let i = 0; i < arr.length - 1; i++) {
      const cur = arr[i]
      const next = arr[i + 1]
      if (cur.status !== 'Retried' || parentOf(next) !== null) continue
      const gap = new Date(next.creationTime).getTime() - new Date(cur.creationTime).getTime()
      if (gap >= 0 && gap <= WEEK) next.ancestorId = cur.id
    }
  }
  return out
}
