import { useEffect, useState } from 'react'
import { deDateTime, deInt } from '@vbank/shared'
import { DataTable, type Column } from '@vbank/ui'
import { useIngestRequests, useIngestRuns, useIngestState, useSettingsRow } from '../data/queries'
import { useRequestIngest, useUpdateSettings } from '../data/mutations'
import type { IngestRunRow } from '../data/types'

export function Einstellungen() {
  const settings = useSettingsRow()
  const update = useUpdateSettings()
  const runs = useIngestRuns()
  const state = useIngestState()
  const request = useRequestIngest()
  const [draft, setDraft] = useState({ hours_per_pt: '8', health_ok_min: '90', health_attention_min: '75', go_live_day: '', keyword_fallback: '' })
  const requests = useIngestRequests(true)
  const pending = (requests.data ?? []).some((r) => r.status === 'queued' || r.status === 'running')

  useEffect(() => {
    if (!settings.data) return
    setDraft({
      hours_per_pt: String(settings.data.hours_per_pt),
      health_ok_min: String(settings.data.health_ok_min),
      health_attention_min: String(settings.data.health_attention_min),
      go_live_day: settings.data.go_live_day ?? '',
      keyword_fallback: settings.data.keyword_fallback.join(', '),
    })
  }, [settings.data])

  const save = () =>
    update.mutate({
      hours_per_pt: Number(draft.hours_per_pt) || 8,
      health_ok_min: Number(draft.health_ok_min) || 90,
      health_attention_min: Number(draft.health_attention_min) || 75,
      go_live_day: draft.go_live_day || null,
      keyword_fallback: draft.keyword_fallback.split(',').map((k) => k.trim()).filter(Boolean),
    })

  const stateOf = (key: string) => state.data?.find((s) => s.key === key)
  const heartbeat = stateOf('heartbeat')?.value as { at?: string; nextRun?: string } | undefined
  const variant = stateOf('qi_select_variant')?.value as string | undefined
  const linking = stateOf('chain_linking')?.value as string | undefined
  const alive = heartbeat?.at ? Date.now() - new Date(heartbeat.at).getTime() < 5 * 60_000 : false

  const runCols: Column<IngestRunRow>[] = [
    { key: 'start', header: 'Start', sortValue: (r) => r.started_at, render: (r) => deDateTime(r.started_at) },
    { key: 'kind', header: 'Art', render: (r) => r.kind },
    { key: 'window', header: 'Zeitraum', render: (r) => <span className="dim">{r.window_from ? `${deDateTime(r.window_from)} – ${r.window_to ? deDateTime(r.window_to) : ''}` : '–'}</span> },
    { key: 'status', header: 'Status', render: (r) => <span className={`run-status ${r.status}`}>{r.status}</span> },
    {
      key: 'stats',
      header: 'Ergebnis',
      render: (r) => (
        <span className="dim" title={JSON.stringify(r.stats)}>
          {r.error ?? (r.stats.transactions !== undefined ? `${deInt(Number(r.stats.jobs ?? 0))} Läufe · ${deInt(Number(r.stats.transactions ?? 0))} Vorgänge` : '')}
        </span>
      ),
    },
  ]

  return (
    <>
      <div className="stake-section-head">
        <div>
          <span className="section-eyebrow">
            <b>Einstellungen</b>
          </span>
          <h2 className="stake-section-title">Bericht und Datenabruf</h2>
        </div>
      </div>

      <div className="grid two-col">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Statusbericht</span>
          </div>
          <div className="form-grid">
            <label className="form-field">
              <span>Stunden je Personentag</span>
              <input type="number" min={1} step={0.5} value={draft.hours_per_pt} onChange={(e) => setDraft({ ...draft, hours_per_pt: e.target.value })} />
            </label>
            <label className="form-field">
              <span>„läuft normal“ ab (% korrekt)</span>
              <input type="number" min={0} max={100} value={draft.health_ok_min} onChange={(e) => setDraft({ ...draft, health_ok_min: e.target.value })} />
            </label>
            <label className="form-field">
              <span>„benötigt Aufmerksamkeit“ ab (% korrekt)</span>
              <input type="number" min={0} max={100} value={draft.health_attention_min} onChange={(e) => setDraft({ ...draft, health_attention_min: e.target.value })} />
            </label>
            <label className="form-field">
              <span>Erster Berichtstag (Go-live)</span>
              <input type="date" value={draft.go_live_day} onChange={(e) => setDraft({ ...draft, go_live_day: e.target.value })} />
            </label>
            <label className="form-field form-wide">
              <span>Schlüsselwörter für den Notvorschlag „V-Bank IT“ (Komma-getrennt)</span>
              <textarea rows={2} value={draft.keyword_fallback} onChange={(e) => setDraft({ ...draft, keyword_fallback: e.target.value })} />
            </label>
          </div>
          {update.error ? <div className="error-banner">{(update.error as Error).message}</div> : null}
          <button className="btn-primary" onClick={save} disabled={update.isPending}>
            Speichern
          </button>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">Datenabruf</span>
            <span className={`run-status ${alive ? 'ok' : 'failed'}`}>{alive ? 'Worker aktiv' : 'Worker nicht erreichbar'}</span>
          </div>
          <div className="kv">
            <div>
              <span className="dim">Letztes Lebenszeichen</span>
              <b>{heartbeat?.at ? deDateTime(heartbeat.at) : '–'}</b>
            </div>
            <div>
              <span className="dim">Nächster planmäßiger Abruf</span>
              <b>{heartbeat?.nextRun ? deDateTime(heartbeat.nextRun) : '–'}</b>
            </div>
            <div>
              <span className="dim">Queue-Item-Spalten (Select-Variante)</span>
              <b>{variant ?? '–'}</b>
            </div>
            <div>
              <span className="dim">Verkettung der Versuche</span>
              <b>{linking === 'reference' ? 'über Referenz (Notlösung)' : linking === 'ancestor' ? 'über AncestorId' : '–'}</b>
            </div>
          </div>
          <div className="decision-actions">
            <button className="btn-primary" disabled={pending || request.isPending} onClick={() => request.mutate({ kind: 'fetch_now' })}>
              {pending ? 'Abruf angefordert…' : 'Jetzt abrufen'}
            </button>
            <button className="theme-toggle" disabled={pending || request.isPending} onClick={() => request.mutate({ kind: 'catalog' })}>
              Katalog aktualisieren
            </button>
          </div>
          {request.error ? <div className="error-banner">{(request.error as Error).message}</div> : null}
          {(requests.data ?? []).slice(0, 3).map((r) => (
            <div className="dim" key={r.id}>
              #{r.id} {r.kind} · {r.status} · {deDateTime(r.requested_at)}
              {r.error ? ` · ${r.error}` : ''}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Letzte Abrufe</span>
        </div>
        <DataTable columns={runCols} rows={runs.data ?? []} rowKey={(r) => String(r.id)} emptyText="Noch kein Abruf." initialSort={{ key: 'start', dir: 'desc' }} />
      </div>
    </>
  )
}
