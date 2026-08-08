import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { startOfDay } from 'date-fns'
import type { JobState } from '../api/types'

export type PresetKey = 'today' | '24h' | '7d' | '30d' | 'custom'

export const STATUS_OPTIONS: JobState[] = ['Successful', 'Faulted', 'Stopped', 'Running', 'Pending', 'Suspended']

/**
 * Stacking order for state-colored charts. Deliberate: keeps green (Successful)
 * and red (Faulted) from ever being adjacent segments — the pair is
 * indistinguishable under red-green color-vision deficiency. Validated with the
 * dataviz palette checker in both light and dark modes.
 */
export const STATE_STACK_ORDER: JobState[] = ['Successful', 'Running', 'Faulted', 'Suspended', 'Stopped', 'Pending']

export interface Filters {
  preset: PresetKey
  from: Date
  to: Date
  statuses: JobState[]
  folderId: number | 'all'
  refreshMs: number | false
}

interface FilterApi extends Filters {
  applyPreset: (p: Exclude<PresetKey, 'custom'>) => void
  setRange: (from: Date, to: Date) => void
  toggleStatus: (s: JobState) => void
  setFolderId: (id: number | 'all') => void
  setRefreshMs: (ms: number | false) => void
}

const FilterContext = createContext<FilterApi | null>(null)

export function presetRange(p: Exclude<PresetKey, 'custom'>): { from: Date; to: Date } {
  const now = new Date()
  switch (p) {
    case 'today':
      return { from: startOfDay(now), to: now }
    case '24h':
      return { from: new Date(now.getTime() - 24 * 3600_000), to: now }
    case '7d':
      return { from: new Date(now.getTime() - 7 * 24 * 3600_000), to: now }
    case '30d':
      return { from: new Date(now.getTime() - 30 * 24 * 3600_000), to: now }
  }
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const initial = presetRange('7d')
  const [preset, setPreset] = useState<PresetKey>('7d')
  const [from, setFrom] = useState<Date>(initial.from)
  const [to, setTo] = useState<Date>(initial.to)
  const [statuses, setStatuses] = useState<JobState[]>([...STATUS_OPTIONS])
  const [folderId, setFolderId] = useState<number | 'all'>('all')
  const [refreshMs, setRefreshMs] = useState<number | false>(60_000)

  // Live windows: while a preset (not a custom range) is active and auto-refresh
  // is on, roll the window forward so "to" tracks the present.
  useEffect(() => {
    if (preset === 'custom' || refreshMs === false) return
    const id = window.setInterval(() => {
      const r = presetRange(preset)
      setFrom(r.from)
      setTo(r.to)
    }, refreshMs)
    return () => window.clearInterval(id)
  }, [preset, refreshMs])

  const api = useMemo<FilterApi>(
    () => ({
      preset,
      from,
      to,
      statuses,
      folderId,
      refreshMs,
      applyPreset: (p) => {
        const r = presetRange(p)
        setPreset(p)
        setFrom(r.from)
        setTo(r.to)
      },
      setRange: (f, t) => {
        setPreset('custom')
        setFrom(f)
        setTo(t)
      },
      toggleStatus: (s) =>
        setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])),
      setFolderId,
      setRefreshMs,
    }),
    [preset, from, to, statuses, folderId, refreshMs],
  )

  return <FilterContext.Provider value={api}>{children}</FilterContext.Provider>
}

export function useFilters(): FilterApi {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilters must be used inside FilterProvider')
  return ctx
}
