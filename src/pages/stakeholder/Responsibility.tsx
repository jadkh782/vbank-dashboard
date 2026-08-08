import type { Responsibility } from '../../lib/errors'
import {
  deInt,
  dePct,
  RESPONSIBILITY_COLORS,
  RESPONSIBILITY_HINTS,
  RESPONSIBILITY_LABELS,
  RESPONSIBILITY_ORDER,
} from '../../lib/health'
import { useThemeMode } from '../../theme'

export function useResponsibilityColors() {
  const { mode } = useThemeMode()
  return RESPONSIBILITY_COLORS[mode]
}

/** Colour never carries this alone — the label is always part of the badge. */
export function ResponsibilityBadge({ who }: { who: Responsibility }) {
  const colors = useResponsibilityColors()
  return (
    <span className="resp-badge">
      <span className="dot" style={{ background: colors[who] }} />
      {RESPONSIBILITY_LABELS[who]}
    </span>
  )
}

/**
 * "Wer muss handeln" — splits every issue in the window by who owns the fix.
 * An unreachable server is V-Bank IT; a broken selector is Exelentic.
 */
export function ResponsibilitySplit({ counts }: { counts: Record<Responsibility, number> }) {
  const colors = useResponsibilityColors()
  const actionable = RESPONSIBILITY_ORDER.filter((r) => r !== 'business')
  const total = actionable.reduce((a, r) => a + counts[r], 0)

  if (total === 0) {
    return (
      <div className="state-block">
        Keine offenen Störungen — es besteht kein Handlungsbedarf.
      </div>
    )
  }

  return (
    <div className="resp-split">
      <div className="resp-bar">
        {actionable
          .filter((r) => counts[r] > 0)
          .map((r) => (
            <span
              key={r}
              className="resp-seg"
              style={{ width: `${(counts[r] / total) * 100}%`, background: colors[r] }}
              title={`${RESPONSIBILITY_LABELS[r]}: ${deInt(counts[r])}`}
            />
          ))}
      </div>

      {actionable.map((r) => (
        <div className="resp-row" key={r}>
          <span className="dot" style={{ background: colors[r] }} />
          <span className="grow">
            <b>{RESPONSIBILITY_LABELS[r]}</b>
            <div className="dim">{RESPONSIBILITY_HINTS[r]}</div>
          </span>
          <span className="resp-count">
            <b>{deInt(counts[r])}</b>
            <span className="dim">{dePct(total > 0 ? (counts[r] / total) * 100 : 0, 0)}</span>
          </span>
        </div>
      ))}

      <div className="resp-note">
        Zusätzlich wurden <b>{deInt(counts.business)}</b> Vorgänge korrekt ausgesteuert und liegen
        beim Fachbereich zur manuellen Bearbeitung — das ist kein Fehler.
      </div>
    </div>
  )
}
