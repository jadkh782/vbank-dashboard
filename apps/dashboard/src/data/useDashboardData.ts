import { createContext, useContext, useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { berlinDay, inWindow, previousWindow, type Automation, type DashboardSettings, type ManualErrorRow, type Run, type Txn } from '@vbank/shared'
import type { DataSource } from './source'

export const DataSourceContext = createContext<DataSource | null>(null)

export function useDataSource(): DataSource {
  const s = useContext(DataSourceContext)
  if (!s) throw new Error('DataSourceContext missing')
  return s
}

// Published data only changes when a day is published, so nothing refetches on
// its own; the footer's "Aktualisieren" invalidates.
const STATIC = { staleTime: Infinity, refetchOnWindowFocus: false, retry: 1 } as const

export function useDatenstand() {
  const src = useDataSource()
  return useQuery({ queryKey: ['datenstand', src.kind], queryFn: () => src.datenstand(), ...STATIC })
}

export function useAutomations() {
  const src = useDataSource()
  return useQuery({ queryKey: ['automations', src.kind], queryFn: () => src.automations(), ...STATIC })
}

export function useSettings() {
  const src = useDataSource()
  return useQuery({ queryKey: ['settings', src.kind], queryFn: () => src.settings(), ...STATIC })
}

export interface WindowData {
  automations: Automation[]
  settings: DashboardSettings
  runs: Run[]
  runsPrev: Run[]
  txns: Txn[]
  txnsPrev: Txn[]
  manual: ManualErrorRow[]
  manualPrev: ManualErrorRow[]
}

/**
 * Rows for the window plus the previous equivalent window (for deltas), sliced
 * by creation time exactly like the v1 dashboard did.
 */
export function useWindowData(from: Date, to: Date) {
  const src = useDataSource()
  const prev = previousWindow(from, to)
  const fromDay = berlinDay(prev.from)
  const toDay = berlinDay(to)
  const rowsQ = useQuery({
    queryKey: ['rows', src.kind, fromDay, toDay],
    queryFn: () => src.rows(fromDay, toDay),
    placeholderData: keepPreviousData,
    ...STATIC,
  })
  const automationsQ = useAutomations()
  const settingsQ = useSettings()

  const data = useMemo<WindowData | null>(() => {
    if (!rowsQ.data || !automationsQ.data || !settingsQ.data) return null
    const r = rowsQ.data
    return {
      automations: automationsQ.data,
      settings: settingsQ.data,
      runs: inWindow(r.runs, (x) => x.createdAt, from, to),
      runsPrev: inWindow(r.runs, (x) => x.createdAt, prev.from, prev.to),
      txns: inWindow(r.txns, (x) => x.createdAt, from, to),
      txnsPrev: inWindow(r.txns, (x) => x.createdAt, prev.from, prev.to),
      manual: inWindow(r.manualErrors, (x) => x.occurredAt, from, to),
      manualPrev: inWindow(r.manualErrors, (x) => x.occurredAt, prev.from, prev.to),
    }
  }, [rowsQ.data, automationsQ.data, settingsQ.data, from, to, prev.from, prev.to])

  return {
    data,
    isLoading: rowsQ.isLoading || automationsQ.isLoading || settingsQ.isLoading,
    isFetching: rowsQ.isFetching,
    error: (rowsQ.error ?? automationsQ.error ?? settingsQ.error) as Error | null,
  }
}
