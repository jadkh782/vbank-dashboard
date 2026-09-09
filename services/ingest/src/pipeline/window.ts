// Fetch jobs and queue items of one time window for every included automation.

import { config } from '../config'
import { log, pooled } from '../log'
import { fetchJobs, fetchQueueItems } from '../orchestrator/queries'
import type { SelectVariant } from '../orchestrator/select'
import type { OrchFolder, OrchJob, OrchQueueItem } from '../orchestrator/types'
import type { Catalog } from './catalog'

export interface FetchedWindow {
  jobs: { folder: OrchFolder; job: OrchJob }[]
  items: { folder: OrchFolder; item: OrchQueueItem }[]
  failedFolders: number[]
  variant: SelectVariant
}

export async function fetchWindow(catalog: Catalog, from: Date, to: Date, variant: SelectVariant): Promise<FetchedWindow> {
  const out: FetchedWindow = { jobs: [], items: [], failedFolders: [], variant }
  await pooled(catalog.folders, config().folderConcurrency, async (f) => {
    const inFolder = catalog.automations.filter((a) => a.folder_id === f.Id)
    const includedProcesses = new Set(inFolder.filter((a) => a.kind === 'process' && a.included).map((a) => a.technical_name))
    const queues = inFolder.filter((a) => a.kind === 'queue')
    const excludedQueueIds = queues.filter((a) => !a.included).map((a) => a.orch_id!).filter((x) => x !== null)
    const hasIncludedQueue = queues.some((a) => a.included)
    // Historical jobs of deleted releases are included by default too, so a
    // folder is only skipped when *everything* in it is switched off.
    const anyIncluded = includedProcesses.size > 0 || hasIncludedQueue || inFolder.length === 0
    if (!anyIncluded) return
    try {
      const jobs = await fetchJobs(f.Id, from, to)
      const excludedProcesses = new Set(inFolder.filter((a) => a.kind === 'process' && !a.included).map((a) => a.technical_name))
      for (const job of jobs) if (!excludedProcesses.has(job.ReleaseName)) out.jobs.push({ folder: f, job })
      if (catalog.foldersWithQueues.has(f.Id) && hasIncludedQueue) {
        const res = await fetchQueueItems(f.Id, from, to, excludedQueueIds, out.variant)
        if (res.variant !== out.variant) {
          log.warn(`select variant downgraded to ${res.variant} (folder ${f.DisplayName})`)
          out.variant = res.variant
        }
        for (const item of res.items) out.items.push({ folder: f, item })
      }
      log.info(`  ${f.DisplayName.padEnd(44)} jobs ${String(jobs.length).padStart(5)}`)
    } catch (e) {
      log.error(`folder ${f.DisplayName}: ${(e as Error).message}`)
      out.failedFolders.push(f.Id)
    }
  })
  return out
}
