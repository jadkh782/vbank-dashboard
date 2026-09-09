import { useMemo, useState } from 'react'
import { usePageData } from '../hooks/usePageData'
import { useTenantData } from '../hooks/useOrchestrator'
import { STATE_STACK_ORDER, useFilters } from '../state/FilterContext'
import {
  jobKpis,
  jobsOverTime,
  queueKpis,
  queueVolumeOverTime,
  scorecard,
  QUEUE_OUTCOMES,
} from '../lib/aggregate'
import { collectErrors, groupErrors } from '../lib/errors'
import {
  buildStakeholderCards,
  healthStrip,
  queueIdsByName,
  RESPONSIBILITY_LABELS,
  type StakeholderCard,
} from '../lib/health'
import { StatTile } from '../components/ui/StatTile'
import { DataTable, type Column } from '../components/ui/DataTable'
import { StateBadge } from '../components/ui/Badges'
import { ChartCard, StackedBarsChart } from '../components/charts/ChartKit'
import { AutomationTable } from './stakeholder/AutomationTable'
import { DetailPanel } from './stakeholder/DetailPanel'
import { useChartTheme } from '../theme'
import { fmtCompact, fmtDateTime, fmtInt, fmtPct } from '../lib/format'
import type { ErrorGroup } from '../lib/errors'

export function Overview() {
  const { page, isFetching, settings } = usePageData()
  const { data } = useTenantData()
  const { from, to, statuses } = useFilters()
  const t = useChartTheme()
  const [selected, setSelected] = useState<StakeholderCard | null>(null)

  const idsByName = useMemo(() => (data ? queueIdsByName(data) : new Map()), [data])
  if (!page || !data) return null

  const cur = jobKpis(page.jobs)
  const prev = jobKpis(page.jobsPrev)
  const qCur = queueKpis(page.queueItems)
  const qPrev = queueKpis(page.queueItemsPrev)

  const orderedStates = STATE_STACK_ORDER.filter((s) => statuses.includes(s))
  const jobSeries = orderedStates.map((s) => ({ key: s, color: t.state[s] ?? t.axisInk }))
  const jobChart = jobsOverTime(page.jobs, from, to, orderedStates)
  const queueSeries = QUEUE_OUTCOMES.map((o) => ({ key: o, color: t.queueOutcome[o] }))
  const queueChart = queueVolumeOverTime(page.queueItems, from, to)

  const occurrences = collectErrors(
    page.jobs,
    page.queueItems,
    page.queueNames,
    page.manualErrors,
    settings.systemKeywords,
  )
  const groups = groupErrors(occurrences)

  const rows = scorecard(data, page.queueItems, page.manualErrors, settings)
  const cards = buildStakeholderCards(data, page.jobs, rows, groups, page.manualErrors, settings)
  const stripFor = (card: StakeholderCard) =>
    healthStrip(card, page.jobs, page.queueItems, idsByName, from, to, settings.healthThresholds)

  const totalRuntime = cards.reduce((a, c) => a + c.runtimeHours, 0)
  const processedCur = qCur.successful + qCur.appExceptions + qCur.bizExceptions
  const processedPrev = qPrev.successful + qPrev.appExceptions + qPrev.bizExceptions

  const errorCols: Column<ErrorGroup>[] = [
    {
      key: 'msg',
      header: 'Error message (grouped)',
      sortValue: (r) => r.message,
      render: (r) => (
        <>
          <span className="primary" style={{ overflowWrap: 'anywhere' }}>
            {r.message}
          </span>
          <div className="dim">
            {r.processes.slice(0, 3).join(', ')}
            {r.processes.length > 3 ? ` +${r.processes.length - 3} more` : ''}
          </div>
        </>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      sortValue: (r) => r.source,
      render: (r) => <StateBadge kind={r.source} palette="errorSource" />,
    },
    {
      key: 'owner',
      header: 'Owner',
      sortValue: (r) => r.responsibility,
      render: (r) => <span className="dim">{RESPONSIBILITY_LABELS[r.responsibility]}</span>,
    },
    { key: 'count', header: 'Count', numeric: true, sortValue: (r) => r.count, render: (r) => fmtInt(r.count) },
    {
      key: 'share',
      header: 'Share',
      numeric: true,
      sortValue: (r) => r.share,
      render: (r) => fmtPct(r.share * 100),
    },
    {
      key: 'last',
      header: 'Last seen',
      numeric: true,
      sortValue: (r) => r.lastSeen,
      render: (r) => <span className="dim">{fmtDateTime(r.lastSeen)}</span>,
    },
  ]

  return (
    <>
      <div className="grid kpi-row">
        <StatTile
          label="Job runs"
          value={fmtCompact(cur.total)}
          current={cur.total}
          previous={prev.total}
          refetching={isFetching}
        />
        <StatTile
          label="Job success rate"
          value={isFinite(cur.successRate) ? fmtPct(cur.successRate) : '–'}
          current={cur.successRate}
          previous={prev.successRate}
          refetching={isFetching}
        />
        <StatTile
          label="Faulted jobs"
          value={fmtCompact(cur.faulted)}
          current={cur.faulted}
          previous={prev.faulted}
          upIsGood={false}
          refetching={isFetching}
        />
        <StatTile
          label="Bot runtime"
          value={`${totalRuntime.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} h`}
          refetching={isFetching}
        />
        <StatTile
          label="Transactions processed"
          value={fmtCompact(processedCur)}
          current={processedCur}
          previous={processedPrev}
          refetching={isFetching}
        />
        <StatTile
          label="Transaction success rate"
          value={isFinite(qCur.successRate) ? fmtPct(qCur.successRate) : '–'}
          current={qCur.successRate}
          previous={qPrev.successRate}
          refetching={isFetching}
        />
      </div>

      <div className="stake-section-head">
        <h2 className="stake-section-title">All automations</h2>
        <span className="card-sub">
          {fmtInt(cards.length)} in this window · click a row for details
        </span>
      </div>
      <div className={`card${isFetching ? ' refetching' : ''}`}>
        <AutomationTable cards={cards} stripFor={stripFor} onOpen={setSelected} lang="en" />
      </div>

      <div className="grid two-col">
        <ChartCard title="Job runs over time" sub={`by final state · per ${jobChart.unit}`} refetching={isFetching}>
          <StackedBarsChart data={jobChart.rows} series={jobSeries} height={240} />
        </ChartCard>
        <ChartCard
          title="Queue transactions over time"
          sub={`by outcome · per ${queueChart.unit}`}
          refetching={isFetching}
        >
          <StackedBarsChart data={queueChart.rows} series={queueSeries} height={240} />
        </ChartCard>
      </div>

      <div className="grid">
        <ChartCard
          title="Most frequent errors"
          sub="grouped by normalized message, with the team that owns the fix"
          refetching={isFetching}
        >
          <DataTable
            columns={errorCols}
            rows={groups}
            initialSort={{ key: 'count', dir: 'desc' }}
            maxRows={10}
            emptyText="No errors in the selected window."
          />
        </ChartCard>
      </div>

      {selected ? (
        <DetailPanel
          card={selected}
          strip={stripFor(selected)}
          jobs={page.jobs}
          queueItems={page.queueItems}
          idsByName={idsByName}
          errorGroups={groups}
          manualErrors={page.manualErrors}
          settings={settings}
          onClose={() => setSelected(null)}
          lang="en"
        />
      ) : null}
    </>
  )
}
