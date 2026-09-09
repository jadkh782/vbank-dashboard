import { Sparkline } from '../charts/ChartKit'
import { fmtDelta } from '../../lib/format'

export function StatTile({
  label,
  value,
  suffix,
  current,
  previous,
  compareLabel,
  upIsGood = true,
  trend,
  refetching,
}: {
  label: string
  value: string
  suffix?: string
  current?: number
  previous?: number
  compareLabel?: string
  upIsGood?: boolean
  trend?: number[]
  refetching?: boolean
}) {
  const delta =
    current !== undefined && previous !== undefined && isFinite(current) && isFinite(previous)
      ? fmtDelta(current, previous)
      : null

  const dirClass =
    delta === null || delta.direction === 'flat'
      ? 'flat'
      : (delta.direction === 'up') === upIsGood
        ? 'good'
        : 'bad'

  return (
    <div className={`card${refetching ? ' refetching' : ''}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">
        {value}
        {suffix ? <small> {suffix}</small> : null}
      </div>
      {delta ? (
        <div className="tile-delta">
          <span className={`dir ${dirClass}`}>
            {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '—'} {delta.text}
          </span>
          <span>{compareLabel ?? 'vs. prior period'}</span>
        </div>
      ) : null}
      {trend && trend.length > 1 ? <Sparkline values={trend} /> : null}
    </div>
  )
}
