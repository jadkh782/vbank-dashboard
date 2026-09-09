import { useMemo, useState } from 'react'
import { deDateTime, deInt, familyKey, normalizeMessage, type Category, type ErrorKind } from '@vbank/shared'
import { CategoryBadge, DataTable, type Column } from '@vbank/ui'
import { CategorySelect } from '../components/Badges'
import { useMappingFamilies, useMappingMessages } from '../data/queries'
import { useDeleteFamilyMapping, useUpsertFamilyMapping, useUpsertMessageMapping } from '../data/mutations'
import type { MappingFamilyRow, MappingMessageRow } from '../data/types'

const KIND_LABELS: Record<ErrorKind, string> = { job: 'Prozessabbruch', app: 'Systemausnahme', biz: 'Business Exception' }

const mixed = (counts: Record<string, number>) => Object.values(counts).filter((n) => n > 0).length > 1

/** The learned mapping: which message / family means which category. */
export function Fehlerkatalog() {
  const [tab, setTab] = useState<'familien' | 'meldungen'>('familien')
  const [search, setSearch] = useState('')
  const families = useMappingFamilies()
  const messages = useMappingMessages()
  const upsertFamily = useUpsertFamilyMapping()
  const deleteFamily = useDeleteFamilyMapping()
  const upsertMessage = useUpsertMessageMapping()

  // new mapping form
  const [raw, setRaw] = useState('')
  const [kind, setKind] = useState<ErrorKind>('app')
  const [cat, setCat] = useState<Category | null>(null)
  const norm = raw.trim() ? normalizeMessage(raw.trim()) : ''
  const key = norm ? familyKey(norm, kind) : ''

  const s = search.trim().toLowerCase()
  const famRows = useMemo(() => (families.data ?? []).filter((r) => !s || r.family_key.includes(s)), [families.data, s])
  const msgRows = useMemo(() => (messages.data ?? []).filter((r) => !s || r.message_norm.toLowerCase().includes(s)), [messages.data, s])

  const famCols: Column<MappingFamilyRow>[] = [
    { key: 'kind', header: 'Art', sortValue: (r) => r.kind, render: (r) => <span className="dim">{KIND_LABELS[r.kind]}</span> },
    { key: 'key', header: 'Muster (Familie)', render: (r) => <span className="msg" title={r.family_key}>{r.family_key}</span> },
    {
      key: 'cat',
      header: 'Kategorie',
      render: (r) => (
        <span className="suggestion">
          <CategorySelect value={r.category} onChange={(c) => upsertFamily.mutate({ kind: r.kind, family_key: r.family_key, category: c })} />
          {mixed(r.category_counts) ? <span className="conf conf-niedrig" title={JSON.stringify(r.category_counts)}>uneinheitlich</span> : null}
        </span>
      ),
    },
    { key: 'src', header: 'Quelle', sortValue: (r) => r.source, render: (r) => <span className="dim">{r.source === 'workbook' ? 'Arbeitsmappe' : 'Entscheidung'}{r.workbook_nr ? ` · Nr. ${r.workbook_nr}` : ''}</span> },
    { key: 'n', header: 'Entscheidungen', numeric: true, sortValue: (r) => r.decided_count, render: (r) => deInt(r.decided_count) },
    { key: 'seen', header: 'Zuletzt', sortValue: (r) => r.last_seen, render: (r) => <span className="dim">{deDateTime(r.last_seen)}</span> },
    {
      key: 'del',
      header: '',
      render: (r) => (
        <button className="linklike" onClick={() => confirm('Zuordnung löschen? Künftige Fälle dieser Familie bekommen dann keinen Vorschlag mehr.') && deleteFamily.mutate({ kind: r.kind, family_key: r.family_key })}>
          löschen
        </button>
      ),
    },
  ]

  const msgCols: Column<MappingMessageRow>[] = [
    { key: 'kind', header: 'Art', sortValue: (r) => r.kind, render: (r) => <span className="dim">{KIND_LABELS[r.kind]}</span> },
    { key: 'msg', header: 'Normalisierte Meldung', render: (r) => <span className="msg" title={r.message_norm}>{r.message_norm}</span> },
    {
      key: 'cat',
      header: 'Kategorie',
      render: (r) => (
        <span className="suggestion">
          <CategorySelect value={r.category} onChange={(c) => upsertMessage.mutate({ kind: r.kind, message_norm: r.message_norm, category: c })} />
          {mixed(r.category_counts) ? <span className="conf conf-niedrig">uneinheitlich</span> : null}
        </span>
      ),
    },
    { key: 'src', header: 'Quelle', render: (r) => <span className="dim">{r.source === 'workbook' ? 'Arbeitsmappe' : 'Entscheidung'}</span> },
    { key: 'n', header: 'Entscheidungen', numeric: true, sortValue: (r) => r.decided_count, render: (r) => deInt(r.decided_count) },
  ]

  return (
    <>
      <div className="stake-section-head">
        <div>
          <span className="section-eyebrow">
            <b>Fehlerkatalog</b>
          </span>
          <h2 className="stake-section-title">Gelernte Zuordnungen</h2>
        </div>
        <div className="stake-controls">
          <input className="search" placeholder="Suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="seg">
            <button className={tab === 'familien' ? 'active' : undefined} onClick={() => setTab('familien')}>
              Familien ({deInt(families.data?.length ?? 0)})
            </button>
            <button className={tab === 'meldungen' ? 'active' : undefined} onClick={() => setTab('meldungen')}>
              Meldungen ({deInt(messages.data?.length ?? 0)})
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        {tab === 'familien' ? (
          <DataTable columns={famCols} rows={famRows} rowKey={(r) => `${r.kind}::${r.family_key}`} emptyText="Noch keine Familien — Arbeitsmappe importieren oder Punkte bestätigen." initialSort={{ key: 'n', dir: 'desc' }} maxRows={300} />
        ) : (
          <DataTable columns={msgCols} rows={msgRows} rowKey={(r) => `${r.kind}::${r.message_norm}`} emptyText="Noch keine Meldungen." initialSort={{ key: 'n', dir: 'desc' }} maxRows={300} />
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Neue Zuordnung</span>
          <span className="card-sub">eine Meldung einfügen — Muster und Familie werden live berechnet</span>
        </div>
        <div className="form-grid">
          <label className="form-field form-wide">
            <span>Fehlermeldung (Original)</span>
            <textarea rows={3} value={raw} onChange={(e) => setRaw(e.target.value)} />
          </label>
          <label className="form-field">
            <span>Art</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as ErrorKind)}>
              <option value="app">Systemausnahme (Warteschlange)</option>
              <option value="job">Prozessabbruch</option>
            </select>
          </label>
          <label className="form-field">
            <span>Kategorie</span>
            <CategorySelect value={cat} onChange={setCat} />
          </label>
        </div>
        {norm ? (
          <div className="preview">
            <div>
              <span className="dim">normalisiert:</span> {norm}
            </div>
            <div>
              <span className="dim">Familie:</span> {key}
            </div>
            {cat ? (
              <div>
                <span className="dim">wird zu:</span> <CategoryBadge category={cat} />
              </div>
            ) : null}
          </div>
        ) : null}
        <button
          className="btn-primary"
          disabled={!norm || !cat}
          onClick={() => {
            if (!cat) return
            upsertFamily.mutate({ kind, family_key: key, category: cat })
            upsertMessage.mutate({ kind, message_norm: norm, category: cat })
            setRaw('')
          }}
        >
          Zuordnung speichern
        </button>
      </div>
    </>
  )
}
