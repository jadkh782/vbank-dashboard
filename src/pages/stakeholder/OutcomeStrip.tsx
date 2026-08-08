import { deInt, dePct } from '../../lib/health'

export interface OutcomeSlice {
  label: string
  value: number
  color: string
}

/**
 * Slim full-width distribution bar. Demoted from its own card: it sits directly
 * under the hero figures and doubles as the colour key for the trend chart
 * below it, so the same information costs one line instead of a panel.
 */
export function OutcomeStrip({ slices, title }: { slices: OutcomeSlice[]; title: string }) {
  const total = slices.reduce((a, s) => a + s.value, 0)
  if (total === 0) return null

  return (
    <div className="outcome-strip">
      <div className="outcome-strip-head">
        <span className="card-title">{title}</span>
        <span className="card-sub">{deInt(total)} Vorgänge</span>
      </div>
      <div className="outcome-bar slim">
        {slices
          .filter((s) => s.value > 0)
          .map((s) => {
            const pct = (s.value / total) * 100
            return (
              <span
                key={s.label}
                className="outcome-seg"
                style={{ width: `${pct}%`, background: s.color }}
                title={`${s.label}: ${deInt(s.value)} (${dePct(pct)})`}
              />
            )
          })}
      </div>
      <div className="outcome-strip-legend">
        {slices.map((s) => (
          <span className="outcome-strip-item" key={s.label}>
            <span className="key-rect" style={{ background: s.color }} />
            {s.label}
            <b>{deInt(s.value)}</b>
            <span className="dim">{dePct(total > 0 ? (s.value / total) * 100 : 0, 0)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
