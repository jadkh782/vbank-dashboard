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
import { fmtDateTime, fmtDuration, fmtInt, fmtPct } from '../../lib/format'
import { StackedBarsChart } from '../../components/charts/ChartKit'
import { useChartTheme } from '../../theme'
import { HealthDot } from './Health'
import { ResponsibilityBadge } from './Responsibility'
import { StatusStrip } from './StatusStrip'
import { IssueList } from './IssueList'

const PANEL_LABELS = {
  de: {
    close: 'Schließen',
    trend: 'Verlauf',
    figures: 'Kennzahlen',
    causes: 'Ursachen',
    manual: 'Gemeldete IT-Störungen',
    owner: 'zuständig:',
    avgRun: 'Ø Dauer je Lauf',
    avgItem: 'Ø Dauer je Vorgang',
    runs: 'Läufe',
    items: 'Vorgänge',
    quality: 'Korrekt verarbeitet',
    last: 'Zuletzt aktiv',
    saved: 'Eingesparte Zeit',
    noIssues: 'Keine Störungen für diesen Prozess im gewählten Zeitraum.',
    downtime: (m: string) => `Ausfallzeit ${m} Min.`,
    reportedBy: (n: string) => ` · gemeldet von ${n}`,
    seriesOk: 'Erfolgreich',
    seriesBad: 'Nicht erfolgreich',
  },
  en: {
    close: 'Close',
    trend: 'Trend',
    figures: 'Figures',
    causes: 'Causes',
    manual: 'Reported IT incidents',
    owner: 'owner:',
    avgRun: 'Ø per run',
    avgItem: 'Ø per item',
    runs: 'Runs',
    items: 'Items',
    quality: 'Success rate',
    last: 'Last activity',
    saved: 'Time saved',
    noIssues: 'No errors for this automation in the selected window.',
    downtime: (m: string) => `Downtime ${m} min`,
    reportedBy: (n: string) => ` · reported by ${n}`,
    seriesOk: 'Successful',
    seriesBad: 'Not successful',
  },
}

const HEALTH_LABELS_EN: Record<StakeholderCard['health'], string> = {
  ok: 'healthy',
  attention: 'needs attention',
  critical: 'disrupted',
}

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
  lang = 'de',
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
  lang?: 'de' | 'en'
}) {
  const t = useChartTheme()
  const panelRef = useRef<HTMLDivElement>(null)
  const L = PANEL_LABELS[lang]
  const de = lang === 'de'
  const num = de ? deInt : fmtInt
  const rate = de ? dePct : (v: number) => fmtPct(v)
  const when = de ? deDateTime : fmtDateTime

  // Esc to close, focus into the panel, restore focus and scrolling on unmount.
  // Focus is restored by card key rather than by node reference: React replaces
  // the card button on re-render, so the original node is detached by then.
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
      const trigger = document.querySelector<HTMLElement>(
        `[data-card-key="${CSS.escape(key)}"]`,
      )
      trigger?.focus()
    }
  }, [onClose, card.key])

  const cardJobs = jobsForCard(card, jobs)
  const cardItems = queueItemsForCard(card, queueItems, idsByName)
  const ownGroups = errorGroups
    .filter((g) => g.processes.some((p) => p.toLowerCase() === card.technicalName.toLowerCase()))
    .sort((a, b) => b.count - a.count)
  const ownManual = manualErrors.filter(
    (m) => m.process.toLowerCase() === card.technicalName.toLowerCase(),
  )

  const trendRows = strip.map((c) => ({
    label: c.label,
    [L.seriesOk]: c.successful,
    [L.seriesBad]: c.total - c.successful,
  }))
  const trendSeries = [
    { key: L.seriesOk, color: t.state.Successful },
    { key: L.seriesBad, color: t.errorSource['Job fault'] },
  ]

  const avg = avgDurationMs(card, cardJobs, cardItems)

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
              {de ? HEALTH_LABELS_DE[card.health] : HEALTH_LABELS_EN[card.health]}
              {card.issueResponsibility ? (
                <>
                  <span className="dim">·</span>
                  <span className="dim">{L.owner}</span>
                  <ResponsibilityBadge who={card.issueResponsibility} />
                </>
              ) : null}
            </div>
          </div>
          <button className="panel-close" onClick={onClose} aria-label={L.close}>
            ×
          </button>
        </header>

        <div className="panel-body">
          <section>
            <div className="panel-section-title">{L.trend}</div>
            <StatusStrip cells={strip} large />
            <div style={{ marginTop: 14 }}>
              <StackedBarsChart
                data={trendRows}
                series={trendSeries}
                height={200}
                valueFmt={(v) => num(v)}
              />
            </div>
          </section>

          <section>
            <div className="panel-section-title">{L.figures}</div>
            <div className="panel-figures">
              <div>
                <span className="dim">{de ? card.countLabel : card.kind === 'process' ? L.runs : L.items}</span>
                <b>{num(card.count)}</b>
              </div>
              <div>
                <span className="dim">{L.quality}</span>
                <b>{rate(card.successRate)}</b>
              </div>
              <div>
                <span className="dim">{card.kind === 'process' ? L.avgRun : L.avgItem}</span>
                <b>{fmtDuration(avg)}</b>
              </div>
              <div>
                <span className="dim">{L.last}</span>
                <b>{card.lastActivity ? when(card.lastActivity) : '–'}</b>
              </div>
              {card.kind === 'queue' && settings.humanMinutesPerItem[card.technicalName] ? (
                <div>
                  <span className="dim">{L.saved}</span>
                  <b>
                    {deHours(
                      (card.count * settings.humanMinutesPerItem[card.technicalName]) / 60 -
                        cardItems.reduce((a, q) => {
                          if (!q.StartProcessing || !q.EndProcessing) return a
                          const d =
                            new Date(q.EndProcessing).getTime() - new Date(q.StartProcessing).getTime()
                          return d >= 0 ? a + d / 3600_000 : a
                        }, 0),
                    )}
                  </b>
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <div className="panel-section-title">{L.causes}</div>
            <IssueList
              groups={ownGroups}
              settings={settings}
              showProcesses={false}
              emptyText={L.noIssues}
            />
          </section>

          {ownManual.length > 0 ? (
            <section>
              <div className="panel-section-title">{L.manual}</div>
              {ownManual.map((m) => (
                <div className="panel-manual" key={m.id}>
                  <div className="primary">
                    {m.category} · {when(m.time)}
                  </div>
                  <div>{m.description}</div>
                  <div className="dim">
                    {m.downtimeMinutes !== undefined ? L.downtime(num(m.downtimeMinutes)) : ''}
                    {m.reportedBy ? L.reportedBy(m.reportedBy) : ''}
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
