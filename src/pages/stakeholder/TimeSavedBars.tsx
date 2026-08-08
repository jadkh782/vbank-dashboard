import type { TimeSavedRow } from '../../lib/aggregate'
import type { AppSettings } from '../../api/store'
import { deHours, dePct, dePT, friendlyName } from '../../lib/health'
import { useChartTheme } from '../../theme'

/**
 * Human vs. bot processing time. Emphasis encoding rather than two categorical
 * hues: the manual baseline is muted, the automation carries the accent — the
 * comparison the reader is meant to make.
 */
export function TimeSavedBars({
  rows,
  settings,
}: {
  rows: TimeSavedRow[]
  settings: AppSettings
}) {
  const t = useChartTheme()
  const configured = rows.filter((r) => r.humanHours !== null && r.humanHours > 0)
  if (configured.length === 0) {
    return (
      <div className="state-block">
        Hinterlegen Sie in den Einstellungen die manuelle Bearbeitungszeit je Vorgang, um den
        Vergleich zu sehen.
      </div>
    )
  }

  const hoursPerPT = settings.hoursPerPT > 0 ? settings.hoursPerPT : 8
  const max = Math.max(...configured.map((r) => r.humanHours ?? 0))
  const totalHuman = configured.reduce((a, r) => a + (r.humanHours ?? 0), 0)
  const totalBot = configured.reduce((a, r) => a + r.botHours, 0)
  const totalSaved = totalHuman - totalBot

  return (
    <div className="tsb">
      <div className="tsb-summary">
        Manuelle Bearbeitung würde <b>{deHours(totalHuman)}</b> dauern — die Automatisierung
        benötigt <b>{deHours(totalBot)}</b>
        <div className="tsb-summary-saved">
          Ersparnis: <b>{deHours(totalSaved)}</b> ≙ {dePT(totalSaved / hoursPerPT)} (
          {dePct(totalHuman > 0 ? (totalSaved / totalHuman) * 100 : 0)})
        </div>
      </div>

      {configured.map((r) => {
        const human = r.humanHours ?? 0
        return (
          <div className="tsb-row" key={r.queue}>
            <div className="tsb-name">{friendlyName(r.queue, settings)}</div>
            <div className="tsb-bars">
              <div className="tsb-bar-line">
                <span className="tsb-bar-label">Manuell</span>
                <span className="tsb-track">
                  <span
                    className="tsb-fill"
                    style={{ width: `${max > 0 ? (human / max) * 100 : 0}%`, background: t.axisInk }}
                  />
                </span>
                <span className="tsb-value">{deHours(human)}</span>
              </div>
              <div className="tsb-bar-line">
                <span className="tsb-bar-label">Automatisiert</span>
                <span className="tsb-track">
                  <span
                    className="tsb-fill"
                    style={{ width: `${max > 0 ? (r.botHours / max) * 100 : 0}%`, background: t.accent }}
                  />
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
