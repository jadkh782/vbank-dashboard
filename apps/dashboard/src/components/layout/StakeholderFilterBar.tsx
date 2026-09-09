import { useFilters, type PresetKey } from '../../state/FilterContext'
import { toInputValue } from '../../lib/dates'
import type { OrchFolder } from '../../api/types'

const PRESETS: { key: Exclude<PresetKey, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Heute' },
  { key: '7d', label: '7 Tage' },
  { key: '30d', label: '30 Tage' },
]

export function StakeholderFilterBar({ folders }: { folders: OrchFolder[] }) {
  const f = useFilters()

  return (
    <div className="filterbar">
      <div className="filter-group">
        <span className="filter-label">Zeitraum</span>
        <div className="seg">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className={f.preset === p.key ? 'active' : undefined}
              onClick={() => f.applyPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="range-inputs">
          <input
            type="datetime-local"
            value={toInputValue(f.from)}
            max={toInputValue(f.to)}
            onChange={(e) => {
              const d = new Date(e.target.value)
              if (!isNaN(d.getTime()) && d < f.to) f.setRange(d, f.to)
            }}
            aria-label="Von"
          />
          <span>→</span>
          <input
            type="datetime-local"
            value={toInputValue(f.to)}
            min={toInputValue(f.from)}
            onChange={(e) => {
              const d = new Date(e.target.value)
              if (!isNaN(d.getTime()) && d > f.from) f.setRange(f.from, d)
            }}
            aria-label="Bis"
          />
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">Bereich</span>
        <select
          value={String(f.folderId)}
          onChange={(e) => f.setFolderId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          <option value="all">Alle Bereiche</option>
          {folders.map((fo) => (
            <option key={fo.Id} value={fo.Id}>
              {fo.DisplayName}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
