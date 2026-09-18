import { useEffect, useState } from 'react'
import { deDateTime, deInt } from '@vbank/shared'
import { DataTable, Drawer, type Column } from '@vbank/ui'
import { useAutomationRows } from '../data/queries'
import { useUpdateAutomation } from '../data/mutations'
import type { AutomationRow } from '../data/types'

type Filter = 'alle' | 'ohne' | 'neu' | 'aus'

const DESC_MAX = 240

/**
 * Per process/queue: include or not, and what the Statusbericht shows for it.
 * The row shows the Orchestrator name as the bank knows it; a click opens the
 * editor where the one-or-two-sentence description (and an optional nicer
 * display name) is written.
 */
export function Automatisierungen() {
  const q = useAutomationRows()
  const update = useUpdateAutomation()
  const [filter, setFilter] = useState<Filter>('alle')
  const [editing, setEditing] = useState<string | null>(null)

  const all = q.data ?? []
  const rows = all.filter((a) => (filter === 'neu' ? a.is_new : filter === 'aus' ? !a.included : filter === 'ohne' ? a.included && !a.display_description?.trim() : true))
  const withoutDesc = all.filter((a) => a.included && !a.display_description?.trim()).length
  const current = editing ? all.find((a) => a.id === editing) : undefined

  const columns: Column<AutomationRow>[] = [
    {
      key: 'included',
      header: 'Im Bericht',
      sortValue: (r) => (r.included ? 1 : 0),
      render: (r) => (
        <label className="toggle" title="Ausgeschaltete Automatisierungen werden nicht mehr abgerufen und nicht angezeigt. Beim Wiedereinschalten fehlt der Zeitraum dazwischen." onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={r.included} onChange={(e) => update.mutate({ id: r.id, included: e.target.checked, is_new: false })} />
          <span>{r.included ? 'ja' : 'nein'}</span>
        </label>
      ),
    },
    {
      key: 'name',
      header: 'Name (Orchestrator)',
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
    {
      key: 'display',
      header: 'Anzeigename',
      sortValue: (r) => r.display_name ?? '',
      render: (r) => (r.display_name?.trim() ? r.display_name : <span className="dim">wie Orchestrator</span>),
    },
    {
      key: 'desc',
      header: 'Beschreibung (Statusbericht)',
      sortValue: (r) => (r.display_description?.trim() ? 1 : 0),
      render: (r) =>
        r.display_description?.trim() ? (
          <span className="desc-cell">{r.display_description}</span>
        ) : r.included ? (
          <span className="badge-missing">fehlt</span>
        ) : (
          <span className="dim">–</span>
        ),
    },
    {
      key: 'human',
      header: 'Manuell Min./Vorgang',
      numeric: true,
      sortValue: (r) => r.human_minutes_per_item ?? -1,
      render: (r) => (r.kind === 'queue' ? r.human_minutes_per_item ?? <span className="dim">–</span> : <span className="dim">–</span>),
    },
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
            {deInt(rows.length)} von {deInt(all.length)} · {deInt(withoutDesc)} ohne Beschreibung · {deInt(all.filter((a) => a.is_new).length)} neu · {deInt(all.filter((a) => !a.included).length)} ausgeschaltet
          </span>
          <div className="seg">
            {(['alle', 'ohne', 'neu', 'aus'] as const).map((f) => (
              <button key={f} className={filter === f ? 'active' : undefined} onClick={() => setFilter(f)}>
                {f === 'alle' ? 'Alle' : f === 'ohne' ? 'Ohne Beschreibung' : f === 'neu' ? 'Neu' : 'Ausgeschaltet'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {q.error ? <div className="error-banner">{(q.error as Error).message}</div> : null}
      {update.error ? <div className="error-banner">{(update.error as Error).message}</div> : null}
      <div className="card">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => setEditing(r.id)}
          emptyText={filter === 'ohne' ? 'Alle eingeschalteten Automatisierungen haben eine Beschreibung.' : 'Noch keine Automatisierungen — zuerst den Katalog abrufen (Einstellungen).'}
          initialSort={{ key: 'name', dir: 'asc' }}
        />
        <div className="card-sub" style={{ marginTop: 8 }}>
          Zeile anklicken, um Beschreibung und Anzeigename zu bearbeiten. Der Statusbericht zeigt den Orchestrator-Namen und die Orchestrator-Beschreibung, solange nichts Eigenes gesetzt ist.
        </div>
      </div>
      {current ? <AutomationEditor row={current} onClose={() => setEditing(null)} /> : null}
    </>
  )
}

function AutomationEditor({ row, onClose }: { row: AutomationRow; onClose: () => void }) {
  const update = useUpdateAutomation()
  const [displayName, setDisplayName] = useState(row.display_name ?? '')
  const [desc, setDesc] = useState(row.display_description ?? '')
  const [minutes, setMinutes] = useState(row.human_minutes_per_item?.toString() ?? '')
  const [comment, setComment] = useState(row.comment ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDisplayName(row.display_name ?? '')
    setDesc(row.display_description ?? '')
    setMinutes(row.human_minutes_per_item?.toString() ?? '')
    setComment(row.comment ?? '')
    setError(null)
    setSaved(false)
  }, [row.id, row.display_name, row.display_description, row.human_minutes_per_item, row.comment])

  const dirty =
    (displayName.trim() || null) !== (row.display_name ?? null) ||
    (desc.trim() || null) !== (row.display_description ?? null) ||
    (minutes.trim() === '' ? null : Number(minutes)) !== (row.human_minutes_per_item ?? null) ||
    (comment.trim() || null) !== (row.comment ?? null)

  const save = async () => {
    setError(null)
    try {
      await update.mutateAsync({
        id: row.id,
        display_name: displayName.trim() || null,
        display_description: desc.trim() || null,
        human_minutes_per_item: row.kind === 'queue' ? (minutes.trim() === '' ? null : Number(minutes)) : row.human_minutes_per_item,
        comment: comment.trim() || null,
        is_new: false,
      })
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void save()
  }

  return (
    <Drawer titleId="automation-editor-title" focusKey={row.id} onClose={onClose}>
      <header className="panel-head">
        <div>
          <div className="panel-kicker">
            {row.folder_name} · {row.kind === 'queue' ? 'Warteschlange' : 'Prozess'}
          </div>
          <h2 id="automation-editor-title" className="panel-title">
            {row.technical_name}
          </h2>
          <div className="panel-status">
            <span className={row.included ? 'review-status confirmed' : 'review-status info'}>{row.included ? 'im Statusbericht' : 'ausgeschaltet'}</span>
            {row.is_new ? <span className="badge-new">neu</span> : null}
          </div>
        </div>
        <button className="panel-close" onClick={onClose} aria-label="Schließen">
          ×
        </button>
      </header>

      <div className="panel-body" onKeyDown={onKey}>
        <section>
          <div className="panel-section-title">Beschreibung für den Statusbericht</div>
          <label className="form-field">
            <span>
              Kurzbeschreibung <span className="dim">· ein bis zwei Sätze, was der Roboter fachlich tut</span>
            </span>
            <textarea
              className="cell-input editor-textarea"
              rows={3}
              maxLength={DESC_MAX}
              value={desc}
              autoFocus
              placeholder="z. B. Lädt täglich die BAIS-Meldedaten herunter und legt sie im Meldewesen-Laufwerk ab."
              onChange={(e) => setDesc(e.target.value)}
            />
            <span className="dim editor-count">
              {deInt(desc.length)} / {DESC_MAX}
            </span>
          </label>
          {row.description?.trim() ? (
            desc.trim() === row.description.trim() ? (
              <div className="editor-hint">
                <span className="dim">Aus dem Orchestrator übernommen.</span> Eigener Text ersetzt ihn dauerhaft; leer lassen folgt wieder dem Orchestrator.
              </div>
            ) : (
              <div className="editor-hint">
                <span className="dim">Beschreibung im Orchestrator:</span> {row.description}
                <button className="theme-toggle" style={{ marginLeft: 8 }} onClick={() => setDesc(row.description!.slice(0, DESC_MAX))}>
                  Übernehmen
                </button>
              </div>
            )
          ) : null}
        </section>

        <section>
          <div className="panel-section-title">Name</div>
          <label className="form-field">
            <span>
              Anzeigename <span className="dim">· leer = Orchestrator-Name „{row.technical_name}“</span>
            </span>
            <input className="cell-input" value={displayName} placeholder={row.technical_name} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
        </section>

        {row.kind === 'queue' ? (
          <section>
            <div className="panel-section-title">Zeitersparnis</div>
            <label className="form-field">
              <span>
                Manuelle Bearbeitungszeit je Vorgang <span className="dim">· Minuten</span>
              </span>
              <input className="cell-input" type="number" min={0} step={0.5} value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ maxWidth: 140 }} />
            </label>
          </section>
        ) : null}

        <section>
          <div className="panel-section-title">Intern</div>
          <label className="form-field">
            <span>
              Kommentar <span className="dim">· nur im Control Board sichtbar</span>
            </span>
            <input className="cell-input" value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}
        <div className="editor-actions">
          <button className="btn-primary" disabled={!dirty || update.isPending} onClick={() => void save()}>
            {update.isPending ? 'Speichern…' : 'Speichern'}
          </button>
          <button className="theme-toggle" onClick={onClose}>
            {dirty ? 'Verwerfen' : 'Schließen'}
          </button>
          <span className="dim">{saved && !dirty ? 'Gespeichert.' : 'Strg + Enter speichert.'}</span>
        </div>
      </div>
    </Drawer>
  )
}
