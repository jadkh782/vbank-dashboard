import { usePageData } from '../hooks/usePageData'
import { useTenantData } from '../hooks/useOrchestrator'
import { useFilters } from '../state/FilterContext'
import {
  concurrencyOverTime,
  idleRuns,
  jobKpis,
  scorecard,
  timeSaved,
  type ScorecardRow,
  type TimeSavedRow,
} from '../lib/aggregate'
import { ChartCard, TrendLineChart } from '../components/charts/ChartKit'
import { DataTable, type Column } from '../components/ui/DataTable'
import { StatTile } from '../components/ui/StatTile'
import { useChartTheme } from '../theme'
import { fmtCompact, fmtDateTime, fmtDuration, fmtHours, fmtInt, fmtPct, fmtPT } from '../lib/format'

function CountPct({ count, total, strong }: { count: number; total: number; strong?: boolean }) {
  return (
    <>
      <div className={strong ? 'primary' : undefined}>{fmtInt(count)}</div>
      <div className="dim">{total > 0 ? fmtPct((count / total) * 100) : '–'}</div>
    </>
  )
}

export function Kennzahlen() {
  const { page, isFetching, settings } = usePageData()
  const { data } = useTenantData()
  const { from, to } = useFilters()
  const t = useChartTheme()
  if (!page || !data) return null

  const rows = scorecard(data, page.queueItems, page.manualErrors, settings)
  const rowsPrev = scorecard(data, page.queueItemsPrev, page.manualErrorsPrev, settings)
  const saved = timeSaved(rows, settings)
  const savedPrev = timeSaved(rowsPrev, settings)
  const runs = jobKpis(page.jobs)
  const runsPrev = jobKpis(page.jobsPrev)
  const idle = idleRuns(page.jobs, page.queueItems)
  const idlePrev = idleRuns(page.jobsPrev, page.queueItemsPrev)
  const conc = concurrencyOverTime(page.jobs, from, to)

  const totals = rows.reduce(
    (a, r) => ({
      items: a.items + r.items,
      botHours: a.botHours + r.botHours,
      manual: a.manual + r.manual,
    }),
    { items: 0, botHours: 0, manual: 0 },
  )
  const totalsPrev = rowsPrev.reduce((a, r) => a + r.items, 0)

  const configured = saved.filter((s) => s.savedHours !== null)
  const totalSavedH = configured.reduce((a, s) => a + (s.savedHours ?? 0), 0)
  const totalSavedHPrev = savedPrev
    .filter((s) => s.savedHours !== null)
    .reduce((a, s) => a + (s.savedHours ?? 0), 0)
  const totalHumanH = configured.reduce((a, s) => a + (s.humanHours ?? 0), 0)
  const hoursPerPT = settings.hoursPerPT > 0 ? settings.hoursPerPT : 8

  const capacity = settings.licenseCapacity ?? data.license?.allowed ?? null

  const scoreCols: Column<ScorecardRow>[] = [
    {
      key: 'queue',
      header: 'Queue / Bot',
      sortValue: (r) => r.queue,
      render: (r) => (
        <>
          <span className="primary">{r.queue}</span>
          <div className="dim">{r.folder}</div>
        </>
      ),
    },
    {
      key: 'dur',
      header: 'Ø Item duration',
      numeric: true,
      sortValue: (r) => (isFinite(r.avgHandlingMs) ? r.avgHandlingMs : -1),
      render: (r) => fmtDuration(r.avgHandlingMs),
    },
    { key: 'items', header: 'Items', numeric: true, sortValue: (r) => r.items, render: (r) => <span className="primary">{fmtInt(r.items)}</span> },
    {
      key: 'ok',
      header: 'Successful',
      numeric: true,
      sortValue: (r) => r.successful,
      render: (r) => <CountPct count={r.successful} total={r.items} />,
    },
    {
      key: 'sys',
      header: 'AppEx System',
      numeric: true,
      sortValue: (r) => r.appExSystem,
      render: (r) => <CountPct count={r.appExSystem} total={r.items} />,
    },
    {
      key: 'bot',
      header: 'AppEx Bot',
      numeric: true,
      sortValue: (r) => r.appExBot,
      render: (r) => <CountPct count={r.appExBot} total={r.items} />,
    },
    {
      key: 'man',
      header: 'Manual (IT)',
      numeric: true,
      sortValue: (r) => r.manual,
      render: (r) => fmtInt(r.manual),
    },
    {
      key: 'biz',
      header: 'BusinessEx (Aussteuerung)',
      numeric: true,
      sortValue: (r) => r.businessEx,
      render: (r) => <CountPct count={r.businessEx} total={r.items} />,
    },
  ]

  const savedCols: Column<TimeSavedRow>[] = [
    { key: 'queue', header: 'Queue', sortValue: (r) => r.queue, render: (r) => <span className="primary">{r.queue}</span> },
    { key: 'items', header: 'Items', numeric: true, sortValue: (r) => r.items, render: (r) => fmtInt(r.items) },
    {
      key: 'perItem',
      header: 'Human min/item',
      numeric: true,
      sortValue: (r) => r.humanMinutesPerItem ?? -1,
      render: (r) => (r.humanMinutesPerItem !== null ? `${r.humanMinutesPerItem} min` : <span className="dim">not set</span>),
    },
    {
      key: 'human',
      header: 'Human time',
      numeric: true,
      sortValue: (r) => r.humanHours ?? -1,
      render: (r) => (r.humanHours !== null ? fmtHours(r.humanHours) : '–'),
    },
    { key: 'bot', header: 'Bot time', numeric: true, sortValue: (r) => r.botHours, render: (r) => fmtHours(r.botHours) },
    {
      key: 'savedH',
      header: 'Saved',
      numeric: true,
      sortValue: (r) => r.savedHours ?? -Infinity,
      render: (r) => (r.savedHours !== null ? fmtHours(r.savedHours) : '–'),
    },
    {
      key: 'savedPT',
      header: 'Saved PT',
      numeric: true,
      sortValue: (r) => r.savedPT ?? -Infinity,
      render: (r) => (r.savedPT !== null ? fmtPT(r.savedPT) : '–'),
    },
    {
      key: 'savedPct',
      header: 'Saved %',
      numeric: true,
      sortValue: (r) => r.savedPct ?? -Infinity,
      render: (r) => (r.savedPct !== null ? fmtPct(r.savedPct) : '–'),
    },
  ]

  const idleCols: Column<{ name: string; runs: number; idle: number }>[] = [
    { key: 'name', header: 'Process', sortValue: (r) => r.name, render: (r) => <span className="primary">{r.name}</span> },
    { key: 'runs', header: 'Successful runs', numeric: true, sortValue: (r) => r.runs, render: (r) => fmtInt(r.runs) },
    { key: 'idle', header: 'Leerläufe', numeric: true, sortValue: (r) => r.idle, render: (r) => fmtInt(r.idle) },
    {
      key: 'pct',
      header: 'Idle rate',
      numeric: true,
      sortValue: (r) => (r.runs > 0 ? r.idle / r.runs : 0),
      render: (r) => (r.runs > 0 ? fmtPct((r.idle / r.runs) * 100) : '–'),
    },
  ]

  return (
    <>
      <div className="grid kpi-row">
        <StatTile
          label="Transaction items"
          value={fmtCompact(totals.items)}
          current={totals.items}
          previous={totalsPrev}
          refetching={isFetching}
        />
        <StatTile
          label="Bot processing time"
          value={fmtHours(totals.botHours)}
          suffix={`= ${fmtPT(totals.botHours / hoursPerPT)}`}
          refetching={isFetching}
        />
        <StatTile
          label="Zeitersparnis"
          value={configured.length > 0 ? fmtHours(totalSavedH) : '–'}
          suffix={configured.length > 0 ? `= ${fmtPT(totalSavedH / hoursPerPT)}` : undefined}
          current={configured.length > 0 ? totalSavedH : undefined}
          previous={configured.length > 0 ? totalSavedHPrev : undefined}
          refetching={isFetching}
        />
        <StatTile
          label="Bot runs"
          value={fmtCompact(runs.total)}
          suffix={`${fmtInt(runs.faulted)} faulted`}
          current={runs.total}
          previous={runsPrev.total}
          refetching={isFetching}
        />
        <StatTile
          label="Leerläufe (idle runs)"
          value={isFinite(idle.idlePct) ? fmtPct(idle.idlePct) : '–'}
          suffix={`${fmtInt(idle.idleRuns)} of ${fmtInt(idle.consideredRuns)}`}
          current={idle.idlePct}
          previous={idlePrev.idlePct}
          upIsGood={false}
          refetching={isFetching}
        />
        <StatTile
          label="Peak concurrent bots"
          value={fmtInt(conc.peak)}
          suffix={capacity !== null ? `of ${capacity} licenses` : undefined}
          refetching={isFetching}
        />
      </div>

      <div className="grid">
        <ChartCard
          title="Transaction scorecard"
          sub="per queue · counts with share of items"
          refetching={isFetching}
        >
          <DataTable
            columns={scoreCols}
            rows={rows}
            initialSort={{ key: 'items', dir: 'desc' }}
            emptyText="No queue activity or manual entries in the selected window."
          />
        </ChartCard>
      </div>

      <div className="grid">
        <ChartCard
          title="Zeitersparnis — bot vs. human processing"
          sub={
            configured.length > 0
              ? `human equivalent ${fmtHours(totalHumanH)} vs. bot ${fmtHours(totals.botHours)} · 1 PT = ${hoursPerPT} h`
              : `set human minutes-per-item in Settings to activate this comparison · 1 PT = ${hoursPerPT} h`
          }
          refetching={isFetching}
        >
          <DataTable
            columns={savedCols}
            rows={saved}
            initialSort={{ key: 'items', dir: 'desc' }}
            emptyText="No processed transactions in the selected window."
          />
        </ChartCard>
      </div>

      <div className="grid main-side">
        <ChartCard
          title="Roboterauslastung — Belastungsspitzen"
          sub={`max concurrent running jobs · per ${conc.unit}${conc.peakTime ? ` · peak ${fmtInt(conc.peak)} at ${fmtDateTime(conc.peakTime)}` : ''}`}
          refetching={isFetching}
        >
          <TrendLineChart
            data={conc.rows}
            dataKey="active"
            name="Concurrent jobs"
            height={240}
            lineType="stepAfter"
            valueFmt={(v) => fmtInt(v)}
            domain={[0, capacity !== null ? Math.max(capacity, conc.peak) : 'auto']}
          />
          <div className="card-sub" style={{ marginTop: 6 }}>
            {capacity !== null ? (
              <>
                Capacity: {capacity} unattended license{capacity === 1 ? '' : 's'}
                {data.license?.used !== null && data.license?.used !== undefined
                  ? ` (${data.license.used} allocated in Orchestrator)`
                  : ''}
                {' · '}peak utilization {fmtPct((conc.peak / capacity) * 100, 0)}
              </>
            ) : (
              'No license capacity known — set it in Settings (or grant the license read scope) to see utilization %.'
            )}
          </div>
        </ChartCard>
        <ChartCard
          title="Operative Verfügbarkeit — Leerläufe"
          sub="successful runs that processed no queue items (folder-based heuristic)"
          refetching={isFetching}
        >
          <DataTable
            columns={idleCols}
            rows={idle.byProcess}
            initialSort={{ key: 'idle', dir: 'desc' }}
            emptyText="No successful runs in the selected window."
          />
        </ChartCard>
      </div>
    </>
  )
}
