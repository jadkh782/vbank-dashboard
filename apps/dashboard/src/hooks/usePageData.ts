import { useMemo } from 'react'
import { useTenantData } from './useOrchestrator'
import { useFilters } from '../state/FilterContext'
import { inWindow, previousWindow } from '../lib/aggregate'
import { DEFAULT_SETTINGS, useManualErrors, useSettings, type AppSettings, type ManualError } from '../api/store'
import type { OrchJob, OrchQueueItem } from '../api/types'

export interface PageData {
  /** Jobs in the selected window. */
  jobs: OrchJob[]
  /** Jobs in the previous equivalent window. */
  jobsPrev: OrchJob[]
  queueItems: OrchQueueItem[]
  queueItemsPrev: OrchQueueItem[]
  manualErrors: ManualError[]
  manualErrorsPrev: ManualError[]
  queueNames: Map<number, string>
}

export function usePageData() {
  const query = useTenantData()
  const manualQ = useManualErrors()
  const settingsQ = useSettings()
  const { from, to } = useFilters()

  const settings: AppSettings = settingsQ.data ?? DEFAULT_SETTINGS

  const page = useMemo<PageData | null>(() => {
    const data = query.data
    if (!data) return null
    const prev = previousWindow(from, to)
    const manual = manualQ.data ?? []
    return {
      jobs: inWindow(data.jobs, (j) => j.CreationTime, from, to),
      jobsPrev: inWindow(data.jobs, (j) => j.CreationTime, prev.from, prev.to),
      queueItems: inWindow(data.queueItems, (q) => q.CreationTime, from, to),
      queueItemsPrev: inWindow(data.queueItems, (q) => q.CreationTime, prev.from, prev.to),
      manualErrors: inWindow(manual, (m) => m.time, from, to),
      manualErrorsPrev: inWindow(manual, (m) => m.time, prev.from, prev.to),
      queueNames: new Map(data.queues.map((q) => [q.Id, q.Name])),
    }
  }, [query.data, manualQ.data, from, to])

  return { ...query, page, settings, allManualErrors: manualQ.data ?? [] }
}
