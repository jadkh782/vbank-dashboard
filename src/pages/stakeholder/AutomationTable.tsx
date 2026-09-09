import type { StakeholderCard, StripCell } from '../../lib/health'
import { deDateTime, deHours, deInt, dePct, HEALTH_LABELS_DE } from '../../lib/health'
import { fmtDateTime, fmtDuration, fmtInt, fmtPct } from '../../lib/format'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { MiniBar } from '../../components/ui/Badges'
import { useChartTheme } from '../../theme'
import { HealthDot } from './Health'
import { StatusStrip } from './StatusStrip'
import { ResponsibilityBadge } from './Responsibility'

const HEALTH_LABELS_EN: Record<StakeholderCard['health'], string> = {
  ok: 'healthy',
  attention: 'needs attention',
  critical: 'disrupted',
}

// One-word status for phones, where "benötigt Aufmerksamkeit" would not fit
// beside the name column. Swapped in by `.lbl-short` in global.css.
const HEALTH_SHORT_DE: Record<StakeholderCard['health'], string> = {
  ok: 'normal',
  attention: 'auffällig',
  critical: 'gestört',
}
const HEALTH_SHORT_EN: Record<StakeholderCard['health'], string> = {
  ok: 'healthy',
  attention: 'attention',
  critical: 'disrupted',
}

const L = {
  de: {
    name: 'Automatisierung',
    kind: 'Art',
    status: 'Status',
    runtime: 'Betriebsstunden',
    volume: 'Vorgänge',
    quality: 'Korrekt verarbeitet',
    owner: 'Zuständig',
    trend: 'Verlauf',
    last: 'Zuletzt aktiv',
    bot: 'Bot',
    queue: 'Warteschlange',
    empty: 'Keine Aktivität im gewählten Zeitraum.',
  },
  en: {
    name: 'Automation',
    kind: 'Type',
    status: 'Status',
    runtime: 'Runtime',
    volume: 'Runs / Items',
    quality: 'Success rate',
    owner: 'Owner',
    trend: 'Trend',
    last: 'Last activity',
    bot: 'Process',
    queue: 'Queue',
    empty: 'No activity in the selected window.',
  },
}

/**
 * The one place to see what is happening: every automation is a row and every
 * column answers a decision question. Shared by the stakeholder view (German)
 * and the technical Overview (English) via `lang`.
 */
export function AutomationTable({
  cards,
  stripFor,
  onOpen,
  lang = 'de',
}: {
  cards: StakeholderCard[]
  stripFor: (card: StakeholderCard) => StripCell[]
  onOpen: (card: StakeholderCard) => void
  lang?: 'de' | 'en'
}) {
  const t = useChartTheme()
  const s = L[lang]
  const de = lang === 'de'
  const maxRuntime = Math.max(0, ...cards.map((c) => c.runtimeHours))

  const hours = (h: number) =>
    de ? deHours(h) : `${h.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`
  const int = de ? deInt : fmtInt
  const pct = de ? dePct : (v: number) => fmtPct(v)
  const when = de ? deDateTime : fmtDateTime

  const columns: Column<StakeholderCard>[] = [
    {
      key: 'name',
      header: s.name,
      shortHeader: 'Name',
      sortValue: (r) => r.displayName,
      render: (r) => (
        <>
          <span className="primary">{r.displayName}</span>
          <div className="dim">{r.area}</div>
        </>
      ),
    },
    {
      key: 'kind',
      header: s.kind,
      sortValue: (r) => r.kind,
      render: (r) => <span className="dim">{r.kind === 'process' ? s.bot : s.queue}</span>,
    },
    {
      key: 'status',
      header: s.status,
      sortValue: (r) => ({ critical: 0, attention: 1, ok: 2 })[r.health],
      render: (r) => (
        <span className="tbl-status">
          <HealthDot health={r.health} />
          <span className="lbl-long">{de ? HEALTH_LABELS_DE[r.health] : HEALTH_LABELS_EN[r.health]}</span>
          <span className="lbl-short">{de ? HEALTH_SHORT_DE[r.health] : HEALTH_SHORT_EN[r.health]}</span>
        </span>
      ),
    },
    {
      key: 'runtime',
      header: s.runtime,
      numeric: true,
      sortValue: (r) => r.runtimeHours,
      render: (r) => (
        <span className="tbl-metric">
          <MiniBar fraction={maxRuntime > 0 ? r.runtimeHours / maxRuntime : 0} color={t.accent} />
          {hours(r.runtimeHours)}
        </span>
      ),
    },
    {
      key: 'volume',
      header: s.volume,
      shortHeader: de ? 'Anzahl' : 'Count',
      numeric: true,
      sortValue: (r) => r.count,
      render: (r) => <span className="primary">{int(r.count)}</span>,
    },
    {
      key: 'quality',
      header: s.quality,
      shortHeader: de ? 'Korrekt' : 'Success',
      numeric: true,
      sortValue: (r) => (isFinite(r.successRate) ? r.successRate : -1),
      render: (r) =>
        isFinite(r.successRate) ? (
          <span className="tbl-metric">
            <MiniBar fraction={r.successRate / 100} color={t.state.Successful} />
            {pct(r.successRate)}
          </span>
        ) : (
          '–'
        ),
    },
    {
      key: 'owner',
      header: s.owner,
      sortValue: (r) => r.issueResponsibility ?? 'zzz',
      render: (r) => (r.issueResponsibility ? <ResponsibilityBadge who={r.issueResponsibility} /> : <span className="dim">–</span>),
    },
    {
      key: 'trend',
      header: s.trend,
      render: (r) => (
        <span className="tbl-strip">
          <StatusStrip cells={stripFor(r)} />
        </span>
      ),
    },
    {
      key: 'last',
      header: s.last,
      numeric: true,
      sortValue: (r) => r.lastActivity ?? '',
      render: (r) => <span className="dim">{r.lastActivity ? when(r.lastActivity) : '–'}</span>,
    },
  ]

  // Technical view additionally wants average duration per run.
  if (!de) {
    columns.splice(5, 0, {
      key: 'avg',
      header: 'Ø per run',
      numeric: true,
      sortValue: (r) => (r.count > 0 ? (r.runtimeHours * 3600_000) / r.count : -1),
      render: (r) => (r.count > 0 ? fmtDuration((r.runtimeHours * 3600_000) / r.count) : '–'),
    })
  }

  return (
    // lang drives `hyphens: auto` for long process names on phones.
    <div className="automation-table" lang={lang}>
      <DataTable
        columns={columns}
        rows={cards}
        initialSort={{ key: 'status', dir: 'asc' }}
        emptyText={s.empty}
        onRowClick={onOpen}
        rowKey={(r) => r.key}
      />
    </div>
  )
}
