import type { Health } from '../../lib/health'

export const HEALTH_COLORS: Record<Health, string> = {
  ok: '#0ca30c',
  attention: '#c98500',
  critical: '#d03b3b',
}

export function HealthDot({ health }: { health: Health }) {
  return <span className="health-dot" style={{ background: HEALTH_COLORS[health] }} />
}
