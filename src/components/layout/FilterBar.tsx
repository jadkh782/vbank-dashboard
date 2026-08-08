import { STATUS_OPTIONS, useFilters, type PresetKey } from '../../state/FilterContext'
import { toInputValue } from '../../lib/dates'
import { useChartTheme } from '../../theme'
import type { OrchFolder } from '../../api/types'

const PRESETS: { key: Exclude<PresetKey, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '24h', label: '24 h' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
]

const REFRESH_OPTIONS: { label: string; value: number | false }[] = [
  { label: 'Off', value: false },
  { label: '30 s', value: 30_000 },
  { label: '1 min', value: 60_000 },
  { label: '5 min', value: 300_000 },
]

export function FilterBar({ folders, onRefresh }: { folders: OrchFolder[]; onRefresh: () => void }) {
  const f = useFilters()
  const t = useChartTheme()

  return (
    <div className="filterbar">
      <div className="filter-group">
        <span className="filter-label">Period</span>
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
            aria-label="From date"
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
            aria-label="To date"
          />
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">Job status</span>
        {STATUS_OPTIONS.map((s) => {
          const on = f.statuses.includes(s)
          return (
            <button key={s} className={`chip ${on ? 'on' : 'off'}`} onClick={() => f.toggleStatus(s)}>
              <span className="swatch" style={{ background: t.state[s] ?? t.axisInk }} />
              {s}
            </button>
          )
        })}
      </div>

      <div className="filter-group">
        <span className="filter-label">Folder</span>
        <select
          value={String(f.folderId)}
          onChange={(e) => f.setFolderId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          <option value="all">All folders</option>
          {folders.map((fo) => (
            <option key={fo.Id} value={fo.Id}>
              {fo.FullyQualifiedName}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <span className="filter-label">Refresh</span>
        <select
          value={String(f.refreshMs)}
          onChange={(e) => f.setRefreshMs(e.target.value === 'false' ? false : Number(e.target.value))}
        >
          {REFRESH_OPTIONS.map((o) => (
            <option key={o.label} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        <button className="chip" onClick={onRefresh}>
          ⟳ Refresh now
        </button>
      </div>
    </div>
  )
}
