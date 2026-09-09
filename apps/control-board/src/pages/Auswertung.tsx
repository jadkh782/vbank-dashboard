import { useMemo, useState } from 'react'
import { addDays, CATEGORY_LABELS_DE, CATEGORY_ORDER, deDate, deInt, dePct, todayBerlin, type Category } from '@vbank/shared'
import { MiniBar, RankList, StatTile, useChartTheme } from '@vbank/ui'
import { displayNameOf, useAutomationRows, usePeriodFaultedJobs, usePeriodReviewItems, usePeriodTransactions } from '../data/queries'

interface Point {
  automationId: string
  day: string
  family: string | null
  category: Category | null
  kind: 'Vorgang' | 'Prozessabbruch'
}

function toCsv(rows: Record<string, string | number | null>[]): string {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: string | number | null) => {
    const s = v === null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : v
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\r\n')
}

/** Internal report: where do the open points come from, and why. */
export function Auswertung() {
  const [fromDay, setFrom] = useState(addDays(todayBerlin(), -30))
  const [toDay, setTo] = useState(addDays(todayBerlin(), -1))
  const t = useChartTheme()
  const automations = useAutomationRows()
  const txns = usePeriodTransactions(fromDay, toDay)
  const jobs = usePeriodFaultedJobs(fromDay, toDay)
  const items = usePeriodReviewItems(fromDay, toDay)

  const points = useMemo<Point[]>(() => {
    const byJob = new Map((items.data ?? []).filter((i) => i.job_id !== null).map((i) => [i.job_id!, i]))
    const out: Point[] = []
    for (const x of txns.data ?? []) {
      if (x.outcome !== 'failed' || x.category === 'nicht_anzeigen') continue
      out.push({ automationId: x.automation_id, day: x.day, family: x.family, category: (x.category as Category | null) ?? null, kind: 'Vorgang' })
    }
    for (const j of jobs.data ?? []) {
      const r = byJob.get(j.id)
      if (r?.category === 'nicht_anzeigen') continue
      out.push({ automationId: j.automation_id, day: j.business_day, family: j.info_norm, category: r?.category ?? null, kind: 'Prozessabbruch' })
    }
    return out
  }, [txns.data, jobs.data, items.data])

  const nameOf = (id: string) => displayNameOf(automations.data?.find((a) => a.id === id))
  const total = points.length
  const byCategory = CATEGORY_ORDER.map((c) => ({ c, n: points.filter((p) => p.category === c).length }))
  const unreviewed = points.filter((p) => !p.category).length

  const byAutomation = useMemo(() => {
    const m = new Map<string, Point[]>()
    for (const p of points) (m.get(p.automationId) ?? m.set(p.automationId, []).get(p.automationId)!).push(p)
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [points])

  const byFamily = useMemo(() => {
    const m = new Map<string, Point[]>()
    for (const p of points) {
      const k = `${p.kind}::${p.family ?? '–'}`
      ;(m.get(k) ?? m.set(k, []).get(k)!).push(p)
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [points])

  const topCategory = (ps: Point[]): Category | null => {
    const counts = new Map<Category, number>()
    for (const p of ps) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const colorOf = (c: Category | null) => (c ? t.category[c] : t.axisInk)

  const exportCsv = () => {
    const csv = toCsv(
      points.map((p) => ({
        Tag: p.day,
        Automatisierung: nameOf(p.automationId),
        Art: p.kind,
        Kategorie: p.category ? CATEGORY_LABELS_DE[p.category] : 'ungeprüft',
        Meldung: p.family,
      })),
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `offene-punkte_${fromDay}_${toDay}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const loading = txns.isLoading || jobs.isLoading || items.isLoading
  const txnCount = (txns.data ?? []).filter((x) => x.outcome !== 'pending').length

  return (
    <>
      <div className="stake-section-head">
        <div>
          <span className="section-eyebrow">
            <b>Auswertung</b>
          </span>
          <h2 className="stake-section-title">Offene Punkte {deDate(fromDay)} – {deDate(toDay)}</h2>
        </div>
        <div className="stake-controls">
          <div className="range-inputs">
            <input type="date" value={fromDay} max={toDay} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="Von" />
            <span>→</span>
            <input type="date" value={toDay} min={fromDay} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="Bis" />
          </div>
          <button className="theme-toggle" onClick={exportCsv} disabled={points.length === 0}>
            CSV exportieren
          </button>
        </div>
      </div>

      {loading ? <div className="state-block">Lade Zeitraum…</div> : null}

      <div className="grid kpi-row">
        <StatTile label="Offene Punkte" value={deInt(total)} />
        <StatTile label="Vorgänge im Zeitraum" value={deInt(txnCount)} />
        <StatTile label="Fehlerquote Vorgänge" value={dePct(txnCount > 0 ? (points.filter((p) => p.kind === 'Vorgang').length / txnCount) * 100 : NaN)} />
        <StatTile label="Prozessabbrüche" value={deInt(points.filter((p) => p.kind === 'Prozessabbruch').length)} />
        <StatTile label="Noch ungeprüft" value={deInt(unreviewed)} />
      </div>

      <div className="grid two-col">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Nach Kategorie</span>
          </div>
          {byCategory.map(({ c, n }) => (
            <div className="cat-row" key={c}>
              <span className="dot" style={{ background: t.category[c] }} />
              <span className="grow">
                <b>{CATEGORY_LABELS_DE[c]}</b>
                <MiniBar fraction={total > 0 ? n / total : 0} color={t.category[c]} />
              </span>
              <span className="cat-count">
                <b>{deInt(n)}</b>
                <span className="dim">{dePct(total > 0 ? (n / total) * 100 : 0, 0)}</span>
              </span>
            </div>
          ))}
          {unreviewed > 0 ? (
            <div className="cat-row">
              <span className="dot" style={{ background: t.axisInk }} />
              <span className="grow">
                <b>ungeprüft</b>
              </span>
              <span className="cat-count">
                <b>{deInt(unreviewed)}</b>
              </span>
            </div>
          ) : null}
        </div>
        <div className="card">
          <div className="card-head">
            <span className="card-title">Automatisierungen mit den meisten offenen Punkten</span>
          </div>
          <RankList
            items={byAutomation.slice(0, 12).map(([id, ps]) => ({
              label: nameOf(id),
              sub: topCategory(ps) ? CATEGORY_LABELS_DE[topCategory(ps)!] : 'ungeprüft',
              count: ps.length,
              share: total > 0 ? ps.length / total : 0,
              color: colorOf(topCategory(ps)),
            }))}
            emptyText="Keine offenen Punkte im Zeitraum."
          />
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Häufigste Ursachen</span>
            <span className="card-sub">{deInt(byFamily.length)} Familien</span>
          </div>
          <RankList
            items={byFamily.slice(0, 20).map(([k, ps]) => ({
              label: k.split('::')[1],
              sub: `${k.split('::')[0]} · ${[...new Set(ps.map((p) => nameOf(p.automationId)))].slice(0, 3).join(', ')}`,
              count: ps.length,
              share: total > 0 ? ps.length / total : 0,
              color: colorOf(topCategory(ps)),
            }))}
            emptyText="Keine offenen Punkte im Zeitraum."
          />
        </div>
      </div>
    </>
  )
}
