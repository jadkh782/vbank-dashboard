import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { berlinDayEnd, CATEGORY_LABELS_DE, deDate, deDateTime, deInt } from '@vbank/shared'
import { CategoryBadge, DataTable, type Column } from '@vbank/ui'
import { CategorySelect, ConfidenceBadge, DayStatusBadge, ReviewStatusBadge } from '../components/Badges'
import { displayNameOf, useDayReview, useDays } from '../data/queries'
import { useConfirmItems, usePublishDay, useSetCategory, useUnpublishDay } from '../data/mutations'
import type { ReviewRow } from '../data/types'
import { ReviewDrawer } from './ReviewDrawer'

export function DayReview() {
  const { day } = useParams<{ day: string }>()
  const days = useDays()
  const review = useDayReview(day)
  const confirm = useConfirmItems()
  const setCategory = useSetCategory()
  const publish = usePublishDay()
  const unpublish = useUnpublishDay()
  const [selected, setSelected] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stats = days.data?.find((d) => d.business_day === day)
  const frozen = stats?.state === 'published'
  const rows = review.data ?? []
  const openRows = rows.filter((r) => r.status === 'open')
  const infoRows = rows.filter((r) => r.status === 'info')
  const withSuggestion = openRows.filter((r) => r.suggested_category)

  const groups = useMemo(() => {
    const m = new Map<string, ReviewRow[]>()
    for (const r of rows) {
      if (r.status === 'info') continue
      const k = r.automation_id
      ;(m.get(k) ?? m.set(k, []).get(k)!).push(r)
    }
    return [...m.entries()].sort((a, b) => b[1].filter((x) => x.status === 'open').length - a[1].filter((x) => x.status === 'open').length)
  }, [rows])

  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const fetchedComplete = !!stats?.fetched_through && day !== undefined && new Date(stats.fetched_through) >= berlinDayEnd(day)
  const canPublish = !!stats && !frozen && openRows.length === 0 && fetchedComplete
  const earlierOpen = (days.data ?? []).some((d) => d.state !== 'published' && day !== undefined && d.business_day < day)

  const columns: Column<ReviewRow>[] = [
    { key: 'time', header: 'Zeit', sortValue: (r) => r.time, render: (r) => <span className="dim">{r.time ? deDateTime(r.time) : '–'}</span> },
    { key: 'kind', header: 'Art', render: (r) => (r.kind === 'job' ? 'Prozessabbruch' : 'Vorgang') },
    { key: 'attempts', header: 'Versuche', numeric: true, sortValue: (r) => r.attempts, render: (r) => deInt(r.attempts) },
    {
      key: 'message',
      header: 'Meldung (normalisiert)',
      render: (r) => (
        <span className="msg" title={r.message ?? ''}>
          {r.message ?? <span className="dim">–</span>}
        </span>
      ),
    },
    {
      key: 'suggestion',
      header: 'Vorschlag',
      render: (r) => (
        <span className="suggestion">
          {r.suggested_category ? <CategoryBadge category={r.suggested_category} /> : <span className="dim">–</span>}
          <ConfidenceBadge confidence={r.suggested_confidence} />
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Kategorie',
      render: (r) => (
        <span onClick={(e) => e.stopPropagation()}>
          <CategorySelect value={r.category} disabled={frozen} onChange={(c) => void act(() => setCategory.mutateAsync({ id: r.id, category: c }))} />
        </span>
      ),
    },
    { key: 'status', header: 'Prüfung', render: (r) => <ReviewStatusBadge status={r.status} /> },
    { key: 'note', header: '', render: (r) => (r.note ? <span title={r.note}>✎</span> : null) },
  ]

  if (!day) return null
  const selectedRow = selected !== null ? rows.find((r) => r.id === selected) : undefined
  const orderIds = rows.filter((r) => r.status !== 'info').map((r) => r.id)

  return (
    <>
      <div className="stake-section-head">
        <div>
          <span className="section-eyebrow">
            <Link to="/">Tagesprüfung</Link> — <b>{deDate(day)}</b>
          </span>
          <h2 className="stake-section-title">
            {stats ? <DayStatusBadge state={stats.state} openCount={stats.open_count} stale={stats.stale} /> : null}{' '}
            {deInt(rows.length - infoRows.length)} Punkte · {deInt(openRows.length)} offen
          </h2>
        </div>
        <div className="stake-controls">
          {!frozen && withSuggestion.length > 0 ? (
            <button className="btn-primary" disabled={confirm.isPending} onClick={() => void act(() => confirm.mutateAsync({ ids: withSuggestion.map((r) => r.id) }))}>
              Vorschläge übernehmen ({deInt(withSuggestion.length)})
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {stats?.stale ? <div className="notice">Daten nach Veröffentlichung geändert ({stats.stale_reason}). Prüfen und ggf. erneut veröffentlichen.</div> : null}
      {review.isLoading ? <div className="state-block">Lade Punkte…</div> : null}

      {groups.map(([automationId, items]) => {
        const a = items[0].automation
        const open = items.filter((r) => r.status === 'open')
        const sugg = open.filter((r) => r.suggested_category)
        return (
          <div className="card review-group" key={automationId}>
            <div className="card-head">
              <span className="card-title">
                {displayNameOf(a)} <span className="dim">· {a?.folder_name ?? ''} · {a?.kind === 'queue' ? 'Warteschlange' : 'Prozess'}</span>
              </span>
              <span className="card-sub">
                {deInt(open.length)} offen von {deInt(items.length)}
                {!frozen && sugg.length > 0 ? (
                  <>
                    {' · '}
                    <button className="linklike" onClick={() => void act(() => confirm.mutateAsync({ ids: sugg.map((r) => r.id) }))}>
                      Vorschläge übernehmen ({deInt(sugg.length)})
                    </button>
                  </>
                ) : null}
              </span>
            </div>
            <DataTable columns={columns} rows={items} rowKey={(r) => String(r.id)} onRowClick={(r) => setSelected(r.id)} initialSort={{ key: 'time', dir: 'asc' }} />
          </div>
        )
      })}

      {infoRows.length > 0 ? (
        <div className="card">
          <div className="card-head">
            <span className="card-title">
              Nach Neustart erfolgreich <span className="dim">· {deInt(infoRows.length)} Vorgänge, keine Prüfung nötig</span>
            </span>
            <button className="chip" onClick={() => setShowInfo((s) => !s)}>
              {showInfo ? 'Ausblenden' : 'Einblenden'}
            </button>
          </div>
          {showInfo ? (
            <DataTable
              columns={columns.filter((c) => c.key !== 'category' && c.key !== 'suggestion')}
              rows={infoRows}
              rowKey={(r) => String(r.id)}
              onRowClick={(r) => setSelected(r.id)}
            />
          ) : null}
        </div>
      ) : null}

      <div className="publish-bar">
        <span>
          {stats?.state === 'published'
            ? `Veröffentlicht am ${stats.published_at ? deDateTime(stats.published_at) : '–'}`
            : !fetchedComplete
              ? 'Der Tag ist noch nicht vollständig abgerufen.'
              : openRows.length > 0
                ? `${deInt(openRows.length)} offene Punkte müssen bestätigt werden.`
                : earlierOpen
                  ? 'Ein früherer Tag ist noch nicht veröffentlicht.'
                  : 'Alle Punkte bestätigt — der Tag kann veröffentlicht werden.'}
        </span>
        {frozen ? (
          <span className="publish-actions">
            <input placeholder="Begründung für die Rücknahme" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="theme-toggle" disabled={!reason.trim() || unpublish.isPending} onClick={() => void act(() => unpublish.mutateAsync({ day, reason }).then(() => setReason('')))}>
              Veröffentlichung zurücknehmen
            </button>
          </span>
        ) : (
          <button className="btn-primary" disabled={!canPublish || earlierOpen || publish.isPending} onClick={() => void act(() => publish.mutateAsync(day))}>
            Tag veröffentlichen
          </button>
        )}
      </div>

      {selectedRow ? (
        <ReviewDrawer
          row={selectedRow}
          frozen={!!frozen}
          onClose={() => setSelected(null)}
          onPrev={() => {
            const i = orderIds.indexOf(selectedRow.id)
            if (i > 0) setSelected(orderIds[i - 1])
          }}
          onNext={() => {
            const i = orderIds.indexOf(selectedRow.id)
            if (i >= 0 && i < orderIds.length - 1) setSelected(orderIds[i + 1])
          }}
          categoryLabel={selectedRow.category ? CATEGORY_LABELS_DE[selectedRow.category] : null}
        />
      ) : null}
    </>
  )
}
