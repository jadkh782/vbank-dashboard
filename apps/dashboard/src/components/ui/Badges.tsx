import { useChartTheme } from '../../theme'

export function StateBadge({ kind, palette }: { kind: string; palette: 'state' | 'queueOutcome' | 'errorSource' | 'alertSeverity' }) {
  const t = useChartTheme()
  const color = t[palette][kind] ?? t.axisInk
  return (
    <span className="badge">
      <span className="dot" style={{ background: color }} />
      {kind}
    </span>
  )
}

/** Small horizontal proportion bar used inside table rows and rank lists. */
export function MiniBar({ fraction, color }: { fraction: number; color: string }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <div className="minibar">
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}
