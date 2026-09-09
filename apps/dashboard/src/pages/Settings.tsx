import { useEffect, useState } from 'react'
import { usePageData } from '../hooks/usePageData'
import { useTenantData } from '../hooks/useOrchestrator'
import { storageMode, useSaveSettings, type AppSettings } from '../api/store'
import { classifyAppEx } from '../lib/errors'
import { autoCleanName } from '../lib/health'

export function Settings() {
  const { page, settings } = usePageData()
  const { data } = useTenantData()
  const save = useSaveSettings()

  const [draft, setDraft] = useState<AppSettings>(settings)
  const [newKeyword, setNewKeyword] = useState('')
  const [dirty, setDirty] = useState(false)

  // Adopt freshly loaded settings until the user starts editing.
  useEffect(() => {
    if (!dirty) setDraft(settings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  const update = (patch: Partial<AppSettings>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
  }

  const queueNames = data ? [...new Set(data.queues.map((q) => q.Name))].sort() : []
  const knownNames = [...new Set([...queueNames, ...Object.keys(draft.humanMinutesPerItem)])].sort()
  const processNames = data ? [...new Set(data.jobs.map((j) => j.ReleaseName))] : []
  const displayNames = [
    ...new Set([...queueNames, ...processNames, ...Object.keys(draft.displayInfo)]),
  ].sort()

  // Live preview: how would the current window's app exceptions classify?
  const appExReasons = (page?.queueItems ?? [])
    .filter(
      (q) =>
        (q.Status === 'Failed' || q.Status === 'Retried' || q.Status === 'Abandoned') &&
        q.ProcessingExceptionType !== 'BusinessException',
    )
    .map((q) => q.ProcessingException?.Reason ?? '')
  const systemCount = appExReasons.filter((r) => classifyAppEx(r, draft.systemKeywords) === 'system').length

  const addKeyword = () => {
    const k = newKeyword.trim().toLowerCase()
    if (k && !draft.systemKeywords.includes(k)) update({ systemKeywords: [...draft.systemKeywords, k] })
    setNewKeyword('')
  }

  return (
    <>
      {storageMode === 'local' ? (
        <div className="notice">
          Settings are currently stored in this browser only. Set up the free Supabase backend (see{' '}
          <code>.env.example</code>) to share them with the whole team.
        </div>
      ) : null}

      <div className="grid two-col">
        <div className="card">
          <div className="card-head">
            <span className="card-title">AppEx System classification</span>
            <span className="card-sub">
              {appExReasons.length > 0
                ? `${systemCount} of ${appExReasons.length} app exceptions in window match`
                : 'no app exceptions in window'}
            </span>
          </div>
          <p className="card-sub" style={{ marginTop: 6 }}>
            An application exception counts as <b>System</b> (infrastructure-caused) when its message contains
            any of these keywords — otherwise it counts as <b>Bot</b>.
          </p>
          <div className="keyword-chips">
            {draft.systemKeywords.map((k) => (
              <span className="chip on" key={k}>
                {k}
                <button
                  aria-label={`Remove ${k}`}
                  onClick={() => update({ systemKeywords: draft.systemKeywords.filter((x) => x !== k) })}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={newKeyword}
              placeholder="add keyword…"
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addKeyword()
              }}
            />
            <button className="chip" onClick={addKeyword}>
              Add
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">Time &amp; capacity</span>
          </div>
          <div className="settings-row">
            <span className="grow">
              Hours per PT (Personentag)
              <div className="dim">used to convert processing hours into person-days</div>
            </span>
            <input
              type="number"
              min={1}
              step={0.25}
              value={draft.hoursPerPT}
              onChange={(e) => update({ hoursPerPT: Number(e.target.value) })}
            />
          </div>
          <div className="settings-row">
            <span className="grow">
              Health thresholds (stakeholder view)
              <div className="dim">success rate ≥ first value = normal, ≥ second = attention, below = disrupted</div>
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={draft.healthThresholds.okMin}
              onChange={(e) =>
                update({ healthThresholds: { ...draft.healthThresholds, okMin: Number(e.target.value) } })
              }
            />
            <input
              type="number"
              min={0}
              max={100}
              value={draft.healthThresholds.attentionMin}
              onChange={(e) =>
                update({ healthThresholds: { ...draft.healthThresholds, attentionMin: Number(e.target.value) } })
              }
            />
          </div>
          <div className="settings-row">
            <span className="grow">
              License capacity (unattended robots)
              <div className="dim">
                {data?.license?.allowed
                  ? `Orchestrator reports ${data.license.allowed} — override only if needed`
                  : 'Orchestrator did not report a license count — set it here for utilization %'}
              </div>
            </span>
            <input
              type="number"
              min={0}
              value={draft.licenseCapacity ?? ''}
              placeholder="auto"
              onChange={(e) =>
                update({ licenseCapacity: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Human processing time per item</span>
            <span className="card-sub">basis for the Zeitersparnis comparison on the Kennzahlen page</span>
          </div>
          {knownNames.length === 0 ? (
            <div className="state-block">No queues found yet — they appear here once data has loaded.</div>
          ) : (
            knownNames.map((name) => (
              <div className="settings-row" key={name}>
                <span className="grow primary">{name}</span>
                <span className="dim">minutes / item</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={draft.humanMinutesPerItem[name] ?? ''}
                  placeholder="—"
                  onChange={(e) => {
                    const next = { ...draft.humanMinutesPerItem }
                    if (e.target.value === '') delete next[name]
                    else next[name] = Number(e.target.value)
                    update({ humanMinutesPerItem: next })
                  }}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Anzeigenamen (Stakeholder-Ansicht)</span>
            <span className="card-sub">friendly name and one-line description shown to business stakeholders</span>
          </div>
          {displayNames.length === 0 ? (
            <div className="state-block">No processes or queues found yet — they appear here once data has loaded.</div>
          ) : (
            displayNames.map((name) => (
              <div className="settings-row" key={name}>
                <span className="grow dim" style={{ minWidth: 180 }}>
                  {name}
                </span>
                <input
                  style={{ width: 200 }}
                  placeholder={autoCleanName(name)}
                  value={draft.displayInfo[name]?.name ?? ''}
                  onChange={(e) => {
                    const next = { ...draft.displayInfo }
                    const cur = next[name] ?? { name: '' }
                    if (e.target.value === '' && !cur.description) delete next[name]
                    else next[name] = { ...cur, name: e.target.value }
                    update({ displayInfo: next })
                  }}
                />
                <input
                  style={{ flex: 1, minWidth: 180 }}
                  placeholder="description (optional)"
                  value={draft.displayInfo[name]?.description ?? ''}
                  onChange={(e) => {
                    const next = { ...draft.displayInfo }
                    const cur = next[name] ?? { name: '' }
                    next[name] = { ...cur, description: e.target.value }
                    if (!next[name].name && !next[name].description) delete next[name]
                    update({ displayInfo: next })
                  }}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
        <button
          className="btn-primary"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(draft, { onSuccess: () => setDirty(false) })}
        >
          {save.isPending ? 'Saving…' : 'Save settings'}
        </button>
        {dirty ? <span className="card-sub">Unsaved changes</span> : null}
        {!dirty && save.isSuccess ? <span className="card-sub">Saved.</span> : null}
      </div>
      {save.error ? <div className="error-banner">Saving failed: {(save.error as Error).message}</div> : null}
    </>
  )
}
