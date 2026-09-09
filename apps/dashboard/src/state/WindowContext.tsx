import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { addDays, berlinDayEnd, berlinDayStart, clampWindow } from '@vbank/shared'

export type PresetKey = '1d' | '7d' | '30d' | 'custom'

export const PRESETS: { key: Exclude<PresetKey, 'custom'>; label: string; days: number }[] = [
  { key: '1d', label: 'Letzter Tag', days: 1 },
  { key: '7d', label: 'Letzte 7 Tage', days: 7 },
  { key: '30d', label: 'Letzte 30 Tage', days: 30 },
]

export interface WindowApi {
  /** Last published day, YYYY-MM-DD — every window ends here. */
  datenstand: string
  /** Last published instant (end of the Datenstand day). */
  latest: Date
  preset: PresetKey
  from: Date
  to: Date
  /** Bereich filter: folder display name or 'all'. */
  folder: string | 'all'
  applyPreset: (p: Exclude<PresetKey, 'custom'>) => void
  setRange: (from: Date, to: Date) => void
  setFolder: (f: string | 'all') => void
}

const Ctx = createContext<WindowApi | null>(null)

/** Windows are anchored to the Datenstand, never to "now". */
export function presetRange(p: Exclude<PresetKey, 'custom'>, datenstand: string): { from: Date; to: Date } {
  const days = PRESETS.find((x) => x.key === p)!.days
  return {
    from: berlinDayStart(addDays(datenstand, -(days - 1))),
    to: new Date(berlinDayEnd(datenstand).getTime() - 1),
  }
}

export function WindowProvider({ datenstand, children }: { datenstand: string; children: ReactNode }) {
  const latest = useMemo(() => new Date(berlinDayEnd(datenstand).getTime() - 1), [datenstand])
  const initial = presetRange('7d', datenstand)
  const [preset, setPreset] = useState<PresetKey>('7d')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [folder, setFolder] = useState<string | 'all'>('all')

  const api = useMemo<WindowApi>(
    () => ({
      datenstand,
      latest,
      preset,
      from,
      to,
      folder,
      applyPreset: (p) => {
        const r = presetRange(p, datenstand)
        setPreset(p)
        setFrom(r.from)
        setTo(r.to)
      },
      setRange: (f, t) => {
        const c = clampWindow(f, t, latest)
        setPreset('custom')
        setFrom(c.from)
        setTo(c.to)
      },
      setFolder,
    }),
    [datenstand, latest, preset, from, to, folder],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useWindow(): WindowApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWindow must be used inside WindowProvider')
  return ctx
}
