import type { Health } from '@vbank/shared'
import { useChartTheme } from './theme'

export function HealthDot({ health }: { health: Health }) {
  const t = useChartTheme()
  return <span className="health-dot" style={{ background: t.health[health] }} />
}
