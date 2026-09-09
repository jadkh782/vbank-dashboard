import { useMemo, useState, type ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  /** Shorter header shown on phones (see `.lbl-short` in global.css). */
  shortHeader?: string
  numeric?: boolean
  sortValue?: (row: T) => number | string
  render: (row: T) => ReactNode
}

export function DataTable<T>({
  columns,
  rows,
  initialSort,
  maxRows,
  emptyText = 'Keine Einträge im gewählten Zeitraum.',
  onRowClick,
  rowKey,
}: {
  columns: Column<T>[]
  rows: T[]
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  maxRows?: number
  emptyText?: string
  /** Makes rows interactive (click, Enter/Space, keyboard focusable). */
  onRowClick?: (row: T) => void
  /** Stable id per row, used so focus can be restored after a re-render. */
  rowKey?: (row: T) => string
}) {
  const [sort, setSort] = useState(initialSort ?? null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    const sv = col.sortValue
    return [...rows].sort((a, b) => {
      const va = sv(a)
      const vb = sv(b)
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? (isNaN(va) ? -Infinity : va) - (isNaN(vb) ? -Infinity : vb)
          : String(va).localeCompare(String(vb))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort, columns])

  const visible = maxRows ? sorted.slice(0, maxRows) : sorted

  if (rows.length === 0) {
    return <div className="state-block">{emptyText}</div>
  }

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                data-col={c.key}
                className={c.numeric ? 'num' : undefined}
                onClick={() =>
                  c.sortValue &&
                  setSort((prev) =>
                    prev?.key === c.key
                      ? { key: c.key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
                      : { key: c.key, dir: 'desc' },
                  )
                }
              >
                {c.shortHeader ? (
                  <>
                    <span className="lbl-long">{c.header}</span>
                    <span className="lbl-short">{c.shortHeader}</span>
                  </>
                ) : (
                  c.header
                )}
                {sort?.key === c.key ? <span className="sort-mark">{sort.dir === 'desc' ? '▼' : '▲'}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr
              key={rowKey ? rowKey(row) : i}
              className={onRowClick ? 'row-clickable' : undefined}
              data-card-key={rowKey ? rowKey(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'button' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined
              }
            >
              {columns.map((c) => (
                <td key={c.key} data-col={c.key} className={c.numeric ? 'num' : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {maxRows && sorted.length > maxRows ? (
        <div className="card-sub" style={{ marginTop: 8 }}>
          {maxRows} von {sorted.length.toLocaleString('de-DE')} Zeilen angezeigt.
        </div>
      ) : null}
    </div>
  )
}
