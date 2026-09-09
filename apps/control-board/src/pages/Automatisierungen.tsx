import { useState } from 'react'
import { autoCleanName, deDateTime, deInt } from '@vbank/shared'
import { DataTable, type Column } from '@vbank/ui'
import { useAutomationRows } from '../data/queries'
import { useUpdateAutomation } from '../data/mutations'
import type { AutomationRow } from '../data/types'

/** Per process/queue: include or not, display name, description, manual minutes. */
export function Automatisierungen() {
  const q = useAutomationRows()
  const update = useUpdateAutomation()
  const [filter, setFilter] = useState<'alle' | 'neu' | 'aus'>('alle')

  const rows = (q.data ?? []).filter((a) => (filter === 'neu' ? a.is_new : filter === 'aus' ? !a.included : true))

  const TextCell = ({ row, field, placeholder, type = 'text' }: { row: AutomationRow; field: 'display_name' | 'display_description' | 'human_minutes_per_item' | 'comment'; placeholder?: string; type?: string }) => (
    <input
      type={type}
      className="cell-input"
      defaultValue={row[field] ?? ''}
      placeholder={placeholder}
      min={type === 'number' ? 0 : undefined}
      step={type === 'number' ? 0.5 : undefined}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const raw = e.target.value.trim()
        const value = type === 'number' ? (raw === '' ? null : Number(raw)) : raw || null
        if (value !== (row[field] ?? null)) update.mutate({ id: row.id, [field]: value })
      }}
    />
  )

  const columns: Column<AutomationRow>[] = [
    {
      key: 'included',
      header: 'Im Bericht',
      sortValue: (r) => (r.included ? 1 : 0),
      render: (r) => (
        <label className="toggle" title="Ausgeschaltete Automatisierungen werden nicht mehr abgerufen und nicht angezeigt. Beim Wiedereinschalten fehlt der Zeitraum dazwischen.">
          <input type="checkbox" checked={r.included} onChange={(e) => update.mutate({ id: r.id, included: e.target.checked, is_new: false })} />
          <span>{r.included ? 'ja' : 'nein'}</span>
        </label>
      ),
    },
    {
      key: 'name',
      header: 'Technischer Name',
      sortValue: (r) => r.technical_name,
      render: (r) => (
        <>
          <span className="primary">{r.technical_name}</span> {r.is_new ? <span className="badge-new">neu</span> : null}
          <div className="dim">
            {r.folder_name} · {r.kind === 'queue' ? 'Warteschlange' : 'Prozess'}
          </div>
        </>
      ),
    },
    { key: 'display', header: 'Anzeigename', render: (r) => <TextCell row={r} field="display_name" placeholder={autoCleanName(r.technical_name)} /> },
    { key: 'desc', header: 'Beschreibung (Statusbericht)', render: (r) => <TextCell row={r} field="display_description" placeholder={r.description ?? ''} /> },
    {
      key: 'human',
      header: 'Manuell Min./Vorgang',
      numeric: true,
      sortValue: (r) => r.human_minutes_per_item ?? -1,
      render: (r) => (r.kind === 'queue' ? <TextCell row={r} field="human_minutes_per_item" type="number" /> : <span className="dim">–</span>),
    },
    { key: 'comment', header: 'Kommentar (intern)', render: (r) => <TextCell row={r} field="comment" /> },
    { key: 'seen', header: 'Zuletzt gesehen', sortValue: (r) => r.last_seen, render: (r) => <span className="dim">{deDateTime(r.last_seen)}</span> },
  ]

  return (
    <>
      <div className="stake-section-head">
        <div>
          <span className="section-eyebrow">
            <b>Automatisierungen</b>
          </span>
          <h2 className="stake-section-title">Prozesse und Warteschlangen</h2>
        </div>
        <div className="stake-controls">
          <span className="card-sub">
            {deInt(rows.length)} von {deInt(q.data?.length ?? 0)} · {deInt((q.data ?? []).filter((a) => a.is_new).length)} neu · {deInt((q.data ?? []).filter((a) => !a.included).length)} ausgeschaltet
          </span>
          <div className="seg">
            {(['alle', 'neu', 'aus'] as const).map((f) => (
              <button key={f} className={filter === f ? 'active' : undefined} onClick={() => setFilter(f)}>
                {f === 'alle' ? 'Alle' : f === 'neu' ? 'Neu' : 'Ausgeschaltet'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {q.error ? <div className="error-banner">{(q.error as Error).message}</div> : null}
      {update.error ? <div className="error-banner">{(update.error as Error).message}</div> : null}
      <div className="card">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyText="Noch keine Automatisierungen — zuerst den Katalog abrufen (Einstellungen)." initialSort={{ key: 'name', dir: 'asc' }} />
        <div className="card-sub" style={{ marginTop: 8 }}>
          Änderungen werden beim Verlassen des Feldes gespeichert. Anzeigename und Beschreibung erscheinen im Statusbericht; die manuelle Bearbeitungszeit je Vorgang liefert die Zeitersparnis.
        </div>
      </div>
    </>
  )
}
