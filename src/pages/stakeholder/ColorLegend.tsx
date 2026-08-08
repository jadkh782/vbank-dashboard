import { useState } from 'react'
import { RESPONSIBILITY_HINTS, RESPONSIBILITY_LABELS } from '../../lib/health'
import { useResponsibilityColors } from './Responsibility'
import { HEALTH_COLORS } from './Health'

/**
 * Colour key for the whole stakeholder view.
 *
 * Two independent colour systems are in play and the legend keeps them apart:
 *  - the traffic light on process cards and timeline strips (how is it running)
 *  - outcome / responsibility (what happened and who owns it)
 * Both use amber, so each is always shown with its word — the legend states
 * which system a colour belongs to rather than implying one global meaning.
 */
export function ColorLegend({
  outcomeColors,
}: {
  outcomeColors: {
    erfolgreich: string
    aussteuerung: string
    nichtErfolgreich: string
    prozessfehler: string
  }
}) {
  const resp = useResponsibilityColors()
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
              <div className="legend-group-title">Status eines Prozesses</div>
              <div className="legend-entry">
                <span className="dot" style={{ background: HEALTH_COLORS.ok }} />
                <span>
                  <b>läuft normal</b>
                  <div className="dim">arbeitet wie erwartet</div>
                </span>
              </div>
              <div className="legend-entry">
                <span className="dot" style={{ background: HEALTH_COLORS.attention }} />
                <span>
                  <b>benötigt Aufmerksamkeit</b>
                  <div className="dim">läuft, aber mit auffälligen Fehlern</div>
                </span>
              </div>
              <div className="legend-entry">
                <span className="dot" style={{ background: HEALTH_COLORS.critical }} />
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
                <span className="dot" style={{ background: outcomeColors.erfolgreich }} />
                <span>
                  <b>Erfolgreich</b>
                  <div className="dim">vollständig automatisch bearbeitet</div>
                </span>
              </div>
              <div className="legend-entry">
                <span className="dot" style={{ background: outcomeColors.aussteuerung }} />
                <span>
                  <b>Korrekt erkannte Aussteuerung</b>
                  <div className="dim">kein Fehler — bewusst zur manuellen Prüfung gegeben</div>
                </span>
              </div>
              <div className="legend-entry">
                <span className="dot" style={{ background: outcomeColors.nichtErfolgreich }} />
                <span>
                  <b>Nicht erfolgreich</b>
                  <div className="dim">an einem Fremdsystem oder der Infrastruktur gescheitert</div>
                </span>
              </div>
              <div className="legend-entry">
                <span className="dot" style={{ background: outcomeColors.prozessfehler }} />
                <span>
                  <b>Prozessfehler</b>
                  <div className="dim">die Automatisierung selbst ist gescheitert</div>
                </span>
              </div>
            </div>

            <div className="legend-group">
              <div className="legend-group-title">Zuständigkeit</div>
              {(['it', 'automation', 'business'] as const).map((r) => (
                <div className="legend-entry" key={r}>
                  <span className="dot" style={{ background: resp[r] }} />
                  <span>
                    <b>{RESPONSIBILITY_LABELS[r]}</b>
                    <div className="dim">{RESPONSIBILITY_HINTS[r]}</div>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="legend-note">
            Ergebnis und Zuständigkeit teilen sich bewusst dieselben Farben: <b>gelb</b> steht
            durchgehend für die Infrastruktur der V-Bank, <b>violett</b> für die Automatisierung
            von Exelentic und <b>blau</b> für Vorgänge beim Fachbereich. Die Ampelfarben auf den
            Prozesskarten sind davon unabhängig und stehen immer neben ihrem Wort.
          </div>
        </>
      ) : null}
    </div>
  )
}
