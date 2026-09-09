// Which QueueItem columns this Orchestrator accepts in $select. 22.10 rejects
// unknown properties with 400, and AncestorId/RetryNumber/ManualAncestorId
// could not be verified up front — so the worker probes once per run and
// degrades: FULL → BASE (no ManualAncestorId) → MIN (no chain links at all;
// chains are then linked by reference).

import { odata, OrchestratorError } from './http'
import type { OrchQueueItem } from './types'

export type SelectVariant = 'full' | 'base' | 'min'

const COMMON = 'Id,QueueDefinitionId,Status,ProcessingExceptionType,CreationTime,StartProcessing,EndProcessing,Reference,ProcessingException'

export const QI_SELECT: Record<SelectVariant, string> = {
  full: `${COMMON},AncestorId,RetryNumber,ManualAncestorId`,
  base: `${COMMON},AncestorId,RetryNumber`,
  min: COMMON,
}

const ORDER: SelectVariant[] = ['full', 'base', 'min']

/** Try each variant with $top=1 on a folder that has queues; first success wins. */
export async function probeSelectVariant(folderId: number): Promise<SelectVariant> {
  for (const v of ORDER) {
    try {
      await odata<{ value: OrchQueueItem[] }>(`QueueItems?$top=1&$select=${QI_SELECT[v]}`, folderId)
      return v
    } catch (e) {
      if (e instanceof OrchestratorError && e.status === 400) continue
      throw e
    }
  }
  return 'min'
}

/** The next weaker variant, for a 400 that appears mid-run. */
export function downgrade(v: SelectVariant): SelectVariant | null {
  const i = ORDER.indexOf(v)
  return i < ORDER.length - 1 ? ORDER[i + 1] : null
}
