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

const QI_SELECT =
  '$select=Id,QueueDefinitionId,Status,ProcessingExceptionType,CreationTime,StartProcessing,EndProcessing,Reference&$expand=ProcessingException($select=Reason,Type)'

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

  const [jobResults, queueDefs, queueItemResults, alerts, license] = await Promise.all([
    Promise.all(scoped.map((f) => fetchJobsForFolder(f, extendedFrom, to))),
    Promise.all(scoped.map((f) => fetchQueueDefsForFolder(f))),
    Promise.all(scoped.map((f) => fetchQueueItemsForFolder(f, extendedFrom, to))),
    fetchAlerts(extendedFrom),
    fetchLicense(),
  ])

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
