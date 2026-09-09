import { useEffect, useState } from 'react'
import { deDateTime, deDuration, deInt, type Category } from '@vbank/shared'
import { CategoryBadge, Drawer } from '@vbank/ui'
import { CategorySelect, ConfidenceBadge, ReviewStatusBadge } from '../components/Badges'
import { displayNameOf, useChainAttempts } from '../data/queries'
import { useReopenItem, useSaveNote, useSetCategory } from '../data/mutations'
import type { ReviewRow } from '../data/types'

/** Everything about one item: every attempt with its raw exception text, and the decision. */
export function ReviewDrawer({
  row,
  frozen,
  onClose,
  onPrev,
  onNext,
  categoryLabel,
}: {
  row: ReviewRow
  frozen: boolean
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  categoryLabel: string | null
}) {
  const attempts = useChainAttempts(row.transaction_id)
  const setCategory = useSetCategory()
  const reopen = useReopenItem()
  const saveNote = useSaveNote()
  const [category, setCat] = useState<Category | null>(row.category ?? row.suggested_category)
  const [note, setNote] = useState(row.note ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCat(row.category ?? row.suggested_category)
    setNote(row.note ?? '')
    setError(null)
  }, [row.id, row.category, row.suggested_category, row.note])

  const save = async (andNext: boolean) => {
    if (!category) return
    setError(null)
    try {
      await setCategory.mutateAsync({ id: row.id, category, note: note.trim() || undefined })
      if (andNext) onNext()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const title = displayNameOf(row.automation)
  return (
    <Drawer titleId="review-drawer-title" focusKey={String(row.id)} onClose={onClose}>
      <header className="panel-head">
        <div>
          <div className="panel-kicker">
            {row.automation?.folder_name ?? ''} · {row.kind === 'job' ? 'Prozessabbruch' : 'Vorgang'} · {row.time ? deDateTime(row.time) : ''}
          </div>
          <h2 id="review-drawer-title" className="panel-title">
            {title}
          </h2>
          <div className="panel-status">
            <ReviewStatusBadge status={row.status} />
            {categoryLabel ? <span className="dim">· {categoryLabel}</span> : null}
            {row.outcome_changed ? <span className="notice inline">Ergebnis hat sich seit der Bestätigung geändert</span> : null}
          </div>
        </div>
        <span className="drawer-nav">
          <button className="theme-toggle" onClick={onPrev} aria-label="Vorheriger">
            ←
          </button>
          <button className="theme-toggle" onClick={onNext} aria-label="Nächster">
            →
          </button>
          <button className="panel-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </span>
      </header>

      <div className="panel-body">
        <section>
          <div className="panel-section-title">Entscheidung</div>
          <div className="decision">
            <div className="suggestion">
              <span className="dim">Vorschlag:</span>
              {row.suggested_category ? <CategoryBadge category={row.suggested_category} /> : <span className="dim">keiner</span>}
              <ConfidenceBadge confidence={row.suggested_confidence} />
              {row.suggested_reason ? <span className="dim">({row.suggested_reason})</span> : null}
            </div>
            <label className="form-field">
              <span>Kategorie</span>
              <CategorySelect value={category} onChange={setCat} disabled={frozen} />
            </label>
            <label className="form-field">
              <span>Notiz</span>
              <textarea rows={2} value={note} disabled={frozen} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (row.note ?? '') && !frozen && saveNote.mutate({ id: row.id, note })} />
            </label>
            {error ? <div className="error-banner">{error}</div> : null}
            {!frozen ? (
              <div className="decision-actions">
                <button className="btn-primary" disabled={!category || setCategory.isPending} onClick={() => void save(true)}>
                  Speichern &amp; nächster
                </button>
                <button className="theme-toggle" disabled={!category || setCategory.isPending} onClick={() => void save(false)}>
                  Speichern
                </button>
                {row.status === 'confirmed' ? (
                  <button className="linklike" onClick={() => reopen.mutate(row.id)}>
                    wieder öffnen
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="dim">Der Tag ist veröffentlicht — Änderungen nur nach Rücknahme der Veröffentlichung.</div>
            )}
          </div>
        </section>

        {row.kind === 'job' && row.job ? (
          <section>
            <div className="panel-section-title">Prozesslauf</div>
            <div className="attempt">
              <div className="attempt-head">
                <b>{row.job.state}</b>
                <span className="dim">
                  {row.job.host_machine ?? ''} · {row.job.start_time ? deDateTime(row.job.start_time) : '–'} – {row.job.end_time ? deDateTime(row.job.end_time) : '–'}
                </span>
              </div>
              <pre className="attempt-block">{row.job.info ?? '(keine Fehlerdetails)'}</pre>
            </div>
          </section>
        ) : null}

        {row.transaction ? (
          <section>
            <div className="panel-section-title">
              Versuche <span className="dim">· {deInt(row.transaction.attempts)} · Ergebnis: {row.transaction.outcome}</span>
            </div>
            {attempts.isLoading ? <div className="dim">Lade Versuche…</div> : null}
            {(attempts.data ?? []).map((a) => (
              <div className="attempt" key={a.id}>
                <div className="attempt-head">
                  <b>
                    Versuch {a.attempt_no ?? '?'} · {a.status}
                  </b>
                  <span className="dim">
                    {a.reference ? `Ref. ${a.reference} · ` : ''}
                    {deDateTime(a.creation_time)}
                    {a.start_processing && a.end_processing ? ` · ${deDuration(new Date(a.end_processing).getTime() - new Date(a.start_processing).getTime())}` : ''}
                    {a.exception_type ? ` · ${a.exception_type}` : ''}
                  </span>
                </div>
                {a.exception_reason ? <pre className="attempt-block">{a.exception_reason}</pre> : null}
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </Drawer>
  )
}
