import { usePageData } from '../hooks/usePageData'
import { STATE_STACK_ORDER, useFilters } from '../state/FilterContext'
import { jobsOverTime, perProcess, successRateOverTime } from '../lib/aggregate'
import { ChartCard, StackedBarsChart, TrendLineChart } from '../components/charts/ChartKit'
import { DataTable, type Column } from '../components/ui/DataTable'
import { MiniBar } from '../components/ui/Badges'
import { RankList } from '../components/ui/RankList'
import { useChartTheme } from '../theme'
import { fmtDateTime, fmtDuration, fmtInt, fmtPct } from '../lib/format'
import type { ProcessRow } from '../lib/aggregate'
import type { OrchJob } from '../api/types'

export function Jobs() {
  const { page, isFetching } = usePageData()
  const { from, to, statuses } = useFilters()
  const t = useChartTheme()
  if (!page) return null

  const orderedStates = STATE_STACK_ORDER.filter((s) => statuses.includes(s))
  const jobSeries = orderedStates.map((s) => ({ key: s, color: t.state[s] ?? t.axisInk }))
  const runsChart = jobsOverTime(page.jobs, from, to, orderedStates)
  const rateChart = successRateOverTime(page.jobs, from, to)
  const processes = perProcess(page.jobs)
  const longest = [...processes]
    .filter((p) => isFinite(p.avgDurationMs))
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, 10)
  const faulted = page.jobs.filter((j) => j.State === 'Faulted')

  const processCols: Column<ProcessRow>[] = [
    {
      key: 'name',
      header: 'Process',
      sortValue: (r) => r.name,
      render: (r) => <span className="primary">{r.name}</span>,
    },
    { key: 'runs', header: 'Runs', numeric: true, sortValue: (r) => r.runs, render: (r) => fmtInt(r.runs) },
    {
      key: 'success',
      header: 'Successful',
      numeric: true,
      sortValue: (r) => r.successful,
      render: (r) => fmtInt(r.successful),
    },
    {
      key: 'faulted',
      header: 'Faulted',
      numeric: true,
      sortValue: (r) => r.faulted,
      render: (r) => fmtInt(r.faulted),
    },
    {
      key: 'rate',
      header: 'Success rate',
      numeric: true,
      sortValue: (r) => r.successRate,
      render: (r) =>
        isFinite(r.successRate) ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <MiniBar fraction={r.successRate / 100} color={t.state.Successful} />
            {fmtPct(r.successRate)}
          </span>
        ) : (
          '–'
        ),
    },
    {
      key: 'dur',
      header: 'Avg duration',
      numeric: true,
      sortValue: (r) => (isFinite(r.avgDurationMs) ? r.avgDurationMs : -1),
      render: (r) => fmtDuration(r.avgDurationMs),
    },
    {
      key: 'last',
      header: 'Last run',
      numeric: true,
      sortValue: (r) => r.lastRun,
      render: (r) => <span className="dim">{fmtDateTime(r.lastRun)}</span>,
    },
  ]

  const faultedCols: Column<OrchJob>[] = [
    {
      key: 'process',
      header: 'Process',
      sortValue: (r) => r.ReleaseName,
      render: (r) => <span className="primary">{r.ReleaseName}</span>,
    },
    {
      key: 'machine',
      header: 'Machine',
      sortValue: (r) => r.HostMachineName ?? '',
      render: (r) => r.HostMachineName ?? '–',
    },
    {
      key: 'folder',
      header: 'Folder',
      sortValue: (r) => r.FolderName,
      render: (r) => <span className="dim">{r.FolderName}</span>,
    },
    {
      key: 'time',
      header: 'Started',
      numeric: true,
      sortValue: (r) => r.CreationTime,
      render: (r) => <span className="dim">{fmtDateTime(r.StartTime ?? r.CreationTime)}</span>,
    },
    {
      key: 'info',
      header: 'Fault message',
      sortValue: (r) => r.Info ?? '',
      render: (r) => <span style={{ overflowWrap: 'anywhere' }}>{r.Info ?? '–'}</span>,
    },
  ]

  return (
    <>
      <div className="grid two-col">
        <ChartCard title="Job runs" sub={`by final state · per ${runsChart.unit}`} refetching={isFetching}>
          <StackedBarsChart data={runsChart.rows} series={jobSeries} height={250} />
        </ChartCard>
        <ChartCard title="Success rate trend" sub="finished runs only" refetching={isFetching}>
          <TrendLineChart
            data={rateChart}
            dataKey="rate"
            name="Success rate"
            color={t.state.Successful}
            height={250}
            domain={[0, 100]}
            valueFmt={(v) => fmtPct(v, 0)}
          />
        </ChartCard>
      </div>

      <div className="grid">
        <ChartCard title="Processes" sub={`${processes.length} processes ran in this window`} refetching={isFetching}>
          <DataTable columns={processCols} rows={processes} initialSort={{ key: 'runs', dir: 'desc' }} maxRows={25} />
        </ChartCard>
      </div>

      <div className="grid main-side">
        <ChartCard title="Faulted job runs" sub={`${fmtInt(faulted.length)} in window`} refetching={isFetching}>
          <DataTable
            columns={faultedCols}
            rows={faulted}
            initialSort={{ key: 'time', dir: 'desc' }}
            maxRows={20}
            emptyText="No faulted jobs in the selected window."
          />
        </ChartCard>
        <ChartCard title="Longest running processes" sub="average duration, top 10" refetching={isFetching}>
          <RankList
            emptyText="No finished runs with duration data."
            items={longest.map((p) => ({
              label: p.name,
              sub: `${fmtInt(p.runs)} runs`,
              count: Math.round(p.avgDurationMs / 1000),
              color: t.accent,
            }))}
          />
          <div className="card-sub" style={{ marginTop: 6 }}>
            Bar values are average seconds per run.
          </div>
        </ChartCard>
      </div>

      {statuses.length < 6 ? (
        <div className="notice">Job-status filter active: showing {statuses.join(', ')} only.</div>
      ) : null}
    </>
  )
}
