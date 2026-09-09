import { useState } from 'react'
import { CATEGORY_HINTS_DE, CATEGORY_LABELS_DE, CATEGORY_ORDER } from '@vbank/shared'
import { useChartTheme } from '@vbank/ui'

/**
 * Colour key for the whole stakeholder view.
 *
 * Two independent colour systems are in play and the legend keeps them apart:
 *  - the traffic light on rows and timeline strips (how is it running)
 *  - outcome / category (what happened and who owns it)
 * Both use amber, so each is always shown with its word — the legend states
 * which system a colour belongs to rather than implying one global meaning.
 */
export function ColorLegend() {
  const t = useChartTheme()
  // Collapsed by default: a reference people look up, not something that
  // competes with the dashboard for attention.
  const [open, setOpen] = useState(false)

  return (
    <div className="card legend-card">
      <div className="card-head">
        <span className="card-title">Farblegende</span>
        <button className="chip" onClick={() => setOpen((o) => !o)}>
          {open ? 'Ausblenden' : 'Einblenden'}
        </button>
      </div>

      {open ? (
        <>
          <div className="legend-groups">
            <div className="legend-group">
              <div className="legend-group-title">Status einer Automatisierung</div>
              <div className="legend-entry">
                <span className="dot" style={{ background: t.health.ok }} />
                <span>
                  <b>läuft normal</b>
                  <div className="dim">arbeitet wie erwartet</div>
                </span>
              </div>
              <div className="legend-entry">
                <span className="dot" style={{ background: t.health.attention }} />
                <span>
                  <b>benötigt Aufmerksamkeit</b>
                  <div className="dim">läuft, aber mit auffälligen Fehlern</div>
                </span>
              </div>
              <div className="legend-entry">
                <span className="dot" style={{ background: t.health.critical }} />
                <span>
                  <b>gestört</b>
                  <div className="dim">viele Vorgänge scheitern</div>
                </span>
              </div>
              <div className="legend-entry">
                <span className="dot" style={{ background: 'var(--grid)' }} />
                <span>
                  <b>keine Aktivität</b>
                  <div className="dim">in diesem Zeitabschnitt lief nichts</div>
                </span>
              </div>
            </div>

            <div className="legend-group">
              <div className="legend-group-title">Ergebnis eines Vorgangs</div>
              <div className="legend-entry">
                <span className="dot" style={{ background: t.outcome.erfolgreich }} />
                <span>
                  <b>Erfolgreich</b>
                  <div className="dim">vollständig automatisch bearbeitet — auch nach einem Neustart</div>
                </span>
              </div>
              <div className="legend-entry">
                <span className="dot" style={{ background: t.outcome.aussteuerung }} />
                <span>
                  <b>Korrekt erkannte Aussteuerung</b>
                  <div className="dim">kein Fehler — bewusst zur manuellen Prüfung gegeben</div>
                </span>
              </div>
              <div className="legend-entry">
                <span className="dot" style={{ background: t.outcome.nichtErfolgreich }} />
                <span>
                  <b>Nicht erfolgreich</b>
                  <div className="dim">der Vorgang konnte nicht abgeschlossen werden</div>
                </span>
              </div>
              <div className="legend-entry">
                <span className="dot" style={{ background: t.outcome.neustart }} />
                <span>
                  <b>Neustartfähiger Vorgang</b>
                  <div className="dim">vorübergehende Systemausnahme — der Vorgang kann erneut gestartet werden</div>
                </span>
              </div>
            </div>

            <div className="legend-group">
              <div className="legend-group-title">Kategorie eines offenen Punkts</div>
              {CATEGORY_ORDER.map((c) => (
                <div className="legend-entry" key={c}>
                  <span className="dot" style={{ background: t.category[c] }} />
                  <span>
                    <b>{CATEGORY_LABELS_DE[c]}</b>
                    <div className="dim">{CATEGORY_HINTS_DE[c]}</div>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="legend-note">
            Jeder offene Punkt trägt genau eine Kategorie: <b>violett</b> steht für die Automatisierung von Exelentic und die
            UiPath-Plattform, <b>türkis</b> für das Kernbanksystem Avaloq, <b>gelb</b> für die Infrastruktur der V-Bank,{' '}
            <b>blau</b> für fachliche Klärungen im Fachbereich und <b>grau</b> für neustartfähige Vorgänge ohne Zuständigkeit.
            Die Ampelfarben der Automatisierungen sind davon unabhängig und stehen immer neben ihrem Wort.
          </div>
        </>
      ) : null}
    </div>
  )
}
