// Folders, processes (releases) and queues → `folders` / `automations`.
// New automations start included (is_new = true so the Control Board shows a
// "neu" badge); decisions made there (included, display names, human minutes)
// are never overwritten because the upsert only carries catalogue columns.

import { config } from '../config'
import { log, pooled } from '../log'
import { loadAutomations, upsertAutomations, upsertFolders } from '../db/repo'
import type { AutomationRow } from '../db/rows'
import { fetchFolders, fetchQueueDefs, fetchReleases } from '../orchestrator/queries'
import type { OrchFolder } from '../orchestrator/types'

export interface Catalog {
  folders: OrchFolder[]
  automations: AutomationRow[]
  /** `${folderId}::${releaseName}` → automation */
  byRelease: Map<string, AutomationRow>
  /** queue definition id → automation */
  byQueue: Map<number, AutomationRow>
  /** Folders that have at least one queue definition (only those get QueueItems queries). */
  foldersWithQueues: Set<number>
}

// Folder DISPLAY names repeat across the tree (sub-folders), so the id carries the folder id.
export const processAutomationId = (folderId: number, releaseName: string) => `p:${folderId}/${releaseName}`
export const queueAutomationId = (queueDefinitionId: number) => `q:${queueDefinitionId}`

export async function syncCatalog(): Promise<Catalog> {
  const folders = await fetchFolders()
  const nowIso = new Date().toISOString()
  await upsertFolders(folders.map((f) => ({ id: f.Id, display_name: f.DisplayName, fully_qualified_name: f.FullyQualifiedName, last_seen: nowIso })))

  const rows: Omit<AutomationRow, 'included' | 'is_new'>[] = []
  const foldersWithQueues = new Set<number>()
  await pooled(folders, config().folderConcurrency, async (f) => {
    const [releases, queues] = await Promise.all([fetchReleases(f.Id), fetchQueueDefs(f.Id)])
    for (const r of releases) {
      rows.push({
        id: processAutomationId(f.Id, r.Name),
        kind: 'process',
        folder_id: f.Id,
        folder_name: f.DisplayName,
        technical_name: r.Name,
        orch_id: r.Id,
        process_key: r.ProcessKey,
        version: r.ProcessVersion,
        description: r.Description,
        last_seen: nowIso,
      })
    }
    for (const q of queues) {
      foldersWithQueues.add(f.Id)
      rows.push({
        id: queueAutomationId(q.Id),
        kind: 'queue',
        folder_id: f.Id,
        folder_name: f.DisplayName,
        technical_name: q.Name,
        orch_id: q.Id,
        description: q.Description,
        last_seen: nowIso,
      })
    }
  })
  await upsertAutomations(dedupe(rows))
  log.info(`catalog: ${folders.length} folders, ${rows.filter((r) => r.kind === 'process').length} processes, ${rows.filter((r) => r.kind === 'queue').length} queues`)
  return indexCatalog(folders, await loadAutomations(), foldersWithQueues)
}

/** One row per id — the same release can appear twice in an Orchestrator listing. */
function dedupe<T extends { id: string }>(rows: T[]): T[] {
  return [...new Map(rows.map((r) => [r.id, r])).values()]
}

export function indexCatalog(folders: OrchFolder[], automations: AutomationRow[], foldersWithQueues: Set<number>): Catalog {
  const byRelease = new Map<string, AutomationRow>()
  const byQueue = new Map<number, AutomationRow>()
  for (const a of automations) {
    if (a.kind === 'process') byRelease.set(`${a.folder_id}::${a.technical_name}`, a)
    else if (a.orch_id !== null) byQueue.set(a.orch_id, a)
  }
  return { folders, automations, byRelease, byQueue, foldersWithQueues }
}

/**
 * Jobs of releases that no longer exist still matter for history: give them an
 * automation row (kind process, no orch_id) so they can be stored and reviewed.
 */
export async function ensureProcessAutomations(catalog: Catalog, missing: { folder: OrchFolder; releaseName: string }[]): Promise<void> {
  const seen = new Set<string>()
  const rows: Omit<AutomationRow, 'included' | 'is_new'>[] = []
  for (const m of missing) {
    const id = processAutomationId(m.folder.Id, m.releaseName)
    if (seen.has(id) || catalog.byRelease.has(`${m.folder.Id}::${m.releaseName}`)) continue
    seen.add(id)
    rows.push({
      id,
      kind: 'process',
      folder_id: m.folder.Id,
      folder_name: m.folder.DisplayName,
      technical_name: m.releaseName,
      orch_id: null,
      description: '(Prozess nicht mehr vorhanden – nur Job-Historie)',
      last_seen: new Date().toISOString(),
    })
  }
  if (rows.length === 0) return
  await upsertAutomations(rows)
  for (const r of rows) {
    const full: AutomationRow = { ...r, included: true, is_new: true }
    catalog.byRelease.set(`${r.folder_id}::${r.technical_name}`, full)
    catalog.automations.push(full)
  }
  log.info(`catalog: ${rows.length} historical processes added`)
}
