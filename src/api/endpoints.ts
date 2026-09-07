import { fetchAllPages, fetchOne, fetchRaw, odataDate, OrchestratorError } from './client'
import type {
  LicenseInfo,
  OrchAlert,
  OrchFolder,
  OrchJob,
  OrchQueueDefinition,
  OrchQueueItem,
  TenantData,
} from './types'

export async function fetchFolders(): Promise<OrchFolder[]> {
  const res = await fetchAllPages<OrchFolder>('odata/Folders?$orderby=FullyQualifiedName')
  return res.items
}

const JOB_SELECT =
  '$select=Id,Key,State,ReleaseName,HostMachineName,Source,CreationTime,StartTime,EndTime,Info'

async function fetchJobsForFolder(folder: OrchFolder, from: Date, to: Date) {
  const filter = `$filter=CreationTime ge ${odataDate(from)} and CreationTime le ${odataDate(to)}`
  const res = await fetchAllPages<OrchJob>(
    `odata/Jobs?${filter}&${JOB_SELECT}&$orderby=CreationTime desc`,
    folder.Id,
  )
  const items = res.items.map((j) => ({ ...j, FolderId: folder.Id, FolderName: folder.DisplayName }))
  return { items, truncated: res.truncated }
}

async function fetchQueueDefsForFolder(folder: OrchFolder) {
  const res = await fetchAllPages<OrchQueueDefinition>(
    'odata/QueueDefinitions?$select=Id,Name,Description',
    folder.Id,
  )
  return res.items.map((q) => ({ ...q, FolderId: folder.Id, FolderName: folder.DisplayName }))
}

// ProcessingException is a complex (inline) property, not a navigation
// property: it is selected directly. Self-hosted Orchestrator (e.g. 22.10)
// rejects `$expand=ProcessingException` with 400 "invalid OData query options".
const QI_SELECT =
  '$select=Id,QueueDefinitionId,Status,ProcessingExceptionType,CreationTime,StartProcessing,EndProcessing,Reference,ProcessingException'

async function fetchQueueItemsForFolder(folder: OrchFolder, from: Date, to: Date) {
  const filter = `$filter=CreationTime ge ${odataDate(from)} and CreationTime le ${odataDate(to)}`
  const res = await fetchAllPages<OrchQueueItem>(`odata/QueueItems?${filter}&${QI_SELECT}`, folder.Id)
  const items = res.items.map((q) => ({ ...q, FolderId: folder.Id }))
  return { items, truncated: res.truncated }
}

async function fetchAlerts(from: Date): Promise<OrchAlert[] | null> {
  try {
    const res = await fetchOne<OrchAlert>(
      `odata/Alerts?$filter=CreationTime ge ${odataDate(from)}&$orderby=CreationTime desc&$top=200`,
    )
    return res.value
  } catch (e) {
    // Alerts need the OR.Monitoring scope; degrade gracefully if it's missing.
    if (e instanceof OrchestratorError && (e.status === 403 || e.status === 401)) return null
    throw e
  }
}

interface RawLicense {
  Allowed?: Record<string, number>
  Used?: Record<string, number>
}

async function fetchLicense(): Promise<LicenseInfo | null> {
  try {
    const raw = await fetchRaw<RawLicense>('odata/Settings/UiPath.Server.Configuration.OData.GetLicense')
    const allowed = raw.Allowed?.Unattended ?? raw.Allowed?.UnattendedConcurrent ?? null
    const used = raw.Used?.Unattended ?? raw.Used?.UnattendedConcurrent ?? null
    if (allowed === null && used === null) return null
    return { allowed, used }
  } catch {
    // Endpoint needs an admin-level scope on some tenants; the utilization view
    // falls back to the manually configured license capacity.
    return null
  }
}

/**
 * Browsers open at most ~6 connections per origin and a self-hosted
 * Orchestrator slows down sharply when dozens of folder queries arrive at
 * once (29 folders × 3 queries took ~1 min; throttled it takes ~4 s). So
 * per-folder queries run through a small pool instead of one big Promise.all.
 */
const FOLDER_CONCURRENCY = 5

async function pooled<A, R>(items: A[], fn: (item: A) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(FOLDER_CONCURRENCY, items.length) }, worker))
  return out
}

/**
 * Fetch everything the dashboard needs for a time window across the selected
 * folders. `from` is extended backwards by the window length so KPI deltas can
 * compare against the previous equivalent period without a second round-trip.
 */
export async function fetchTenantData(
  folders: OrchFolder[],
  selectedFolderId: number | 'all',
  from: Date,
  to: Date,
): Promise<TenantData> {
  const scoped = selectedFolderId === 'all' ? folders : folders.filter((f) => f.Id === selectedFolderId)
  const windowMs = to.getTime() - from.getTime()
  const extendedFrom = new Date(from.getTime() - windowMs)

  // Queue definitions are cheap; queue items are the expensive query, so it is
  // only issued for folders that actually contain queues.
  const [jobResults, queueDefs, alerts, license] = await Promise.all([
    pooled(scoped, (f) => fetchJobsForFolder(f, extendedFrom, to)),
    pooled(scoped, (f) => fetchQueueDefsForFolder(f)),
    fetchAlerts(extendedFrom),
    fetchLicense(),
  ])
  const withQueues = scoped.filter((_, i) => queueDefs[i].length > 0)
  const queueItemResults = await pooled(withQueues, (f) => fetchQueueItemsForFolder(f, extendedFrom, to))

  return {
    folders,
    jobs: jobResults.flatMap((r) => r.items),
    queues: queueDefs.flat(),
    queueItems: queueItemResults.flatMap((r) => r.items),
    alerts,
    license,
    truncated: [...jobResults, ...queueItemResults].some((r) => r.truncated),
    fetchedAt: Date.now(),
  }
}
