import { deInt, ISSUE_KIND_LABELS_DE, type IssueGroup } from '@vbank/shared'
import { CategoryBadge, useChartTheme } from '@vbank/ui'

export function IssueList({
  groups,
  nameOf,
  showProcesses = true,
  emptyText = 'Keine offenen Punkte im gewählten Zeitraum.',
}: {
  groups: IssueGroup[]
  nameOf: (automationId: string) => string
  showProcesses?: boolean
  emptyText?: string
}) {
  const t = useChartTheme()
  if (groups.length === 0) return <div className="state-block">{emptyText}</div>

  return (
    <div className="stake-issues">
      {groups.map((g) => (
        <div className="stake-issue-row" key={g.key}>
          <span className="stake-issue-count">
            <span className="dot" style={{ background: g.category ? t.category[g.category] : t.axisInk }} />
            {deInt(g.count)}×
          </span>
          <div>
            <div className="primary">
              {ISSUE_KIND_LABELS_DE[g.kind]}
              {showProcesses && g.automationIds.length > 0 ? (
                <>
                  {' bei '}
                  {g.automationIds.slice(0, 2).map(nameOf).join(', ')}
                  {g.automationIds.length > 2 ? ` und ${g.automationIds.length - 2} weiteren` : ''}
                </>
              ) : null}
            </div>
            {g.family ? (
              <div className="dim" style={{ overflowWrap: 'anywhere' }}>
                {g.family}
              </div>
            ) : null}
            {g.category ? (
              <div style={{ marginTop: 4 }}>
                <CategoryBadge category={g.category} />
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
