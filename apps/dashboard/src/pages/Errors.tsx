import { useState } from 'react'
import { usePageData } from '../hooks/usePageData'
import { useFilters } from '../state/FilterContext'
import { errorsOverTime } from '../lib/aggregate'
import { collectErrors, ERROR_SOURCES, groupErrors } from '../lib/errors'
import { ChartCard, StackedBarsChart } from '../components/charts/ChartKit'
import { DataTable, type Column } from '../components/ui/DataTable'
import { RankList } from '../components/ui/RankList'
import { StateBadge } from '../components/ui/Badges'
import { StatTile } from '../components/ui/StatTile'
import { useChartTheme } from '../theme'
import { fmtCompact, fmtDateTime, fmtInt, fmtPct } from '../lib/format'
import type { AlertSeverity, OrchAlert } from '../api/types'
import type { ErrorGroup } from '../lib/errors'

const SEVERITIES: AlertSeverity[] = ['Fatal', 'Error', 'Warn', 'Info', 'Success']

export function Errors() {
  const { page, isFetching, settings } = usePageData()
  const { from, to } = useFilters()
  const t = useChartTheme()
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all')
  if (!page) return null

  const occurrences = collectErrors(
    page.jobs,
    page.queueItems,
    page.queueNames,
    page.manualErrors,
    settings.systemKeywords,
  )
  const occurrencesPrev = collectErrors(
    page.jobsPrev,
    page.queueItemsPrev,
    page.queueNames,
    page.manualErrorsPrev,
    settings.systemKeywords,
  )
  const groups = groupErrors(occurrences)
  const timeline = errorsOverTime(occurrences, from, to, ERROR_SOURCES)
  const sourceSeries = ERROR_SOURCES.map((s) => ({ key: s, color: t.errorSource[s] }))

  const bySource = (src: string) => occurrences.filter((o) => o.source === src).length
  const bySourcePrev = (src: string) => occurrencesPrev.filter((o) => o.source === src).length

  // Top failing processes/queues by error count
  const failing = new Map<string, number>()
  for (const o of occurrences) failing.set(o.process, (failing.get(o.process) ?? 0) + 1)
  const topFailing = [...failing.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)

  const groupCols: Column<ErrorGroup>[] = [
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

  const alerts = page.alerts
  const filteredAlerts =
    alerts === null ? null : severityFilter === 'all' ? alerts : alerts.filter((a) => a.Severity === severityFilter)

  const alertCols: Column<OrchAlert>[] = [
    {
      key: 'sev',
      header: 'Severity',
      sortValue: (r) => SEVERITIES.indexOf(r.Severity),
      render: (r) => <StateBadge kind={r.Severity} palette="alertSeverity" />,
    },
    {
      key: 'component',
      header: 'Component',
      sortValue: (r) => r.Component,
      render: (r) => r.Component,
    },
    {
      key: 'name',
      header: 'Notification',
      sortValue: (r) => r.NotificationName,
      render: (r) => <span style={{ overflowWrap: 'anywhere' }}>{r.NotificationName}</span>,
    },
    {
      key: 'time',
      header: 'Raised',
      numeric: true,
      sortValue: (r) => r.CreationTime,
      render: (r) => <span className="dim">{fmtDateTime(r.CreationTime)}</span>,
    },
  ]

  return (
    <>
      <div className="grid kpi-row">
        <StatTile
          label="Total errors"
          value={fmtCompact(occurrences.length)}
          current={occurrences.length}
          previous={occurrencesPrev.length}
          upIsGood={false}
          refetching={isFetching}
        />
        {ERROR_SOURCES.map((s) => (
          <StatTile
            key={s}
            label={s}
            value={fmtCompact(bySource(s))}
            current={bySource(s)}
            previous={bySourcePrev(s)}
            upIsGood={false}
            refetching={isFetching}
          />
        ))}
      </div>

      <div className="grid main-side">
        <ChartCard title="Errors over time" sub={`by source · per ${timeline.unit}`} refetching={isFetching}>
          <StackedBarsChart data={timeline.rows} series={sourceSeries} height={250} />
        </ChartCard>
        <ChartCard title="Most affected processes & queues" sub="errors in window" refetching={isFetching}>
          <RankList
            emptyText="No errors in the selected window."
            items={topFailing.map(([name, count]) => ({
              label: name,
              count,
              color: t.errorSource['Job fault'],
            }))}
          />
        </ChartCard>
      </div>

      <div className="grid">
        <ChartCard
          title="Error frequency"
          sub="grouped by normalized message — what is failing and how often"
          refetching={isFetching}
        >
          <DataTable
            columns={groupCols}
            rows={groups}
            initialSort={{ key: 'count', dir: 'desc' }}
            maxRows={30}
            emptyText="No errors in the selected window."
          />
        </ChartCard>
      </div>

      <div className="grid">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Alerts</span>
            {alerts !== null ? (
              <div className="filter-group">
                <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as AlertSeverity | 'all')}>
                  <option value="all">All severities</option>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <div className={isFetching ? 'refetching' : undefined}>
            {alerts === null ? (
              <div className="state-block">
                <b>Alerts unavailable</b>
                The token is missing the <code>OR.Monitoring.Read</code> scope. Grant it to the External
                Application (or PAT) to see Orchestrator alerts here.
              </div>
            ) : (
              <DataTable
                columns={alertCols}
                rows={filteredAlerts!}
                initialSort={{ key: 'time', dir: 'desc' }}
                maxRows={25}
                emptyText="No alerts in the selected window."
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
