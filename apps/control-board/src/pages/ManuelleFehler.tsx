import { useState, type FormEvent } from 'react'
import { addDays, berlinDay, CATEGORY_LABELS_DE, deDateTime, deInt, todayBerlin, type Category } from '@vbank/shared'
import { CategoryBadge, DataTable, type Column } from '@vbank/ui'
import { CategorySelect } from '../components/Badges'
import { displayNameOf, useAutomationRows, useManualErrors } from '../data/queries'
import { useDeleteManualError, useSaveManualError } from '../data/mutations'
import type { ManualErrorRow } from '../data/types'

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** IT incidents that Orchestrator cannot see. They join the day they happened on. */
export function ManuelleFehler() {
  const automations = useAutomationRows()
  const list = useManualErrors(addDays(todayBerlin(), -90))
  const save = useSaveManualError()
  const del = useDeleteManualError()
  const [when, setWhen] = useState(toLocalInput(new Date()))
  const [automationId, setAutomationId] = useState('')
  const [targetName, setTargetName] = useState('')
  const [category, setCategory] = useState<Category | null>('vbank_it')
  const [description, setDescription] = useState('')
  const [downtime, setDowntime] = useState('')
  const [reportedBy, setReportedBy] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!category || !description.trim()) return
    const occurred = new Date(when)
    const a = automations.data?.find((x) => x.id === automationId)
    setError(null)
    try {
      await save.mutateAsync({
        business_day: berlinDay(occurred),
        occurred_at: occurred.toISOString(),
        category,
        automation_id: a?.id ?? null,
        target_name: a ? displayNameOf(a) : targetName.trim() || 'Allgemein',
        description: description.trim(),
        downtime_minutes: downtime ? Number(downtime) : null,
        reported_by: reportedBy.trim() || null,
      })
      setDescription('')
      setDowntime('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const nameOf = (id: string | null) => displayNameOf(automations.data?.find((a) => a.id === id))
  const columns: Column<ManualErrorRow>[] = [
    { key: 'when', header: 'Zeitpunkt', sortValue: (r) => r.occurred_at, render: (r) => deDateTime(r.occurred_at) },
    { key: 'target', header: 'Automatisierung', render: (r) => (r.automation_id ? nameOf(r.automation_id) : r.target_name) },
    { key: 'cat', header: 'Kategorie', render: (r) => <CategoryBadge category={r.category} /> },
    { key: 'desc', header: 'Beschreibung', render: (r) => r.description },
    { key: 'down', header: 'Ausfall (Min.)', numeric: true, render: (r) => (r.downtime_minutes !== null ? deInt(r.downtime_minutes) : '–') },
    { key: 'by', header: 'Gemeldet von', render: (r) => <span className="dim">{r.reported_by ?? '–'}</span> },
    {
      key: 'del',
      header: '',
      render: (r) => (
        <button className="linklike" onClick={(e) => { e.stopPropagation(); if (confirm('Eintrag löschen?')) del.mutate(r.id) }}>
          löschen
        </button>
      ),
    },
  ]

  return (
    <>
      <div className="stake-section-head">
        <div>
          <span className="section-eyebrow">
            <b>Manuelle Fehler</b>
          </span>
          <h2 className="stake-section-title">IT-Störungen erfassen</h2>
        </div>
      </div>
      <div className="grid two-col">
        <form className="card" onSubmit={submit}>
          <div className="card-head">
            <span className="card-title">Neuer Eintrag</span>
          </div>
          <div className="form-grid">
            <label className="form-field">
              <span>Zeitpunkt</span>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
            </label>
            <label className="form-field">
              <span>Automatisierung</span>
              <select value={automationId} onChange={(e) => setAutomationId(e.target.value)}>
                <option value="">— frei benennen —</option>
                {(automations.data ?? [])
                  .filter((a) => a.included)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.folder_name} · {displayNameOf(a)}
                    </option>
                  ))}
              </select>
            </label>
            {!automationId ? (
              <label className="form-field">
                <span>Bezeichnung</span>
                <input value={targetName} onChange={(e) => setTargetName(e.target.value)} placeholder="z. B. Citrix-Farm" />
              </label>
            ) : null}
            <label className="form-field">
              <span>Kategorie</span>
              <CategorySelect value={category} onChange={setCategory} />
            </label>
            <label className="form-field form-wide">
              <span>Beschreibung</span>
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} required />
            </label>
            <label className="form-field">
              <span>Ausfallzeit (Minuten)</span>
              <input type="number" min={0} value={downtime} onChange={(e) => setDowntime(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Gemeldet von</span>
              <input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} />
            </label>
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
          <button className="btn-primary" type="submit" disabled={save.isPending}>
            Speichern
          </button>
          <div className="card-sub" style={{ marginTop: 8 }}>
            Der Eintrag gehört zum Tag des Zeitpunkts und wird mit ihm veröffentlicht. Ein bereits veröffentlichter Tag muss zuerst zurückgenommen werden.
            {category ? ` Kategorie: ${CATEGORY_LABELS_DE[category]}.` : ''}
          </div>
        </form>
        <div className="card">
          <div className="card-head">
            <span className="card-title">Letzte 90 Tage</span>
            <span className="card-sub">{deInt(list.data?.length ?? 0)} Einträge</span>
          </div>
          <DataTable columns={columns} rows={list.data ?? []} rowKey={(r) => r.id} emptyText="Keine manuellen Einträge." initialSort={{ key: 'when', dir: 'desc' }} />
        </div>
      </div>
    </>
  )
}
