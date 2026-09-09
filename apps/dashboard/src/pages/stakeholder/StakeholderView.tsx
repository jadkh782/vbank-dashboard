import { useMemo, useState } from 'react'
import {
  activityMatrix,
  buildStakeholderCards,
  categoryCounts,
  deDateTime,
  deHours,
  deInt,
  dePct,
  dePT,
  groupIssues,
  healthStrip,
  openPoints,
  overallHealth,
  runKpis,
  scorecard,
  timeSaved,
  txnKpis,
  volumeOverTime,
  type StakeholderCard,
} from '@vbank/shared'
import { ChartCard, HealthDot, StackedBarsChart, StatTile, useChartTheme } from '@vbank/ui'
import { useWindowData } from '../../data/useDashboardData'
import { useWindow } from '../../state/WindowContext'
import { AutomationTable } from './AutomationTable'
import { OutcomeStrip } from './OutcomeStrip'
import { DetailPanel } from './DetailPanel'
import { TimeSavedBars } from './TimeSavedBars'
import { ActivityHeatmap } from './ActivityHeatmap'
import { IssueList } from './IssueList'
import { CategorySplit } from './CategorySplit'
import { ColorLegend } from './ColorLegend'

type CardFilter = 'alle' | 'auffaellig'

export function StakeholderView() {
  const { from, to, folder } = useWindow()
  const { data, isLoading, isFetching, error } = useWindowData(from, to)
  const t = useChartTheme()
  const [cardFilter, setCardFilter] = useState<CardFilter>('alle')
  const [selected, setSelected] = useState<StakeholderCard | null>(null)

  // Bereich filter: restrict the automations, then every row follows.
  const scoped = useMemo(() => {
    if (!data) return null
    const automations = folder === 'all' ? data.automations : data.automations.filter((a) => a.folder === folder)
    const ids = new Set(automations.map((a) => a.id))
    const keep = <T extends { automationId: string | null }>(rows: T[]) =>
      folder === 'all' ? rows : rows.filter((r) => r.automationId !== null && ids.has(r.automationId))
    return {
      automations,
      runs: keep(data.runs),
      runsPrev: keep(data.runsPrev),
      txns: keep(data.txns),
      txnsPrev: keep(data.txnsPrev),
      manual: keep(data.manual),
      manualPrev: keep(data.manualPrev),
      settings: data.settings,
    }
  }, [data, folder])

  if (error) return <div className="error-banner">Datenabruf fehlgeschlagen: {error.message}</div>
  if (isLoading || !scoped) {
    return (
      <div className="state-block" style={{ paddingTop: 90 }}>
        <b>Daten werden geladen…</b>
      </div>
    )
  }

  const { automations, runs, runsPrev, txns, txnsPrev, manual, manualPrev, settings } = scoped
  const nameOf = (id: string) => automations.find((a) => a.id === id)?.displayName ?? id

  const qk = txnKpis(txns)
  const qkPrev = txnKpis(txnsPrev)
  const rk = runKpis(runs)
  const rkPrev = runKpis(runsPrev)

  // Correctly handled = successful + correctly routed out + not counted as an error.
  const successRate = qk.processed > 0 ? qk.successRate : rk.successRate
  const successRatePrev = qkPrev.processed > 0 ? qkPrev.successRate : rkPrev.successRate

  const rows = scorecard(automations, txns, manual)
  const saved = timeSaved(rows, settings.hoursPerPT)
  const savedConfigured = saved.filter((s) => s.savedHours !== null)
  const totalSavedH = savedConfigured.reduce((a, s) => a + (s.savedHours ?? 0), 0)
  const hoursPerPT = settings.hoursPerPT > 0 ? settings.hoursPerPT : 8

  const issues = openPoints(runs, txns, manual)
  const issuesPrev = openPoints(runsPrev, txnsPrev, manualPrev)
  const groups = groupIssues(issues)
  const counts = categoryCounts(issues)

  const allCards = buildStakeholderCards(automations, runs, txns, groups, manual, settings.thresholds)
  const { health, affected } = overallHealth(allCards)
  const totalRuntime = allCards.reduce((a, c) => a + c.runtimeHours, 0)
  const stripFor = (card: StakeholderCard) => healthStrip(card, runs, txns, from, to, settings.thresholds)

  const okCount = allCards.length - affected.length
  // The headline always leads with what is working: "30 von 34 laufen
  // störungsfrei", never "4 sind gestört". The traffic-light dot still carries
  // the severity and the sub-line names the open items, so nothing is hidden
  // by the positive framing — it is just stated the way a status report would.
  const headline =
    health === 'ok'
      ? 'Alle Automatisierungen laufen normal.'
      : okCount === 0
        ? 'Alle Automatisierungen haben derzeit offene Punkte.'
        : `${deInt(okCount)} von ${deInt(allCards.length)} Automatisierungen ${okCount === 1 ? 'läuft' : 'laufen'} störungsfrei.`

  const visibleCards = cardFilter === 'auffaellig' ? allCards.filter((c) => c.health !== 'ok') : allCards

  const failedNeustart = txns.filter((x) => x.outcome === 'failed' && x.category === 'neustartfaehig').length
  const outcomeSlices = [
    { label: 'Erfolgreich', value: qk.success + qk.ignored, color: t.outcome.erfolgreich },
    { label: 'Korrekt erkannte Aussteuerung', value: qk.businessExceptions, color: t.outcome.aussteuerung },
    { label: 'Nicht erfolgreich', value: qk.failed - failedNeustart, color: t.outcome.nichtErfolgreich },
    { label: 'Neustartfähige Vorgänge', value: failedNeustart, color: t.outcome.neustart },
  ]

  const volume = volumeOverTime(txns, from, to)
  const verlaufSeries = [
    { key: 'Korrekt verarbeitet', color: t.outcome.erfolgreich },
    { key: 'Nicht erfolgreich', color: t.outcome.nichtErfolgreich },
  ]
  const matrix = activityMatrix(txns)

  return (
    <>
      {/* 1 — the verdict */}
      <span className="section-eyebrow lede-eyebrow">
        <b>01</b> — Überblick
      </span>
      <section className={`stake-headline ${health}`}>
        <HealthDot health={health} />
        <div>
          <div className="stake-headline-text">{headline}</div>
          <div className="stake-headline-sub">
            Zeitraum {deDateTime(from)} – {deDateTime(to)} · {deInt(qk.processed)} Vorgänge bearbeitet ·{' '}
            {deInt(allCards.length)} Automatisierungen im Einsatz
            {affected.length > 0 && ` · ${deInt(affected.length)} mit offenen Punkten`}
          </div>
        </div>
      </section>

      {/* 2 — the numbers a decision rests on */}
      <div className="grid kpi-row">
        <StatTile
          label="Bearbeitete Vorgänge"
          value={deInt(qk.processed)}
          current={qk.processed}
          previous={qkPrev.processed}
          compareLabel="ggü. Vorperiode"
          refetching={isFetching}
        />
        <StatTile
          label="Korrekt verarbeitet"
          value={dePct(successRate)}
          current={successRate}
          previous={successRatePrev}
          compareLabel="ggü. Vorperiode"
          refetching={isFetching}
        />
        <StatTile label="Betriebsstunden" value={deHours(totalRuntime)} refetching={isFetching} />
        <StatTile
          label="Eingesparte Arbeitszeit"
          value={savedConfigured.length > 0 ? deHours(totalSavedH) : '–'}
          suffix={savedConfigured.length > 0 ? `= ${dePT(totalSavedH / hoursPerPT)}` : undefined}
          refetching={isFetching}
        />
        <a className="tile-link" href="#stoerungen">
          <StatTile
            label="Offene Punkte"
            value={deInt(issues.length)}
            current={issues.length}
            previous={issuesPrev.length}
            compareLabel="ggü. Vorperiode"
            upIsGood={false}
            refetching={isFetching}
          />
        </a>
      </div>

      {/* 3 — distribution as one slim line, doubling as the chart's key */}
      <OutcomeStrip slices={outcomeSlices} title="Ergebnisverteilung" correct={['Erfolgreich', 'Korrekt erkannte Aussteuerung']} />

      {/* 4 — the single hero chart */}
      <div className="grid">
        <ChartCard title="Verlauf" sub={`bearbeitete Vorgänge pro ${volume.unit === 'hour' ? 'Stunde' : 'Tag'}`} refetching={isFetching}>
          <StackedBarsChart data={volume.rows} series={verlaufSeries} height={260} valueFmt={(v) => deInt(v)} />
        </ChartCard>
      </div>

      {/* 5 — the centrepiece */}
      <div className="stake-section-head">
        <div>
          <span className="section-eyebrow">
            <b>02</b> — Bestand
          </span>
          <h2 className="stake-section-title">Alle Automatisierungen</h2>
        </div>
        <div className="stake-controls">
          <span className="card-sub">
            {affected.length > 0 ? `${deInt(okCount)} von ${deInt(allCards.length)} ohne Auffälligkeiten` : `${deInt(allCards.length)} Automatisierungen`}
          </span>
          <div className="seg">
            <button className={cardFilter === 'alle' ? 'active' : undefined} onClick={() => setCardFilter('alle')}>
              Alle
            </button>
            <button className={cardFilter === 'auffaellig' ? 'active' : undefined} onClick={() => setCardFilter('auffaellig')}>
              Mit offenen Punkten
            </button>
          </div>
        </div>
      </div>
      <div className={`card${isFetching ? ' refetching' : ''}`}>
        <AutomationTable cards={visibleCards} stripFor={stripFor} onOpen={setSelected} />
        <div className="card-sub" style={{ marginTop: 8 }}>
          Zeile anklicken für Details. Spalten sind sortierbar.
        </div>
      </div>

      {/* 6 — open points and who owns them, in one card */}
      <div className="stake-section-head" id="stoerungen">
        <div>
          <span className="section-eyebrow">
            <b>03</b> — Offene Punkte
          </span>
          <h2 className="stake-section-title">Offene Punkte &amp; Zuständigkeit</h2>
        </div>
        <div className="stake-controls">
          <span className="card-sub">
            {deInt(issues.length)} {issues.length === 1 ? 'offener Punkt' : 'offene Punkte'} im Zeitraum
          </span>
        </div>
      </div>
      <div className="grid">
        <div className="card">
          <div className={isFetching ? 'refetching' : undefined}>
            <CategorySplit counts={counts} businessExceptions={qk.businessExceptions} />
            {qk.recovered > 0 ? (
              <div className="cat-note">
                <b>{deInt(qk.recovered)}</b> Vorgänge wurden nach einem Neustart erfolgreich abgeschlossen — sie zählen als korrekt
                verarbeitet.
              </div>
            ) : null}
            {groups.length > 0 ? (
              <>
                <div className="panel-section-title" style={{ marginTop: 22 }}>
                  Häufigste Ursachen
                </div>
                <IssueList groups={groups.slice(0, 5)} nameOf={nameOf} />
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* 7 — supporting detail */}
      <div className="stake-section-head">
        <div>
          <span className="section-eyebrow">
            <b>04</b> — Wirkung
          </span>
          <h2 className="stake-section-title">Digitale Mitarbeiter Zeit</h2>
        </div>
      </div>
      <div className="grid two-col">
        <ChartCard title="Zeitersparnis" sub="manuelle Bearbeitung im Vergleich zur Automatisierung" refetching={isFetching}>
          <TimeSavedBars rows={saved} hoursPerPT={hoursPerPT} />
        </ChartCard>
        <ChartCard title="Wann die Automatisierungen arbeiten" sub="Vorgänge nach Wochentag und Uhrzeit" refetching={isFetching}>
          <ActivityHeatmap matrix={matrix} />
        </ChartCard>
      </div>

      <div className="grid">
        <ColorLegend />
      </div>

      {selected ? (
        <DetailPanel
          card={selected}
          automation={automations.find((a) => a.id === selected.automationId)}
          strip={stripFor(selected)}
          runs={runs}
          txns={txns}
          issueGroups={groups}
          manualErrors={manual}
          nameOf={nameOf}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  )
}
