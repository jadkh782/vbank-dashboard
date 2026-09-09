import { useRef, useState } from 'react'
import { usePageData } from '../hooks/usePageData'
import { useTenantData } from '../hooks/useOrchestrator'
import {
  MANUAL_ERROR_CATEGORIES,
  storageMode,
  useDeleteManualError,
  useSaveManualError,
  type ManualError,
  type ManualErrorCategory,
} from '../api/store'
import { DataTable, type Column } from '../components/ui/DataTable'
import { toInputValue } from '../lib/dates'
import { fmtDateTime, fmtInt } from '../lib/format'

interface FormState {
  id: string | null
  time: string // datetime-local value
  category: ManualErrorCategory
  process: string
  folder: string
  description: string
  downtimeMinutes: string
  reportedBy: string
}

function emptyForm(): FormState {
  return {
    id: null,
    time: toInputValue(new Date()),
    category: 'Server / Infrastructure',
    process: '',
    folder: '',
    description: '',
    downtimeMinutes: '',
    reportedBy: '',
  }
}

export function ManualErrors() {
  const { page, allManualErrors } = usePageData()
  const { data } = useTenantData()
  const save = useSaveManualError()
  const del = useDeleteManualError()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showAll, setShowAll] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  const processOptions = data
    ? [...new Set([...data.queues.map((q) => q.Name), ...data.jobs.map((j) => j.ReleaseName)])].sort()
    : []
  const folderOptions = data ? data.folders.map((f) => f.DisplayName) : []

  const canSubmit = form.process.trim() !== '' && form.description.trim() !== '' && form.time !== ''

  const submit = () => {
    if (!canSubmit) return
    const entry: ManualError = {
      id: form.id ?? crypto.randomUUID(),
      time: new Date(form.time).toISOString(),
      category: form.category,
      process: form.process.trim(),
      folder: form.folder.trim() || undefined,
      description: form.description.trim(),
      downtimeMinutes: form.downtimeMinutes !== '' ? Number(form.downtimeMinutes) : undefined,
      reportedBy: form.reportedBy.trim() || undefined,
      createdAt: new Date().toISOString(),
    }
    save.mutate(entry, { onSuccess: () => setForm(emptyForm()) })
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(allManualErrors, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vbank-manual-errors-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = (file: File) => {
    void file.text().then((text) => {
      try {
        const list = JSON.parse(text) as ManualError[]
        if (!Array.isArray(list)) throw new Error('not an array')
        for (const e of list) {
          if (e.id && e.time && e.process && e.description) save.mutate({ ...e })
        }
      } catch {
        window.alert('Import failed: the file is not a valid manual-errors JSON export.')
      }
    })
  }

  const entries = showAll ? allManualErrors : page?.manualErrors ?? []

  const cols: Column<ManualError>[] = [
    {
      key: 'time',
      header: 'Occurred',
      numeric: true,
      sortValue: (r) => r.time,
      render: (r) => <span className="dim">{fmtDateTime(r.time)}</span>,
    },
    { key: 'category', header: 'Category', sortValue: (r) => r.category, render: (r) => <span className="badge">{r.category}</span> },
    {
      key: 'process',
      header: 'Process / Queue',
      sortValue: (r) => r.process,
      render: (r) => (
        <>
          <span className="primary">{r.process}</span>
          {r.folder ? <div className="dim">{r.folder}</div> : null}
        </>
      ),
    },
    {
      key: 'desc',
      header: 'Description',
      sortValue: (r) => r.description,
      render: (r) => <span style={{ overflowWrap: 'anywhere' }}>{r.description}</span>,
    },
    {
      key: 'downtime',
      header: 'Downtime',
      numeric: true,
      sortValue: (r) => r.downtimeMinutes ?? -1,
      render: (r) => (r.downtimeMinutes !== undefined ? `${fmtInt(r.downtimeMinutes)} min` : '–'),
    },
    { key: 'by', header: 'Reported by', sortValue: (r) => r.reportedBy ?? '', render: (r) => r.reportedBy ?? '–' },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <button
            className="chip"
            onClick={() =>
              setForm({
                id: r.id,
                time: toInputValue(new Date(r.time)),
                category: r.category,
                process: r.process,
                folder: r.folder ?? '',
                description: r.description,
                downtimeMinutes: r.downtimeMinutes !== undefined ? String(r.downtimeMinutes) : '',
                reportedBy: r.reportedBy ?? '',
              })
            }
          >
            Edit
          </button>
          <button
            className="chip"
            onClick={() => {
              if (window.confirm(`Delete this entry for "${r.process}"?`)) del.mutate(r.id)
            }}
          >
            Delete
          </button>
        </span>
      ),
    },
  ]

  return (
    <>
      {storageMode === 'local' ? (
        <div className="notice">
          Entries are currently stored in this browser only. To share them with the whole team, set up the
          free Supabase backend — see <code>.env.example</code> and <code>supabase/schema.sql</code>.
        </div>
      ) : null}

      <div className="grid main-side">
        <div className="card">
          <div className="card-head">
            <span className="card-title">{form.id ? 'Edit entry' : 'Record an IT / infrastructure error'}</span>
            <span className="card-sub">flows into Errors &amp; Alerts, Overview and Kennzahlen</span>
          </div>
          <div className="form-grid">
            <label>
              Occurred at
              <input
                type="datetime-local"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </label>
            <label>
              Category
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ManualErrorCategory })}
              >
                {MANUAL_ERROR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Affected process / queue
              <input
                list="process-options"
                value={form.process}
                placeholder="e.g. ÜExtern"
                onChange={(e) => setForm({ ...form, process: e.target.value })}
              />
              <datalist id="process-options">
                {processOptions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label>
              Folder (optional)
              <input
                list="folder-options"
                value={form.folder}
                onChange={(e) => setForm({ ...form, folder: e.target.value })}
              />
              <datalist id="folder-options">
                {folderOptions.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </label>
            <label className="form-wide">
              Description
              <textarea
                rows={3}
                value={form.description}
                placeholder="What happened — e.g. VBK-RPA-02 lost connection to the terminal server"
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <label>
              Downtime (minutes, optional)
              <input
                type="number"
                min={0}
                value={form.downtimeMinutes}
                onChange={(e) => setForm({ ...form, downtimeMinutes: e.target.value })}
              />
            </label>
            <label>
              Reported by (optional)
              <input value={form.reportedBy} onChange={(e) => setForm({ ...form, reportedBy: e.target.value })} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn-primary" disabled={!canSubmit || save.isPending} onClick={submit}>
              {form.id ? 'Save changes' : 'Add entry'}
            </button>
            {form.id ? (
              <button className="chip" onClick={() => setForm(emptyForm())}>
                Cancel edit
              </button>
            ) : null}
          </div>
          {save.error ? <div className="error-banner">Saving failed: {(save.error as Error).message}</div> : null}
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">How entries are used</span>
          </div>
          <ul className="hint-list">
            <li>Counted as their own source — “Manual (IT)” — in every error chart and ranking.</li>
            <li>Shown in the Kennzahlen scorecard in the “Manual (IT)” column, matched by process/queue name.</li>
            <li>The global time filter applies: an entry appears when its occurrence time is inside the window.</li>
            <li>Use the process picker so names match Orchestrator exactly — that links the entry to the right row.</li>
          </ul>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Entries {showAll ? '· all time' : '· selected window'}</span>
            <span style={{ display: 'inline-flex', gap: 8 }}>
              <button className="chip" onClick={() => setShowAll((s) => !s)}>
                {showAll ? 'Show selected window' : 'Show all'}
              </button>
              <button className="chip" onClick={exportJson}>
                Export JSON
              </button>
              <button className="chip" onClick={() => fileRef.current?.click()}>
                Import JSON
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) importJson(f)
                  e.target.value = ''
                }}
              />
            </span>
          </div>
          <DataTable
            columns={cols}
            rows={entries}
            initialSort={{ key: 'time', dir: 'desc' }}
            maxRows={50}
            emptyText={
              showAll ? 'No manual entries yet — record the first one above.' : 'No entries in the selected window.'
            }
          />
        </div>
      </div>
    </>
  )
}
