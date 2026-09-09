import { deHours, dePct, dePT, type TimeSavedRow } from '@vbank/shared'
import { useChartTheme } from '@vbank/ui'

/**
 * Human vs. bot processing time. Emphasis encoding rather than two categorical
 * hues: the manual baseline is muted, the automation carries the accent — the
 * comparison the reader is meant to make.
 */
export function TimeSavedBars({ rows, hoursPerPT }: { rows: TimeSavedRow[]; hoursPerPT: number }) {
  const t = useChartTheme()
  const configured = rows.filter((r) => r.humanHours !== null && r.humanHours > 0)
  if (configured.length === 0) {
    return (
      <div className="state-block">
        Für diese Automatisierungen ist noch keine manuelle Bearbeitungszeit je Vorgang hinterlegt.
      </div>
    )
  }

  const perPT = hoursPerPT > 0 ? hoursPerPT : 8
  const max = Math.max(...configured.map((r) => r.humanHours ?? 0))
  const totalHuman = configured.reduce((a, r) => a + (r.humanHours ?? 0), 0)
  const totalBot = configured.reduce((a, r) => a + r.botHours, 0)
  const totalSaved = totalHuman - totalBot

  return (
    <div className="tsb">
      <div className="tsb-summary">
        Manuelle Bearbeitung würde <b>{deHours(totalHuman)}</b> dauern — die Automatisierung benötigt <b>{deHours(totalBot)}</b>
        <div className="tsb-summary-saved">
          Ersparnis: <b>{deHours(totalSaved)}</b> ≙ {dePT(totalSaved / perPT)} ({dePct(totalHuman > 0 ? (totalSaved / totalHuman) * 100 : 0)})
        </div>
      </div>

      {configured.map((r) => {
        const human = r.humanHours ?? 0
        return (
          <div className="tsb-row" key={r.automationId}>
            <div className="tsb-name">{r.displayName}</div>
            <div className="tsb-bars">
              <div className="tsb-bar-line">
                <span className="tsb-bar-label">Manuell</span>
                <span className="tsb-track">
                  <span className="tsb-fill" style={{ width: `${max > 0 ? (human / max) * 100 : 0}%`, background: t.axisInk }} />
                </span>
                <span className="tsb-value">{deHours(human)}</span>
              </div>
              <div className="tsb-bar-line">
                <span className="tsb-bar-label">Automatisiert</span>
                <span className="tsb-track">
                  <span className="tsb-fill" style={{ width: `${max > 0 ? (r.botHours / max) * 100 : 0}%`, background: t.accent }} />
                </span>
                <span className="tsb-value">{deHours(r.botHours)}</span>
              </div>
            </div>
            <div className="tsb-saved">−{deHours(human - r.botHours)}</div>
          </div>
        )
      })}
    </div>
  )
}
