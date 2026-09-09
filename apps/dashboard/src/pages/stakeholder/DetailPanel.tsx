import { useEffect, useRef } from 'react'
import type { AppSettings, ManualError } from '../../api/store'
import type { OrchJob, OrchQueueItem } from '../../api/types'
import type { ErrorGroup } from '../../lib/errors'
import type { StakeholderCard, StripCell } from '../../lib/health'
import {
  deDateTime,
  deHours,
  deInt,
  dePct,
  HEALTH_LABELS_DE,
  jobsForCard,
  queueItemsForCard,
} from '../../lib/health'
import { fmtDuration } from '../../lib/format'
import { StackedBarsChart } from '../../components/charts/ChartKit'
import { useChartTheme } from '../../theme'
import { HealthDot } from './Health'
import { ResponsibilityBadge } from './Responsibility'
import { StatusStrip } from './StatusStrip'
import { IssueList } from './IssueList'

function avgDurationMs(card: StakeholderCard, jobs: OrchJob[], items: OrchQueueItem[]): number {
  let sum = 0
  let n = 0
  if (card.kind === 'process') {
    for (const j of jobs) {
      if (!j.StartTime || !j.EndTime) continue
      const d = new Date(j.EndTime).getTime() - new Date(j.StartTime).getTime()
      if (d >= 0) {
        sum += d
        n++
      }
    }
  } else {
    for (const q of items) {
      if (!q.StartProcessing || !q.EndProcessing) continue
      const d = new Date(q.EndProcessing).getTime() - new Date(q.StartProcessing).getTime()
      if (d >= 0) {
        sum += d
        n++
      }
    }
  }
  return n > 0 ? sum / n : NaN
}

export function DetailPanel({
  card,
  strip,
  jobs,
  queueItems,
  idsByName,
  errorGroups,
  manualErrors,
  settings,
  onClose,
}: {
  card: StakeholderCard
  strip: StripCell[]
  jobs: OrchJob[]
  queueItems: OrchQueueItem[]
  idsByName: Map<string, number[]>
  errorGroups: ErrorGroup[]
  manualErrors: ManualError[]
  settings: AppSettings
  onClose: () => void
}) {
  const t = useChartTheme()
  const panelRef = useRef<HTMLDivElement>(null)

  // Esc to close, focus into the panel, restore focus and scrolling on unmount.
  // Focus is restored by card key rather than by node reference: React replaces
  // the row on re-render, so the original node is detached by then.
  useEffect(() => {
    const key = card.key
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      const trigger = document.querySelector<HTMLElement>(`[data-card-key="${CSS.escape(key)}"]`)
      trigger?.focus()
    }
  }, [onClose, card.key])

  const cardJobs = jobsForCard(card, jobs)
  const cardItems = queueItemsForCard(card, queueItems, idsByName)
  const ownGroups = errorGroups
    .filter((g) => g.processes.some((p) => p.toLowerCase() === card.technicalName.toLowerCase()))
    .sort((a, b) => b.count - a.count)
  const ownManual = manualErrors.filter((m) => m.process.toLowerCase() === card.technicalName.toLowerCase())

  const trendRows = strip.map((c) => ({
    label: c.label,
    Erfolgreich: c.successful,
    'Nicht erfolgreich': c.total - c.successful,
  }))
  const trendSeries = [
    { key: 'Erfolgreich', color: t.state.Successful },
    { key: 'Nicht erfolgreich', color: t.errorSource['Job fault'] },
  ]

  const avg = avgDurationMs(card, cardJobs, cardItems)
  const humanMinutes = card.kind === 'queue' ? settings.humanMinutesPerItem[card.technicalName] : undefined

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <aside
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-panel-title"
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="panel-head">
          <div>
            <div className="panel-kicker">{card.area}</div>
            <h2 id="detail-panel-title" className="panel-title">
              {card.displayName}
            </h2>
            {card.description ? <div className="panel-desc">{card.description}</div> : null}
            <div className="panel-status">
              <HealthDot health={card.health} />
              {HEALTH_LABELS_DE[card.health]}
              {card.issueResponsibility ? (
                <>
                  <span className="dim">·</span>
                  <span className="dim">zuständig:</span>
                  <ResponsibilityBadge who={card.issueResponsibility} />
                </>
              ) : null}
            </div>
          </div>
          <button className="panel-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </header>

        <div className="panel-body">
          <section>
            <div className="panel-section-title">Verlauf</div>
            <StatusStrip cells={strip} large />
            <div style={{ marginTop: 14 }}>
              <StackedBarsChart data={trendRows} series={trendSeries} height={200} valueFmt={(v) => deInt(v)} />
            </div>
          </section>

          <section>
            <div className="panel-section-title">Kennzahlen</div>
            <div className="panel-figures">
              <div>
                <span className="dim">{card.countLabel}</span>
                <b>{deInt(card.count)}</b>
              </div>
              <div>
                <span className="dim">Korrekt verarbeitet</span>
                <b>{dePct(card.successRate)}</b>
              </div>
              <div>
                <span className="dim">{card.kind === 'process' ? 'Ø Dauer je Lauf' : 'Ø Dauer je Vorgang'}</span>
                <b>{fmtDuration(avg)}</b>
              </div>
              <div>
                <span className="dim">Zuletzt aktiv</span>
                <b>{card.lastActivity ? deDateTime(card.lastActivity) : '–'}</b>
              </div>
              {humanMinutes ? (
                <div>
                  <span className="dim">Eingesparte Zeit</span>
                  <b>
                    {deHours(
                      (card.count * humanMinutes) / 60 -
                        cardItems.reduce((a, q) => {
                          if (!q.StartProcessing || !q.EndProcessing) return a
                          const d = new Date(q.EndProcessing).getTime() - new Date(q.StartProcessing).getTime()
                          return d >= 0 ? a + d / 3600_000 : a
                        }, 0),
                    )}
                  </b>
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <div className="panel-section-title">Ursachen</div>
            <IssueList
              groups={ownGroups}
              settings={settings}
              showProcesses={false}
              emptyText="Keine offenen Punkte für diese Automatisierung im gewählten Zeitraum."
            />
          </section>

          {ownManual.length > 0 ? (
            <section>
              <div className="panel-section-title">Gemeldete IT-Störungen</div>
              {ownManual.map((m) => (
                <div className="panel-manual" key={m.id}>
                  <div className="primary">
                    {m.category} · {deDateTime(m.time)}
                  </div>
                  <div>{m.description}</div>
                  <div className="dim">
                    {m.downtimeMinutes !== undefined ? `Ausfallzeit ${deInt(m.downtimeMinutes)} Min.` : ''}
                    {m.reportedBy ? ` · gemeldet von ${m.reportedBy}` : ''}
                  </div>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      </aside>
    </>
  )
}
