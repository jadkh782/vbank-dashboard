import {
  deDateTime,
  deDuration,
  deHours,
  deInt,
  dePct,
  HEALTH_LABELS_DE,
  type Automation,
  type IssueGroup,
  type ManualErrorRow,
  type Run,
  type StakeholderCard,
  type StripCell,
  type Txn,
} from '@vbank/shared'
import { CategoryBadge, Drawer, HealthDot, StackedBarsChart, useChartTheme } from '@vbank/ui'
import { StatusStrip } from './StatusStrip'
import { IssueList } from './IssueList'

function avgDurationMs(card: StakeholderCard, runs: Run[], txns: Txn[]): number {
  let sum = 0
  let n = 0
  if (card.kind === 'process') {
    for (const r of runs) {
      if (!r.startedAt || !r.endedAt) continue
      const d = new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()
      if (d >= 0) {
        sum += d
        n++
      }
    }
  } else {
    for (const t of txns) {
      if (t.processingMs === null) continue
      sum += t.processingMs
      n++
    }
  }
  return n > 0 ? sum / n : NaN
}

export function DetailPanel({
  card,
  automation,
  strip,
  runs,
  txns,
  issueGroups,
  manualErrors,
  nameOf,
  onClose,
}: {
  card: StakeholderCard
  automation: Automation | undefined
  strip: StripCell[]
  runs: Run[]
  txns: Txn[]
  issueGroups: IssueGroup[]
  manualErrors: ManualErrorRow[]
  nameOf: (automationId: string) => string
  onClose: () => void
}) {
  const t = useChartTheme()
  const ownRuns = runs.filter((r) => r.automationId === card.automationId)
  const ownTxns = txns.filter((x) => x.automationId === card.automationId)
  const ownGroups = issueGroups.filter((g) => g.automationIds.includes(card.automationId)).sort((a, b) => b.count - a.count)
  const ownManual = manualErrors.filter((m) => m.automationId === card.automationId)

  const trendRows = strip.map((c) => ({
    label: c.label,
    Erfolgreich: c.successful,
    'Nicht erfolgreich': c.total - c.successful,
  }))
  const trendSeries = [
    { key: 'Erfolgreich', color: t.ok },
    { key: 'Nicht erfolgreich', color: t.bad },
  ]

  const avg = avgDurationMs(card, ownRuns, ownTxns)
  const humanMinutes = card.kind === 'queue' ? automation?.humanMinutesPerItem ?? null : null
  const botHours = ownTxns.reduce((a, x) => a + (x.processingMs ?? 0), 0) / 3600_000

  return (
    <Drawer titleId="detail-panel-title" focusKey={card.key} onClose={onClose}>
      <header className="panel-head">
        <div>
          <div className="panel-kicker">{card.area}</div>
          <h2 id="detail-panel-title" className="panel-title">
            {card.displayName}
          </h2>
          {card.description ? <div className="panel-desc">{card.description}</div> : null}
          <div className="panel-status">
            <HealthDot health={card.health} />
            {HEALTH_LABELS_DE[card.health]}
            {card.issueCategory ? (
              <>
                <span className="dim">·</span>
                <span className="dim">zuständig:</span>
                <CategoryBadge category={card.issueCategory} />
              </>
            ) : null}
          </div>
        </div>
        <button className="panel-close" onClick={onClose} aria-label="Schließen">
          ×
        </button>
      </header>

      <div className="panel-body">
        <section>
          <div className="panel-section-title">Verlauf</div>
          <StatusStrip cells={strip} large />
          <div style={{ marginTop: 14 }}>
            <StackedBarsChart data={trendRows} series={trendSeries} height={200} valueFmt={(v) => deInt(v)} />
          </div>
        </section>

        <section>
          <div className="panel-section-title">Kennzahlen</div>
          <div className="panel-figures">
            <div>
              <span className="dim">{card.countLabel}</span>
              <b>{deInt(card.count)}</b>
            </div>
            <div>
              <span className="dim">Korrekt verarbeitet</span>
              <b>{dePct(card.successRate)}</b>
            </div>
            <div>
              <span className="dim">{card.kind === 'process' ? 'Ø Dauer je Lauf' : 'Ø Dauer je Vorgang'}</span>
              <b>{deDuration(avg)}</b>
            </div>
            <div>
              <span className="dim">Zuletzt aktiv</span>
              <b>{card.lastActivity ? deDateTime(card.lastActivity) : '–'}</b>
            </div>
            {card.kind === 'queue' ? (
              <div>
                <span className="dim">Nach Neustart erfolgreich</span>
                <b>{deInt(card.recovered)}</b>
              </div>
            ) : null}
            {humanMinutes ? (
              <div>
                <span className="dim">Eingesparte Zeit</span>
                <b>{deHours((card.count * humanMinutes) / 60 - botHours)}</b>
              </div>
            ) : null}
          </div>
        </section>

        <section>
          <div className="panel-section-title">Ursachen</div>
          <IssueList
            groups={ownGroups}
            nameOf={nameOf}
            showProcesses={false}
            emptyText="Keine offenen Punkte für diese Automatisierung im gewählten Zeitraum."
          />
        </section>

        {ownManual.length > 0 ? (
          <section>
            <div className="panel-section-title">Gemeldete IT-Störungen</div>
            {ownManual.map((m) => (
              <div className="panel-manual" key={m.id}>
                <div className="primary">
                  <CategoryBadge category={m.category} /> · {deDateTime(m.occurredAt)}
                </div>
                <div>{m.description}</div>
                {m.downtimeMinutes !== null ? <div className="dim">Ausfallzeit {deInt(m.downtimeMinutes)} Min.</div> : null}
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </Drawer>
  )
}
