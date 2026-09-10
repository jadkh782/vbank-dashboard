import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deDate, deDateTime, deInt } from '@vbank/shared'
import { DataTable, type Column } from '@vbank/ui'
import { DayStatusBadge } from '../components/Badges'
import { useDays, useSettingsRow } from '../data/queries'
import type { DayStats } from '../data/types'

type Filter = 'alle' | 'offen' | 'veroeffentlicht'

/**
 * The review queue: the oldest unpublished day comes first, because days are
 * published in order and the dashboard's Datenstand waits for it.
 */
export function DaysList() {
  const days = useDays()
  const settings = useSettingsRow()
  const nav = useNavigate()
  const [filter, setFilter] = useState<Filter>('alle')

  if (days.error) return <div className="error-banner">Tage konnten nicht geladen werden: {(days.error as Error).message}</div>
  if (!days.data) return <div className="state-block">Lade Tage…</div>

  // Days before go-live only hold chain ancestors from before the backfill window.
  const goLive = settings.data?.go_live_day ?? '0000-00-00'
  const relevant = days.data.filter((d) => d.business_day >= goLive)
  const open = relevant.filter((d) => d.state !== 'published').sort((a, b) => a.business_day.localeCompare(b.business_day))
  const published = relevant.filter((d) => d.state === 'published')
  const rows = filter === 'offen' ? open : filter === 'veroeffentlicht' ? published : [...open, ...published]
  const next = open[0]

  const columns: Column<DayStats>[] = [
    { key: 'day', header: 'Tag', sortValue: (r) => r.business_day, render: (r) => <span className="primary">{deDate(r.business_day)}</span> },
    { key: 'state', header: 'Status', render: (r) => <DayStatusBadge state={r.state} openCount={r.open_count} stale={r.stale} /> },
    { key: 'open', header: 'Offen', numeric: true, sortValue: (r) => r.open_count, render: (r) => (r.open_count ? <b>{deInt(r.open_count)}</b> : <span className="dim">0</span>) },
    { key: 'unknown', header: 'Ohne Vorschlag', numeric: true, sortValue: (r) => r.unknown_count, render: (r) => (r.unknown_count ? deInt(r.unknown_count) : <span className="dim">0</span>) },
    { key: 'confirmed', header: 'Bestätigt', numeric: true, sortValue: (r) => r.confirmed_count, render: (r) => deInt(r.confirmed_count) },
    { key: 'info', header: 'Neustarts', numeric: true, sortValue: (r) => r.info_count, render: (r) => <span className="dim">{deInt(r.info_count)}</span> },
    { key: 'pending', header: 'In Bearbeitung', numeric: true, sortValue: (r) => r.pending_tx, render: (r) => <span className="dim">{deInt(r.pending_tx)}</span> },
    { key: 'manual', header: 'Manuell', numeric: true, sortValue: (r) => r.manual_count, render: (r) => <span className="dim">{deInt(r.manual_count)}</span> },
    {
      key: 'fetched',
      header: 'Abgerufen bis',
      render: (r) => <span className="dim">{r.fetched_through ? deDateTime(r.fetched_through) : '–'}</span>,
    },
  ]

  return (
    <>
      <div className="stake-section-head">
        <div>
          <span className="section-eyebrow">
            <b>Tagesprüfung</b>
          </span>
          <h2 className="stake-section-title">{next ? `Nächster Tag: ${deDate(next.business_day)}` : 'Alle Tage sind veröffentlicht'}</h2>
        </div>
        <div className="stake-controls">
          <span className="card-sub">{deInt(open.length)} offen · {deInt(published.length)} veröffentlicht</span>
          <div className="seg">
            {(['alle', 'offen', 'veroeffentlicht'] as Filter[]).map((f) => (
              <button key={f} className={filter === f ? 'active' : undefined} onClick={() => setFilter(f)}>
                {f === 'alle' ? 'Alle' : f === 'offen' ? 'Offen' : 'Veröffentlicht'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <DataTable columns={columns} rows={rows} emptyText="Noch keine Tage abgerufen." onRowClick={(r) => nav(`/tage/${r.business_day}`)} rowKey={(r) => r.business_day} />
        <div className="card-sub" style={{ marginTop: 8 }}>
          Tage werden in Reihenfolge veröffentlicht: erst wenn alle Punkte eines Tages bestätigt sind und alle früheren Tage veröffentlicht wurden.
        </div>
      </div>
    </>
  )
}
