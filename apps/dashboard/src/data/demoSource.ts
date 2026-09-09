import { addDays, berlinDayEnd, berlinDayStart, generateDemoData, todayBerlin, type DashboardData } from '@vbank/shared'
import type { DataSource, WindowRows } from './source'

// The demo covers the 90 days up to yesterday and is generated once per page
// load with a fixed seed, so every window slices the same consistent story.
const DEMO_DAYS = 90

export function demoSource(): DataSource {
  const datenstand = addDays(todayBerlin(), -1)
  let cached: DashboardData | null = null
  const data = () => {
    if (!cached) {
      const to = new Date(berlinDayEnd(datenstand).getTime() - 1)
      const from = berlinDayStart(addDays(datenstand, -(DEMO_DAYS - 1)))
      cached = generateDemoData({ from, to, seed: 20260908 })
    }
    return cached
  }
  return {
    kind: 'demo',
    datenstand: async () => datenstand,
    automations: async () => data().automations,
    settings: async () => data().settings,
    rows: async (fromDay, toDay): Promise<WindowRows> => {
      const d = data()
      const inRange = (day: string) => day >= fromDay && day <= toDay
      return {
        runs: d.runs.filter((r) => inRange(r.day)),
        txns: d.txns.filter((t) => inRange(t.day)),
        manualErrors: d.manualErrors.filter((m) => {
          const t = new Date(m.occurredAt)
          return t >= berlinDayStart(fromDay) && t < berlinDayEnd(toDay)
        }),
      }
    },
  }
}
