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
export function OutcomeStrip({
  slices,
  title,
  correct,
}: {
  slices: OutcomeSlice[]
  title: string
  /** Slice labels that count as a correct outcome, summarised in the header. */
  correct?: string[]
}) {
  const total = slices.reduce((a, s) => a + s.value, 0)
  if (total === 0) return null

  const correctCount = correct
    ? slices.filter((s) => correct.includes(s.label)).reduce((a, s) => a + s.value, 0)
    : null

  return (
    <div className="outcome-strip">
      <div className="outcome-strip-head">
        <span className="card-title">{title}</span>
        <span className="card-sub">
          {correctCount === null
            ? `${deInt(total)} Vorgänge`
            : `${deInt(correctCount)} von ${deInt(total)} Vorgängen korrekt verarbeitet · ${dePct(
                (correctCount / total) * 100,
              )}`}
        </span>
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
