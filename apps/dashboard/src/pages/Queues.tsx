import { usePageData } from '../hooks/usePageData'
import { useFilters } from '../state/FilterContext'
import {
  handlingTimeOverTime,
  perQueue,
  queueKpis,
  queueVolumeOverTime,
  QUEUE_OUTCOMES,
  type QueueRow,
} from '../lib/aggregate'
import { useTenantData } from '../hooks/useOrchestrator'
import { ChartCard, StackedBarsChart, TrendLineChart } from '../components/charts/ChartKit'
import { DataTable, type Column } from '../components/ui/DataTable'
import { MiniBar } from '../components/ui/Badges'
import { StatTile } from '../components/ui/StatTile'
import { useChartTheme } from '../theme'
import { fmtCompact, fmtDuration, fmtInt, fmtPct } from '../lib/format'

export function Queues() {
  const { page, isFetching } = usePageData()
  const { data } = useTenantData()
  const { from, to } = useFilters()
  const t = useChartTheme()
  if (!page || !data) return null

  const cur = queueKpis(page.queueItems)
  const prev = queueKpis(page.queueItemsPrev)
  const volume = queueVolumeOverTime(page.queueItems, from, to)
  const handling = handlingTimeOverTime(page.queueItems, from, to)
  const queueRows = perQueue(data, page.queueItems)
  const series = QUEUE_OUTCOMES.map((o) => ({ key: o, color: t.queueOutcome[o] }))

  const cols: Column<QueueRow>[] = [
    {
      key: 'name',
      header: 'Queue',
      sortValue: (r) => r.name,
      render: (r) => (
        <>
          <span className="primary">{r.name}</span>
          <div className="dim">{r.folder}</div>
        </>
      ),
    },
    { key: 'total', header: 'Items', numeric: true, sortValue: (r) => r.total, render: (r) => fmtInt(r.total) },
    {
      key: 'ok',
      header: 'Successful',
      numeric: true,
      sortValue: (r) => r.successful,
      render: (r) => fmtInt(r.successful),
    },
    {
      key: 'app',
      header: 'App exc.',
      numeric: true,
      sortValue: (r) => r.appExceptions,
      render: (r) => fmtInt(r.appExceptions),
    },
    {
      key: 'biz',
      header: 'Business exc.',
      numeric: true,
      sortValue: (r) => r.bizExceptions,
      render: (r) => fmtInt(r.bizExceptions),
    },
    {
      key: 'pending',
      header: 'Pending',
      numeric: true,
      sortValue: (r) => r.pending,
      render: (r) => fmtInt(r.pending),
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
      key: 'aht',
      header: 'Avg handling',
      numeric: true,
      sortValue: (r) => (isFinite(r.avgHandlingMs) ? r.avgHandlingMs : -1),
      render: (r) => fmtDuration(r.avgHandlingMs),
    },
    {
      key: 'oldest',
      header: 'Oldest pending',
      numeric: true,
      sortValue: (r) => r.oldestPendingMs ?? -1,
      render: (r) => (r.oldestPendingMs !== null ? fmtDuration(r.oldestPendingMs) : '–'),
    },
  ]

  const processed = cur.successful + cur.appExceptions + cur.bizExceptions
  const processedPrev = prev.successful + prev.appExceptions + prev.bizExceptions

  return (
    <>
      <div className="grid kpi-row">
        <StatTile
          label="Transactions processed"
          value={fmtCompact(processed)}
          current={processed}
          previous={processedPrev}
          refetching={isFetching}
        />
        <StatTile
          label="Success rate"
          value={isFinite(cur.successRate) ? fmtPct(cur.successRate) : '–'}
          current={cur.successRate}
          previous={prev.successRate}
          refetching={isFetching}
        />
        <StatTile
          label="App exceptions"
          value={fmtCompact(cur.appExceptions)}
          current={cur.appExceptions}
          previous={prev.appExceptions}
          upIsGood={false}
          refetching={isFetching}
        />
        <StatTile
          label="Business exceptions"
          value={fmtCompact(cur.bizExceptions)}
          current={cur.bizExceptions}
          previous={prev.bizExceptions}
          upIsGood={false}
          refetching={isFetching}
        />
        <StatTile
          label="Avg handling time"
          value={isFinite(cur.avgHandlingMs) ? fmtDuration(cur.avgHandlingMs) : '–'}
          current={cur.avgHandlingMs}
          previous={prev.avgHandlingMs}
          upIsGood={false}
          refetching={isFetching}
        />
        <StatTile label="Items pending" value={fmtCompact(cur.pending)} refetching={isFetching} />
      </div>

      <div className="grid two-col">
        <ChartCard title="Transaction volume" sub={`by outcome · per ${volume.unit}`} refetching={isFetching}>
          <StackedBarsChart data={volume.rows} series={series} height={250} />
        </ChartCard>
        <ChartCard title="Average handling time" sub="per processed item" refetching={isFetching}>
          <TrendLineChart
            data={handling.map((h) => ({ label: h.label, avgSec: h.avgMs !== null ? Math.round(h.avgMs / 1000) : null }))}
            dataKey="avgSec"
            name="Avg handling (s)"
            height={250}
            valueFmt={(v) => fmtDuration(v * 1000)}
          />
        </ChartCard>
      </div>

      <div className="grid">
        <ChartCard title="Queues" sub={`${queueRows.length} queues with activity in this window`} refetching={isFetching}>
          <DataTable
            columns={cols}
            rows={queueRows}
            initialSort={{ key: 'total', dir: 'desc' }}
            maxRows={25}
            emptyText="No queue activity in the selected window."
          />
        </ChartCard>
      </div>
    </>
  )
}
