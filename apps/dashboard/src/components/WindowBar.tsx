import { berlinDayEnd, berlinDayStart, toDateInputValue } from '@vbank/shared'
import { PRESETS, useWindow } from '../state/WindowContext'

export function WindowBar({ folders }: { folders: string[] }) {
  const w = useWindow()
  const max = w.datenstand

  return (
    <div className="filterbar">
      <div className="filter-group">
        <span className="filter-label">Zeitraum</span>
        <div className="seg">
          {PRESETS.map((p) => (
            <button key={p.key} className={w.preset === p.key ? 'active' : undefined} onClick={() => w.applyPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="range-inputs">
          <input
            type="date"
            value={toDateInputValue(w.from)}
            max={toDateInputValue(w.to)}
            onChange={(e) => {
              if (!e.target.value) return
              const d = berlinDayStart(e.target.value)
              if (d < w.to) w.setRange(d, w.to)
            }}
            aria-label="Von"
          />
          <span>→</span>
          <input
            type="date"
            value={toDateInputValue(w.to)}
            min={toDateInputValue(w.from)}
            max={max}
            onChange={(e) => {
              if (!e.target.value) return
              const d = new Date(berlinDayEnd(e.target.value).getTime() - 1)
              if (d > w.from) w.setRange(w.from, d)
            }}
            aria-label="Bis"
          />
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">Bereich</span>
        <select value={w.folder} onChange={(e) => w.setFolder(e.target.value === 'all' ? 'all' : e.target.value)}>
          <option value="all">Alle Bereiche</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
