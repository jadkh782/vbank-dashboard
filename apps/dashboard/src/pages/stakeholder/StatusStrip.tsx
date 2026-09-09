import type { StripCell } from '../../lib/health'
import { deDateTime, deInt, dePct } from '../../lib/health'

const STRIP_COLORS: Record<StripCell['health'], string> = {
  ok: '#0ca30c',
  attention: '#c98500',
  critical: '#d03b3b',
  idle: 'var(--grid)',
}

const STRIP_WORDS: Record<StripCell['health'], string> = {
  ok: 'ohne Auffälligkeiten',
  attention: 'auffällig',
  critical: 'gestört',
  idle: 'keine Aktivität',
}

/**
 * Status-page style timeline: one block per time bucket, coloured by that
 * block's health. Colour is never the only channel — the card carries the
 * status in words and every block has a hover/focus readout.
 */
export function StatusStrip({ cells, large }: { cells: StripCell[]; large?: boolean }) {
  if (cells.length === 0) return null
  const good = cells.filter((c) => c.health === 'ok').length
  const active = cells.filter((c) => c.health !== 'idle').length

  return (
    <div
      className={`status-strip${large ? ' large' : ''}`}
      role="img"
      aria-label={`Verlauf: ${deInt(good)} von ${deInt(active)} Zeitabschnitten mit Aktivität ohne Auffälligkeiten.`}
    >
      {cells.map((c, i) => (
        <span className="strip-block" key={i} style={{ background: STRIP_COLORS[c.health] }}>
          <span className="strip-tip">
            <b>{deDateTime(c.start)}</b>
            {c.health === 'idle' ? (
              <>keine Aktivität</>
            ) : (
              <>
                {deInt(c.total)} Vorgänge · {dePct(c.successRate)} erfolgreich
                <br />
                {STRIP_WORDS[c.health]}
              </>
            )}
          </span>
        </span>
      ))}
    </div>
  )
}
