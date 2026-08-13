import { useMemo, useState } from 'react'
import { usePageData } from '../../hooks/usePageData'
import { useTenantData } from '../../hooks/useOrchestrator'
import { useFilters } from '../../state/FilterContext'
import {
  activityMatrix,
  inWindow,
  jobKpis,
  previousWindow,
  queueKpis,
  queueVolumeOverTime,
  scorecard,
  timeSaved,
} from '../../lib/aggregate'
import { collectErrors, groupErrors } from '../../lib/errors'
import {
  buildStakeholderCards,
  deDateTime,
  deHours,
  deInt,
  dePct,
  dePT,
  healthStrip,
  overallHealth,
  queueIdsByName,
  type StakeholderCard,
} from '../../lib/health'
import { StatTile } from '../../components/ui/StatTile'
import { ChartCard, StackedBarsChart } from '../../components/charts/ChartKit'
import { useThemeMode } from '../../theme'
import { HealthDot } from './Health'
import { AutomationTable } from './AutomationTable'
import { OutcomeStrip } from './OutcomeStrip'
import { DetailPanel } from './DetailPanel'
import { TimeSavedBars } from './TimeSavedBars'
import { ActivityHeatmap } from './ActivityHeatmap'
import { IssueList } from './IssueList'
import { ResponsibilitySplit } from './Responsibility'
import { ColorLegend } from './ColorLegend'

type CardFilter = 'alle' | 'auffaellig'

/**
 * Outcome palette for the stakeholder view. The order Erfolgreich → Aussteuerung
 * → Nicht erfolgreich → Prozessfehler is the one the colour-vision validator
 * clears in both themes (green must not neighbour a warm hue; violet must not
 * neighbour blue), so keep these adjacent positions if you edit it.
 */
export function useOutcomeColors() {
  const { mode } = useThemeMode()
  return mode === 'dark'
    ? {
        erfolgreich: '#22c55e',
        aussteuerung: '#60a5fa',
        nichtErfolgreich: '#f59e0b',
        prozessfehler: '#a78bfa',
      }
    : {
        erfolgreich: '#16a34a',
        aussteuerung: '#3b82f6',
        nichtErfolgreich: '#d97706',
        prozessfehler: '#7c3aed',
      }
}

export function StakeholderView({ onShowTechnical }: { onShowTechnical: () => void }) {
  const { data, isFetching } = useTenantData()
  const { page, settings } = usePageData()
  const { from, to } = useFilters()
  const OUTCOME_COLORS = useOutcomeColors()

  const [cardFilter, setCardFilter] = useState<CardFilter>('alle')
  const [selected, setSelected] = useState<StakeholderCard | null>(null)

  const prev = previousWindow(from, to)
  // The stakeholder view has no job-status chips, so it works off all jobs.
  const jobs = useMemo(
    () => (data ? inWindow(data.jobs, (j) => j.CreationTime, from, to) : []),
    [data, from, to],
  )
  const jobsPrev = useMemo(
    () => (data ? inWindow(data.jobs, (j) => j.CreationTime, prev.from, prev.to) : []),
    [data, prev.from, prev.to],
  )
  const idsByName = useMemo(() => (data ? queueIdsByName(data) : new Map()), [data])

  if (!data || !page) return null

  const qk = queueKpis(page.queueItems)
  const qkPrev = queueKpis(page.queueItemsPrev)
  const jk = jobKpis(jobs)
  const jkPrev = jobKpis(jobsPrev)

  const processed = qk.successful + qk.appExceptions + qk.bizExceptions
  const processedPrev = qkPrev.successful + qkPrev.appExceptions + qkPrev.bizExceptions
  // Correctly routed-out items count as correctly handled — same definition as
  // the table rows and the status strips, so every figure agrees.
  const successRate =
    processed > 0 ? ((qk.successful + qk.bizExceptions) / processed) * 100 : jk.successRate
  const successRatePrev =
    processedPrev > 0
      ? ((qkPrev.successful + qkPrev.bizExceptions) / processedPrev) * 100
      : jkPrev.successRate

  const rows = scorecard(data, page.queueItems, page.manualErrors, settings)
  const saved = timeSaved(rows, settings)
  const savedConfigured = saved.filter((s) => s.savedHours !== null)
  const totalSavedH = savedConfigured.reduce((a, s) => a + (s.savedHours ?? 0), 0)
  const hoursPerPT = settings.hoursPerPT > 0 ? settings.hoursPerPT : 8

  const allOccurrences = collectErrors(
    jobs,
    page.queueItems,
    page.queueNames,
    page.manualErrors,
    settings.systemKeywords,
  )
  const allOccurrencesPrev = collectErrors(
    jobsPrev,
    page.queueItemsPrev,
    page.queueNames,
    page.manualErrorsPrev,
    settings.systemKeywords,
  )
  // Correctly routed-out items are a valid outcome, not a Störung.
  const occurrences = allOccurrences.filter((o) => o.responsibility !== 'business')
  const occurrencesPrev = allOccurrencesPrev.filter((o) => o.responsibility !== 'business')
  const groups = groupErrors(occurrences)

  const responsibilityCounts = {
    it: allOccurrences.filter((o) => o.responsibility === 'it').length,
    automation: allOccurrences.filter((o) => o.responsibility === 'automation').length,
    business: allOccurrences.filter((o) => o.responsibility === 'business').length,
  }

  const allCards = buildStakeholderCards(data, jobs, rows, groups, page.manualErrors, settings)
  const { health, affected } = overallHealth(allCards)
  const totalRuntime = allCards.reduce((a, c) => a + c.runtimeHours, 0)

  const stripFor = (card: StakeholderCard) =>
    healthStrip(card, jobs, page.queueItems, idsByName, from, to, settings.healthThresholds)

  const criticalCount = affected.filter((c) => c.health === 'critical').length
  const okCount = allCards.length - affected.length
  // The headline leads with the result, and the result is normally the good
  // one: only a genuine Störung is stated as a problem. Anything milder reads
  // as "n of m ran successfully", with the open items named in the sub-line
  // below so nothing is hidden by the positive framing.
  const headline =
    health === 'ok'
      ? 'Alle Automatisierungen laufen normal.'
      : health === 'critical'
        ? `${deInt(criticalCount)} von ${deInt(allCards.length)} Prozessen ${
            criticalCount === 1 ? 'ist gestört.' : 'sind gestört.'
          }`
        : `${deInt(okCount)} von ${deInt(allCards.length)} Prozessen ${
            okCount === 1 ? 'ist erfolgreich gelaufen.' : 'sind erfolgreich gelaufen.'
          }`

  const visibleCards =
    cardFilter === 'auffaellig' ? allCards.filter((c) => c.health !== 'ok') : allCards

  const outcomeSlices = [
    { label: 'Erfolgreich', value: qk.successful, color: OUTCOME_COLORS.erfolgreich },
    { label: 'Korrekt erkannte Aussteuerung', value: qk.bizExceptions, color: OUTCOME_COLORS.aussteuerung },
    {
      label: 'Nicht erfolgreich',
      value: occurrences.filter((o) => o.source === 'App exception (system)').length,
      color: OUTCOME_COLORS.nichtErfolgreich,
    },
    {
      label: 'Prozessfehler',
      value: occurrences.filter((o) => o.source === 'App exception (bot)').length,
      color: OUTCOME_COLORS.prozessfehler,
    },
  ]

  const volume = queueVolumeOverTime(page.queueItems, from, to)
  // A correctly recognised routing-out is a correct outcome, so the trend
  // carries it inside the green band rather than as a colour of its own —
  // the bar then reads directly as "how much went right that day".
  const verlaufRows = volume.rows.map((r) => ({
    label: r.label,
    'Korrekt verarbeitet':
      ((r['Successful'] as number) ?? 0) + ((r['Business exception'] as number) ?? 0),
    'Nicht erfolgreich': (r['App exception'] as number) ?? 0,
  }))
  const verlaufSeries = [
    { key: 'Korrekt verarbeitet', color: OUTCOME_COLORS.erfolgreich },
    { key: 'Nicht erfolgreich', color: OUTCOME_COLORS.nichtErfolgreich },
  ]

  const matrix = activityMatrix(page.queueItems)

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
            Zeitraum {deDateTime(from)} – {deDateTime(to)} · {deInt(processed)} Vorgänge bearbeitet ·{' '}
            {deInt(allCards.length)} Automatisierungen im Einsatz
            {affected.length > 0 &&
              ` · ${deInt(affected.length)} ${
                affected.length === 1 ? 'benötigt' : 'benötigen'
              } Aufmerksamkeit`}
          </div>
        </div>
      </section>

      {/* 2 — the numbers a decision rests on */}
      <div className="grid kpi-row">
        <StatTile
          label="Bearbeitete Vorgänge"
          value={deInt(processed)}
          current={processed}
          previous={processedPrev}
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
            label="Offene Störungen"
            value={deInt(occurrences.length)}
            current={occurrences.length}
            previous={occurrencesPrev.length}
            compareLabel="ggü. Vorperiode"
            upIsGood={false}
            refetching={isFetching}
          />
        </a>
      </div>

      {/* 3 — distribution as one slim line, doubling as the chart's key */}
      {/* Erfolgreich and Aussteuerung are both correct outcomes — the header
          states their sum so the split below never reads as 88 % success. */}
      <OutcomeStrip
        slices={outcomeSlices}
        title="Ergebnisverteilung"
        correct={['Erfolgreich', 'Korrekt erkannte Aussteuerung']}
      />

      {/* 4 — the single hero chart */}
      <div className="grid">
        <ChartCard
          title="Verlauf"
          sub={`bearbeitete Vorgänge pro ${volume.unit === 'hour' ? 'Stunde' : 'Tag'}`}
          refetching={isFetching}
        >
          <StackedBarsChart data={verlaufRows} series={verlaufSeries} height={260} valueFmt={(v) => deInt(v)} />
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
            {deInt(allCards.length)} Automatisierungen
            {affected.length > 0 ? `, ${deInt(affected.length)} auffällig` : ''}
          </span>
          <div className="seg">
            <button
              className={cardFilter === 'alle' ? 'active' : undefined}
              onClick={() => setCardFilter('alle')}
            >
              Alle
            </button>
            <button
              className={cardFilter === 'auffaellig' ? 'active' : undefined}
              onClick={() => setCardFilter('auffaellig')}
            >
              Nur Auffälligkeiten
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

      {/* 6 — issues and who owns them, in one card */}
      <div className="stake-section-head" id="stoerungen">
        <div>
          <span className="section-eyebrow">
            <b>03</b> — Störungen
          </span>
          <h2 className="stake-section-title">Störungen &amp; Zuständigkeit</h2>
        </div>
        <div className="stake-controls">
          <span className="card-sub">{deInt(occurrences.length)} Störungen im Zeitraum</span>
        </div>
      </div>
      <div className="grid">
        <div className="card">
          <div className={isFetching ? 'refetching' : undefined}>
            <ResponsibilitySplit counts={responsibilityCounts} />
            {groups.length > 0 ? (
              <>
                <div className="panel-section-title" style={{ marginTop: 22 }}>
                  Häufigste Ursachen
                </div>
                <IssueList groups={groups.slice(0, 5)} settings={settings} />
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
        <ChartCard
          title="Zeitersparnis"
          sub="manuelle Bearbeitung im Vergleich zur Automatisierung"
          refetching={isFetching}
        >
          <TimeSavedBars rows={saved} settings={settings} />
        </ChartCard>
        <ChartCard
          title="Wann die Automatisierungen arbeiten"
          sub="Vorgänge nach Wochentag und Uhrzeit"
          refetching={isFetching}
        >
          <ActivityHeatmap matrix={matrix} />
        </ChartCard>
      </div>

      <div className="grid">
        <ColorLegend outcomeColors={OUTCOME_COLORS} />
      </div>

      <div className="stake-footnote">
        Detailauswertungen für Fachexperten finden Sie in der{' '}
        <button className="linklike" onClick={onShowTechnical}>
          technischen Ansicht
        </button>
        .
      </div>

      {selected ? (
        <DetailPanel
          card={selected}
          strip={stripFor(selected)}
          jobs={jobs}
          queueItems={page.queueItems}
          idsByName={idsByName}
          errorGroups={groups}
          manualErrors={page.manualErrors}
          settings={settings}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  )
}
