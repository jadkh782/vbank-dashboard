import { useMemo, useState } from 'react'
import { deDate, deDateTime, deInt, familyKey, normalizeMessage, type Category, type ErrorKind } from '@vbank/shared'
import { CategoryBadge, DataTable, type Column } from '@vbank/ui'
import { CategorySelect } from '../components/Badges'
import { displayNameOf, useAutomationRows, useMappingFamilies, useMappingMessages } from '../data/queries'
import { useOpenFamilies, type OpenFamily } from '../data/openFamilies'
import { useDeleteFamilyMapping, useRequestIngest, useUpsertFamilyMapping, useUpsertMessageMapping } from '../data/mutations'
import type { MappingFamilyRow, MappingMessageRow } from '../data/types'
import { FamilyDrawer } from './FamilyDrawer'

/** What is open in the drawer: a row of one of the three tabs. */
type Opened = { tab: 'offen'; row: OpenFamily } | { tab: 'familien'; row: MappingFamilyRow } | { tab: 'meldungen'; row: MappingMessageRow }

const KIND_LABELS: Record<ErrorKind, string> = { job: 'Prozessabbruch', app: 'Systemausnahme', biz: 'Business Exception' }

const mixed = (counts: Record<string, number>) => Object.values(counts).filter((n) => n > 0).length > 1

type Tab = 'offen' | 'familien' | 'meldungen'

/** The learned mapping: which message / family means which category — and what still needs one. */
export function Fehlerkatalog() {
  const [tab, setTab] = useState<Tab>('offen')
  const [search, setSearch] = useState('')
  const families = useMappingFamilies()
  const messages = useMappingMessages()
  const automations = useAutomationRows()
  const open = useOpenFamilies(families.data)
  const upsertFamily = useUpsertFamilyMapping()
  const deleteFamily = useDeleteFamilyMapping()
  const upsertMessage = useUpsertMessageMapping()
  const request = useRequestIngest()
  // Assignments made since the last "Vorschläge aktualisieren": one request covers them all.
  const [assigned, setAssigned] = useState(0)
  const [requested, setRequested] = useState(false)
  const [opened, setOpened] = useState<Opened | null>(null)

  // new mapping form
  const [raw, setRaw] = useState('')
  const [kind, setKind] = useState<ErrorKind>('app')
  const [cat, setCat] = useState<Category | null>(null)
  const norm = raw.trim() ? normalizeMessage(raw.trim()) : ''
  const key = norm ? familyKey(norm, kind) : ''

  const s = search.trim().toLowerCase()
  const openRows = useMemo(() => (open.data ?? []).filter((r) => !s || r.family_key.includes(s) || r.example.toLowerCase().includes(s)), [open.data, s])
  const famRows = useMemo(() => (families.data ?? []).filter((r) => !s || r.family_key.includes(s)), [families.data, s])
  const msgRows = useMemo(() => (messages.data ?? []).filter((r) => !s || r.message_norm.toLowerCase().includes(s)), [messages.data, s])
  const nameOf = (id: string) => displayNameOf(automations.data?.find((a) => a.id === id))

  const assign = (r: OpenFamily, c: Category) => {
    upsertFamily.mutate({ kind: r.kind, family_key: r.family_key, category: c })
    upsertMessage.mutate({ kind: r.kind, message_norm: r.example, category: c })
    setAssigned((n) => n + 1)
    setRequested(false)
  }
  const openItemCount = (open.data ?? []).reduce((a, r) => a + r.count, 0)

  const openCols: Column<OpenFamily>[] = [
    { key: 'n', header: 'Fälle', numeric: true, sortValue: (r) => r.count, render: (r) => <b>{deInt(r.count)}</b> },
    { key: 'kind', header: 'Art', sortValue: (r) => r.kind, render: (r) => <span className="dim">{KIND_LABELS[r.kind]}</span> },
    {
      key: 'msg',
      header: 'Ursache (normalisiert)',
      render: (r) => (
        <>
          <span className="msg" title={r.example}>
            {r.example}
          </span>
          <div className="dim family-key" title={r.family_key}>
            Familie: {r.family_key}
          </div>
        </>
      ),
    },
    {
      key: 'auto',
      header: 'Automatisierungen',
      sortValue: (r) => r.automations.length,
      render: (r) => (
        <span className="dim" title={r.automations.map(nameOf).join(', ')}>
          {r.automations.length === 1 ? nameOf(r.automations[0]) : `${deInt(r.automations.length)} verschiedene`}
        </span>
      ),
    },
    { key: 'last', header: 'Zuletzt', sortValue: (r) => r.lastDay, render: (r) => <span className="dim">{deDate(r.lastDay)}</span> },
    {
      key: 'cat',
      header: 'Kategorie',
      render: (r) => (
        <span className="suggestion" onClick={(e) => e.stopPropagation()}>
          <CategorySelect value={null} onChange={(c) => assign(r, c)} />
        </span>
      ),
    },
  ]

  const famCols: Column<MappingFamilyRow>[] = [
    { key: 'kind', header: 'Art', sortValue: (r) => r.kind, render: (r) => <span className="dim">{KIND_LABELS[r.kind]}</span> },
    { key: 'key', header: 'Muster (Familie)', render: (r) => <span className="msg" title={r.family_key}>{r.family_key}</span> },
    {
      key: 'cat',
      header: 'Kategorie',
      render: (r) => (
        <span className="suggestion" onClick={(e) => e.stopPropagation()}>
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
        <button
          className="linklike"
          onClick={(e) => {
            e.stopPropagation()
            if (confirm('Zuordnung löschen? Künftige Fälle dieser Familie bekommen dann keinen Vorschlag mehr.')) deleteFamily.mutate({ kind: r.kind, family_key: r.family_key })
          }}
        >
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
        <span className="suggestion" onClick={(e) => e.stopPropagation()}>
          <CategorySelect value={r.category} onChange={(c) => upsertMessage.mutate({ kind: r.kind, message_norm: r.message_norm, category: c })} />
          {mixed(r.category_counts) ? <span className="conf conf-niedrig">uneinheitlich</span> : null}
        </span>
      ),
    },
    { key: 'src', header: 'Quelle', render: (r) => <span className="dim">{r.source === 'workbook' ? 'Arbeitsmappe' : 'Entscheidung'}</span> },
    { key: 'n', header: 'Entscheidungen', numeric: true, sortValue: (r) => r.decided_count, render: (r) => deInt(r.decided_count) },
  ]

  const error = (open.error ?? families.error ?? upsertFamily.error ?? upsertMessage.error ?? request.error) as Error | null | undefined

  return (
    <>
      <div className="stake-section-head">
        <div>
          <span className="section-eyebrow">
            <b>Fehlerkatalog</b>
          </span>
          <h2 className="stake-section-title">{tab === 'offen' ? 'Ursachen ohne Zuordnung' : 'Gelernte Zuordnungen'}</h2>
        </div>
        <div className="stake-controls">
          <input className="search" placeholder="Suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="seg">
            <button className={tab === 'offen' ? 'active' : undefined} onClick={() => setTab('offen')}>
              Ohne Zuordnung ({deInt(open.data?.length ?? 0)})
            </button>
            <button className={tab === 'familien' ? 'active' : undefined} onClick={() => setTab('familien')}>
              Familien ({deInt(families.data?.length ?? 0)})
            </button>
            <button className={tab === 'meldungen' ? 'active' : undefined} onClick={() => setTab('meldungen')}>
              Meldungen ({deInt(messages.data?.length ?? 0)})
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="error-banner">{error.message}</div> : null}

      {assigned > 0 ? (
        <div className="notice catalog-notice">
          <span>
            <b>{deInt(assigned)}</b> neue {assigned === 1 ? 'Zuordnung' : 'Zuordnungen'} gespeichert. Die offenen Punkte bekommen den Vorschlag erst, wenn der Worker sie neu
            berechnet.
          </span>
          <button className="btn-primary" disabled={request.isPending || requested} onClick={() => request.mutateAsync({ kind: 'resuggest' }).then(() => setRequested(true))}>
            {requested ? 'Angefordert — läuft im Hintergrund' : 'Vorschläge jetzt aktualisieren'}
          </button>
        </div>
      ) : null}

      <div className="card">
        {tab === 'offen' ? (
          <>
            <DataTable
              columns={openCols}
              rows={openRows}
              rowKey={(r) => `${r.kind}::${r.family_key}`}
              onRowClick={(r) => setOpened({ tab: 'offen', row: r })}
              emptyText={open.isLoading ? 'Lade offene Punkte…' : 'Jede Ursache der offenen Punkte ist im Katalog zugeordnet.'}
              initialSort={{ key: 'n', dir: 'desc' }}
              maxRows={300}
            />
            <div className="card-sub" style={{ marginTop: 8 }}>
              {deInt(openItemCount)} offene Punkte in {deInt(open.data?.length ?? 0)} Ursachen. Eine Kategorie wählen legt die Familie und die Meldung im Katalog an; Prozessabbrüche zeigen die
              Ursache aus dem Roboter-Protokoll.
            </div>
          </>
        ) : tab === 'familien' ? (
          <DataTable
            columns={famCols}
            rows={famRows}
            rowKey={(r) => `${r.kind}::${r.family_key}`}
            onRowClick={(r) => setOpened({ tab: 'familien', row: r })}
            emptyText="Noch keine Familien — Arbeitsmappe importieren oder Punkte bestätigen."
            initialSort={{ key: 'n', dir: 'desc' }}
            maxRows={300}
          />
        ) : (
          <DataTable
            columns={msgCols}
            rows={msgRows}
            rowKey={(r) => `${r.kind}::${r.message_norm}`}
            onRowClick={(r) => setOpened({ tab: 'meldungen', row: r })}
            emptyText="Noch keine Meldungen."
            initialSort={{ key: 'n', dir: 'desc' }}
            maxRows={300}
          />
        )}
        <div className="card-sub" style={{ marginTop: 8 }}>
          Zeile anklicken zeigt die Fälle dahinter (Automatisierung, Zeitpunkt, Originaltext, Entscheidung) mit Sprung zum Tag.
        </div>
      </div>

      {opened?.tab === 'offen' ? (
        <FamilyDrawer
          selector={{ kind: opened.row.kind, family_key: opened.row.family_key }}
          title={opened.row.example}
          category={null}
          focusKey={`${opened.row.kind}::${opened.row.family_key}`}
          onCategory={(c) => {
            assign(opened.row, c)
            setOpened(null)
          }}
          onClose={() => setOpened(null)}
        />
      ) : opened?.tab === 'familien' ? (
        <FamilyDrawer
          selector={{ kind: opened.row.kind, family_key: opened.row.family_key }}
          title={opened.row.family_key}
          category={opened.row.category}
          source={opened.row.source}
          focusKey={`${opened.row.kind}::${opened.row.family_key}`}
          onCategory={(c) => upsertFamily.mutate({ kind: opened.row.kind, family_key: opened.row.family_key, category: c })}
          onClose={() => setOpened(null)}
        />
      ) : opened?.tab === 'meldungen' ? (
        <FamilyDrawer
          selector={{ kind: opened.row.kind, message_norm: opened.row.message_norm }}
          title={opened.row.message_norm}
          category={opened.row.category}
          source={opened.row.source}
          focusKey={`${opened.row.kind}::${opened.row.message_norm}`}
          onCategory={(c) => upsertMessage.mutate({ kind: opened.row.kind, message_norm: opened.row.message_norm, category: c })}
          onClose={() => setOpened(null)}
        />
      ) : null}

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
            setAssigned((n) => n + 1)
            setRequested(false)
            setRaw('')
          }}
        >
          Zuordnung speichern
        </button>
      </div>
    </>
  )
}
