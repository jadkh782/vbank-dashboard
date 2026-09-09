// One ingest run over a window: catalogue → fetch → rows → chains →
// transactions → pending → review items → days. Idempotent: every write is an
// upsert keyed by Orchestrator ids, so any window can be re-run.

import { addDays, berlinDay, familyKey, normalizeMessage } from '@vbank/shared'
import { log } from '../log'
import { finishRun, getState, setState, startRun, touchDays, upsertJobs, upsertQueueItems } from '../db/repo'
import type { JobRow } from '../db/rows'
import { probeSelectVariant, type SelectVariant } from '../orchestrator/select'
import type { OrchFolder, OrchJob } from '../orchestrator/types'
import { ensureProcessAutomations, syncCatalog, type Catalog } from '../pipeline/catalog'
import { buildChains, toQueueItemRows, type BatchItem } from '../pipeline/chains'
import { refreshPending } from '../pipeline/pending'
import { syncReviewItems } from '../pipeline/review'
import { chainsById, storeTransactions, toTransactionRows } from '../pipeline/transactions'
import { fetchWindow } from '../pipeline/window'

export interface RunResult {
  runId: number
  status: 'ok' | 'partial' | 'failed'
  stats: Record<string, unknown>
}

export async function resolveVariant(catalog: Catalog): Promise<SelectVariant> {
  const folder = catalog.folders.find((f) => catalog.foldersWithQueues.has(f.Id))
  if (!folder) return 'min'
  const v = await probeSelectVariant(folder.Id)
  await setState('qi_select_variant', v)
  return v
}

function toJobRows(catalog: Catalog, jobs: { folder: OrchFolder; job: OrchJob }[]): JobRow[] {
  const nowIso = new Date().toISOString()
  const rows: JobRow[] = []
  for (const { folder, job } of jobs) {
    const automation = catalog.byRelease.get(`${folder.Id}::${job.ReleaseName}`)
    if (!automation) continue
    const info = job.Info?.trim() || null
    const norm = job.State === 'Faulted' ? normalizeMessage(info ?? 'No fault details provided') : null
    rows.push({
      id: job.Id,
      key: job.Key,
      automation_id: automation.id,
      folder_id: folder.Id,
      release_name: job.ReleaseName,
      state: job.State,
      host_machine: job.HostMachineName,
      source: job.Source,
      creation_time: job.CreationTime,
      start_time: job.StartTime,
      end_time: job.EndTime,
      info,
      info_norm: norm,
      family_key: norm ? familyKey(norm, 'job') : null,
      business_day: berlinDay(job.CreationTime),
      updated_at: nowIso,
    })
  }
  return rows
}

export async function runWindow(kind: string, from: Date, to: Date): Promise<RunResult> {
  const runId = await startRun(kind, from, to)
  log.info(`run #${runId} ${kind}: ${from.toISOString()} → ${to.toISOString()}`)
  try {
    const catalog = await syncCatalog()
    const variant = await resolveVariant(catalog)
    log.info(`queue item select variant: ${variant}`)

    const fetched = await fetchWindow(catalog, from, to, variant)
    if (fetched.variant !== variant) await setState('qi_select_variant', fetched.variant)

    // jobs
    await ensureProcessAutomations(
      catalog,
      fetched.jobs.filter((j) => !catalog.byRelease.has(`${j.folder.Id}::${j.job.ReleaseName}`)).map((j) => ({ folder: j.folder, releaseName: j.job.ReleaseName })),
    )
    const jobRows = toJobRows(catalog, fetched.jobs)
    await upsertJobs(jobRows)

    // queue items → chains → transactions
    const batch: BatchItem[] = fetched.items.map((x) => ({ folderId: x.folder.Id, item: x.item }))
    const pendingChanged = await refreshPending(from, fetched.variant)
    const all = [...batch, ...pendingChanged]
    const build = await buildChains(all, fetched.variant)
    await upsertQueueItems(toQueueItemRows(build, catalog))
    const txRows = toTransactionRows(build, catalog)
    const { changed } = await storeTransactions(txRows)
    await setState('chain_linking', build.linkMethod)

    const review = await syncReviewItems(txRows, chainsById(build.chains), jobRows)

    // days: only a complete run may advance fetched_through
    const days: string[] = []
    for (let d = berlinDay(from); d <= berlinDay(to); d = addDays(d, 1)) days.push(d)
    if (fetched.failedFolders.length === 0) await touchDays(days, to)

    const stats = {
      folders: catalog.folders.length,
      jobs: jobRows.length,
      queueItems: all.length,
      chains: build.chains.length,
      transactions: txRows.length,
      outcomeChanged: changed,
      review,
      variant: fetched.variant,
      linkMethod: build.linkMethod,
    }
    const status = fetched.failedFolders.length ? 'partial' : 'ok'
    await finishRun(runId, status, stats, undefined, fetched.failedFolders)
    await setState(`last_${kind}_ok`, { at: new Date().toISOString(), runId })
    log.info(`run #${runId} ${status}: ${JSON.stringify(stats)}`)
    return { runId, status, stats }
  } catch (e) {
    const msg = (e as Error).message
    log.error(`run #${runId} failed: ${msg}`)
    await finishRun(runId, 'failed', {}, msg).catch(() => {})
    return { runId, status: 'failed', stats: { error: msg } }
  }
}

export async function lastVariant(): Promise<SelectVariant | null> {
  return getState<SelectVariant>('qi_select_variant')
}
