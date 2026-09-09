import type { StakeholderCard, StripCell } from '@vbank/shared'
import { deDateTime, deHours, deInt, dePct, HEALTH_LABELS_DE } from '@vbank/shared'
import { DataTable, type Column } from '@vbank/ui'
import { MiniBar } from '@vbank/ui'
import { useChartTheme } from '@vbank/ui'
import { HealthDot } from '@vbank/ui'
import { StatusStrip } from './StatusStrip'
import { ResponsibilityBadge } from './Responsibility'

// One-word status for phones, where "benötigt Aufmerksamkeit" would not fit
// beside the name column. Swapped in by `.lbl-short` in global.css.
const HEALTH_SHORT_DE: Record<StakeholderCard['health'], string> = {
  ok: 'normal',
  attention: 'auffällig',
  critical: 'gestört',
}

/**
 * The one place to see what is happening: every automation is a row and every
 * column answers a decision question.
 */
export function AutomationTable({
  cards,
  stripFor,
  onOpen,
}: {
  cards: StakeholderCard[]
  stripFor: (card: StakeholderCard) => StripCell[]
  onOpen: (card: StakeholderCard) => void
}) {
  const t = useChartTheme()
  const maxRuntime = Math.max(0, ...cards.map((c) => c.runtimeHours))

  const columns: Column<StakeholderCard>[] = [
    {
      key: 'name',
      header: 'Automatisierung',
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
      header: 'Art',
      sortValue: (r) => r.kind,
      render: (r) => <span className="dim">{r.kind === 'process' ? 'Bot' : 'Warteschlange'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => ({ critical: 0, attention: 1, ok: 2 })[r.health],
      render: (r) => (
        <span className="tbl-status">
          <HealthDot health={r.health} />
          <span className="lbl-long">{HEALTH_LABELS_DE[r.health]}</span>
          <span className="lbl-short">{HEALTH_SHORT_DE[r.health]}</span>
        </span>
      ),
    },
    {
      key: 'runtime',
      header: 'Betriebsstunden',
      numeric: true,
      sortValue: (r) => r.runtimeHours,
      render: (r) => (
        <span className="tbl-metric">
          <MiniBar fraction={maxRuntime > 0 ? r.runtimeHours / maxRuntime : 0} color={t.accent} />
          {deHours(r.runtimeHours)}
        </span>
      ),
    },
    {
      key: 'volume',
      header: 'Vorgänge',
      shortHeader: 'Anzahl',
      numeric: true,
      sortValue: (r) => r.count,
      render: (r) => <span className="primary">{deInt(r.count)}</span>,
    },
    {
      key: 'quality',
      header: 'Korrekt verarbeitet',
      shortHeader: 'Korrekt',
      numeric: true,
      sortValue: (r) => (isFinite(r.successRate) ? r.successRate : -1),
      render: (r) =>
        isFinite(r.successRate) ? (
          <span className="tbl-metric">
            <MiniBar fraction={r.successRate / 100} color={t.state.Successful} />
            {dePct(r.successRate)}
          </span>
        ) : (
          '–'
        ),
    },
    {
      key: 'owner',
      header: 'Zuständig',
      sortValue: (r) => r.issueResponsibility ?? 'zzz',
      render: (r) =>
        r.issueResponsibility ? <ResponsibilityBadge who={r.issueResponsibility} /> : <span className="dim">–</span>,
    },
    {
      key: 'trend',
      header: 'Verlauf',
      render: (r) => (
        <span className="tbl-strip">
          <StatusStrip cells={stripFor(r)} />
        </span>
      ),
    },
    {
      key: 'last',
      header: 'Zuletzt aktiv',
      numeric: true,
      sortValue: (r) => r.lastActivity ?? '',
      render: (r) => <span className="dim">{r.lastActivity ? deDateTime(r.lastActivity) : '–'}</span>,
    },
  ]

  return (
    // lang drives `hyphens: auto` for long process names on phones.
    <div className="automation-table" lang="de">
      <DataTable
        columns={columns}
        rows={cards}
        initialSort={{ key: 'status', dir: 'asc' }}
        emptyText="Keine Aktivität im gewählten Zeitraum."
        onRowClick={onOpen}
        rowKey={(r) => r.key}
      />
    </div>
  )
}
