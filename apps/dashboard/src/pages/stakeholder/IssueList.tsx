import type { AppSettings } from '../../api/store'
import type { ErrorGroup } from '@vbank/shared'
import { deInt, friendlyName, SOURCE_LABELS_DE } from '@vbank/shared'
import { useChartTheme } from '@vbank/ui'
import { ResponsibilityBadge } from './Responsibility'

export function IssueList({
  groups,
  settings,
  showProcesses = true,
  emptyText = 'Keine offenen Punkte im gewählten Zeitraum.',
}: {
  groups: ErrorGroup[]
  settings: AppSettings
  showProcesses?: boolean
  emptyText?: string
}) {
  const t = useChartTheme()
  if (groups.length === 0) return <div className="state-block">{emptyText}</div>

  return (
    <div className="stake-issues">
      {groups.map((g, i) => (
        <div className="stake-issue-row" key={i}>
          <span className="stake-issue-count">
            <span className="dot" style={{ background: t.errorSource[g.source] }} />
            {deInt(g.count)}×
          </span>
          <div>
            <div className="primary">
              {SOURCE_LABELS_DE[g.source]}
              {showProcesses ? (
                <>
                  {' bei '}
                  {g.processes
                    .slice(0, 2)
                    .map((p) => friendlyName(p, settings))
                    .join(', ')}
                  {g.processes.length > 2 ? ` und ${g.processes.length - 2} weiteren` : ''}
                </>
              ) : null}
            </div>
            <div className="dim" style={{ overflowWrap: 'anywhere' }}>
              {g.message}
            </div>
            <div style={{ marginTop: 4 }}>
              <ResponsibilityBadge who={g.responsibility} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
