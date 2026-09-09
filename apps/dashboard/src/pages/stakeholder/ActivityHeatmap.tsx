import { Fragment } from 'react'
import type { ActivityMatrix } from '../../lib/aggregate'
import { WEEKDAYS_DE } from '../../lib/aggregate'
import { deInt } from '../../lib/health'
import { useThemeMode } from '../../theme'

// Single-hue sequential ramp (dataviz reference blue). Light mode runs
// light -> dark; dark mode runs dark -> bright so magnitude always reads as
// "further from the surface".
const RAMP_LIGHT = ['#cde2fb', '#9ec5f4', '#6da7ec', '#2a78d6', '#184f95']
const RAMP_DARK = ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4']

export function ActivityHeatmap({ matrix }: { matrix: ActivityMatrix }) {
  const { mode } = useThemeMode()
  const ramp = mode === 'dark' ? RAMP_DARK : RAMP_LIGHT

  if (matrix.total === 0) {
    return <div className="state-block">Keine Aktivität im gewählten Zeitraum.</div>
  }

  const colorFor = (count: number): string => {
    if (count === 0) return 'var(--grid)'
    const step = Math.min(ramp.length - 1, Math.floor((count / matrix.max) * ramp.length))
    return ramp[step]
  }

  return (
    <div className="heatmap">
      <div className="heatmap-grid">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span className="heatmap-hour" key={h}>
            {h % 3 === 0 ? h : ''}
          </span>
        ))}
        {matrix.counts.map((row, wd) => (
          <Fragment key={wd}>
            <span className="heatmap-day">{WEEKDAYS_DE[wd]}</span>
            {row.map((count, h) => (
              <span
                className="heatmap-cell"
                key={h}
                style={{ background: colorFor(count) }}
                title={`${WEEKDAYS_DE[wd]}, ${String(h).padStart(2, '0')}:00 Uhr — ${deInt(count)} Vorgänge`}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <div className="heatmap-legend">
        <span className="dim">wenig</span>
        {ramp.map((c) => (
          <span className="heatmap-swatch" key={c} style={{ background: c }} />
        ))}
        <span className="dim">viel</span>
        <span className="heatmap-legend-max">max. {deInt(matrix.max)} Vorgänge / Stunde</span>
      </div>
    </div>
  )
}
