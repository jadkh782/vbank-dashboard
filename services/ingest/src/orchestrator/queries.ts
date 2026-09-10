import { allPages, odata, odataDate, OrchestratorError, type ODataResponse } from './http'
import { QI_SELECT, downgrade, type SelectVariant } from './select'
import type { OrchFolder, OrchJob, OrchQueueDefinition, OrchQueueItem, OrchRelease } from './types'
import { chunk } from '../log'

export async function fetchFolders(): Promise<OrchFolder[]> {
  return allPages<OrchFolder>('Folders?$orderby=FullyQualifiedName')
}

export async function fetchReleases(folderId: number): Promise<OrchRelease[]> {
  return allPages<OrchRelease>('Releases?$select=Id,Name,ProcessKey,ProcessVersion,Description', folderId)
}

export async function fetchQueueDefs(folderId: number): Promise<OrchQueueDefinition[]> {
  return allPages<OrchQueueDefinition>('QueueDefinitions?$select=Id,Name,Description', folderId)
}

const JOB_SELECT = '$select=Id,Key,State,ReleaseName,HostMachineName,Source,CreationTime,StartTime,EndTime,Info'

export async function fetchJobs(folderId: number, from: Date, to: Date): Promise<OrchJob[]> {
  const filter = `$filter=CreationTime ge ${odataDate(from)} and CreationTime le ${odataDate(to)}`
  return allPages<OrchJob>(`Jobs?${filter}&${JOB_SELECT}&$orderby=CreationTime desc`, folderId)
}

/** How many jobs a folder has in a window (for `check`). */
export async function countJobs(folderId: number, from: Date): Promise<number> {
  const res = await odata<ODataResponse<unknown>>(`Jobs?$filter=CreationTime ge ${odataDate(from)}&$top=0&$count=true`, folderId)
  return res['@odata.count'] ?? 0
}

/**
 * Queue items in a window. Excluded queues are filtered server-side when the
 * list is short (`QueueDefinitionId ne …`; `in` is not available on 22.10) and
 * always client-side as well. On a 400 the select variant is downgraded once.
 */
export async function fetchQueueItems(
  folderId: number,
  from: Date,
  to: Date,
  excludedQueueIds: number[],
  variant: SelectVariant,
): Promise<{ items: OrchQueueItem[]; variant: SelectVariant }> {
  let filter = `CreationTime ge ${odataDate(from)} and CreationTime le ${odataDate(to)}`
  if (excludedQueueIds.length > 0 && excludedQueueIds.length <= 30) {
    filter += excludedQueueIds.map((id) => ` and QueueDefinitionId ne ${id}`).join('')
  }
  let v = variant
  for (;;) {
    try {
      const items = await allPages<OrchQueueItem>(`QueueItems?$filter=${filter}&$select=${QI_SELECT[v]}`, folderId)
      const excluded = new Set(excludedQueueIds)
      return { items: items.filter((i) => !excluded.has(i.QueueDefinitionId)), variant: v }
    } catch (e) {
      const next = e instanceof OrchestratorError && e.status === 400 ? downgrade(v) : null
      if (!next) throw e
      v = next
    }
  }
}

/** Specific items by id (chain ancestors outside the window, pending re-checks). */
export async function fetchQueueItemsByIds(folderId: number, ids: number[], variant: SelectVariant): Promise<OrchQueueItem[]> {
  const out: OrchQueueItem[] = []
  // 22.10 rejects long `or` chains in $filter (400 "Ungültige OData-Abfrageoptionen"); 10 terms are safe.
  for (const batch of chunk(ids, 10)) {
    const filter = batch.map((id) => `Id eq ${id}`).join(' or ')
    const res = await odata<ODataResponse<OrchQueueItem>>(`QueueItems?$filter=${filter}&$select=${QI_SELECT[variant]}&$top=${batch.length}`, folderId)
    out.push(...res.value)
  }
  return out
}
