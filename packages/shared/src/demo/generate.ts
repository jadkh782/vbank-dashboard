// Demo data: deterministic domain rows that tell the V-Bank story without any
// backend. The process list mirrors the V-Bank „Prozessübersicht" (Stand
// 11.08.2026): technical names, area (Orchestrator folder) and relative run
// volume come from that sheet; volumes are scaled from the 2026 year-to-date
// performer runs so the mix between processes matches the real estate.
//
// Used by the dashboard's demo source, by the seed script and as test fixtures.

import type { Category } from '../categories'
import type { Automation, DashboardData, ManualErrorRow, Run, Txn } from '../domain'
import { normalizeMessage } from '../classification/normalize'
import { berlinDay } from '../time/berlin'

// Deterministic PRNG so refetches don't reshuffle the data.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Folders = fachliche Bereiche, derived from the Org-Briefkasten column.
export const DEMO_FOLDERS = ['Kontoservice', 'Zahlungsverkehr', 'Handel', 'Reporting & Regulatorik', 'Firmen & Kredit']

interface DemoProcess {
  name: string
  folder: number
  /** Performerläufe 2026 (01.01.–11.08.) from the Prozessübersicht. */
  runs2026: number
  /** Typical run duration in minutes. */
  durMin: number
  /** Job fault probability per finished run. */
  failRate: number
  /** Dispatcher/performer pattern: items per performer run (0 = no queue). */
  itemsPerRun: number
  /** Manual handling minutes per item (queues only) — drives Zeitersparnis. */
  humanMin?: number
}

// Days covered by the „Performerläufe 2026" column (01.01.–11.08.2026).
const DAYS_2026 = 223

const PROCESSES: DemoProcess[] = [
  // Reporting & Regulatorik
  { name: 'A-10210-001-Kennzahlenberichte', folder: 3, runs2026: 376, durMin: 11, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-10320-001-BaisDownload', folder: 3, runs2026: 161, durMin: 6, failRate: 0.003, itemsPerRun: 0 },
  { name: 'A-10320-002-BaisUpload', folder: 3, runs2026: 167, durMin: 7, failRate: 0.003, itemsPerRun: 0 },
  { name: 'A-10601-001-Transaktionsstatistik', folder: 3, runs2026: 223, durMin: 9, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-30130-001-VerwaltungsberichtUpload', folder: 3, runs2026: 257, durMin: 8, failRate: 0.002, itemsPerRun: 10, humanMin: 6 },
  // Kontoservice
  { name: 'A-20201-001-Computershareübertragungskontrolle', folder: 0, runs2026: 214, durMin: 14, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-20201-002-MoneyAccountKlassenänderungen', folder: 0, runs2026: 29, durMin: 5, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-20201-005-InvestmentPolicyKlassenänderungen', folder: 0, runs2026: 51, durMin: 6, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-20201-007-MoneyAccountKontraktänderungen', folder: 0, runs2026: 14, durMin: 5, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-20201-008-Versandinstruktionen', folder: 0, runs2026: 731, durMin: 4, failRate: 0.003, itemsPerRun: 6, humanMin: 4 },
  { name: 'A-20201-009-AccountingZinsabschluss', folder: 0, runs2026: 124, durMin: 22, failRate: 0.002, itemsPerRun: 20, humanMin: 3 },
  { name: 'A-20201-010-InvestmentPolicyReferenzkonten', folder: 0, runs2026: 104, durMin: 7, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-20201-013-PersonDokumente', folder: 0, runs2026: 1260, durMin: 5, failRate: 0.003, itemsPerRun: 8, humanMin: 5 },
  { name: 'A-20201-014-PersonKlassenänderungen', folder: 0, runs2026: 69, durMin: 6, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-20802-001-LeiVerlängerung', folder: 0, runs2026: 155, durMin: 9, failRate: 0.002, itemsPerRun: 6, humanMin: 8 },
  { name: 'A-20802-002-LeiVerlängerungGebührenbuchung', folder: 0, runs2026: 163, durMin: 6, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-20803-003-ContainerEröffnungen', folder: 0, runs2026: 1246, durMin: 8, failRate: 0.004, itemsPerRun: 5, humanMin: 12 },
  // Zahlungsverkehr
  { name: 'A-20401-001-Daueraufträge', folder: 1, runs2026: 77, durMin: 6, failRate: 0.002, itemsPerRun: 4, humanMin: 5 },
  { name: 'A-20401-002-Lastschriftmandate', folder: 1, runs2026: 328, durMin: 5, failRate: 0.002, itemsPerRun: 5, humanMin: 6 },
  { name: 'A-20401-003-LastschriftmandatVerwaltungsgebühren', folder: 1, runs2026: 390, durMin: 10, failRate: 0.002, itemsPerRun: 15, humanMin: 2 },
  { name: 'A-20401-006-LastschriftmandatLöschung', folder: 1, runs2026: 107, durMin: 4, failRate: 0.002, itemsPerRun: 4, humanMin: 3 },
  { name: 'A-20401-008-ÜberweisungExtern', folder: 1, runs2026: 3187, durMin: 3, failRate: 0.003, itemsPerRun: 12, humanMin: 4 },
  // Firmen & Kredit
  { name: 'A-20701-001-Jahresabschlussberichte', folder: 4, runs2026: 868, durMin: 16, failRate: 0.003, itemsPerRun: 4, humanMin: 25 },
  { name: 'A-20701-002-KreditBerichte', folder: 4, runs2026: 257, durMin: 12, failRate: 0.002, itemsPerRun: 0 },
  // Handel
  { name: 'A-30201-001-InfrontVerfügungsrahmen', folder: 2, runs2026: 176, durMin: 7, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-30201-002-BörsenabrechnungNullpositionen', folder: 2, runs2026: 250, durMin: 9, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-30201-004-AssignmentDaten', folder: 2, runs2026: 189, durMin: 8, failRate: 0.002, itemsPerRun: 0 },
]

// Each message carries the category a reviewer would give it. The mix leans
// towards infrastructure: the demo is meant to show a healthy estate.
const FAULTS: [string, Category][] = [
  ['The remote session was disconnected because the session was logged off', 'vbank_it'],
  ["Timeout reached. Activity Click 'Freigeben' failed after 30000ms", 'vbank_it'],
  ['Connection to file server \\\\vbk-fs01 unavailable: network path not found for {path}', 'vbank_it'],
  ["Selector not found: <webctrl tag='INPUT' id='kontonummer' /> at Kernbanksystem.Stammdaten", 'exelentic_uipath'],
]

const APP_EXC: [string, Category][] = [
  ['HTTP 503 from Kernbanksystem service /api/v2/konten', 'vbank_it'],
  ['Excel process crashed while writing Gebührenbuchung workbook', 'vbank_it'],
  ['Login to Archivsystem failed: session token expired', 'vbank_it'],
  ['Kernbanksystem antwortete nicht innerhalb von 30 s – Vorgang erneut eingestellt', 'neustartfaehig'],
  ['Avaloq: Buchung abgewiesen – Konto gesperrt (Fehlercode AVQ-4711)', 'avaloq'],
  ['Pflichtfeld Verwendungszweck fehlt – Eingabe im Auftrag unvollständig', 'fachbereich'],
  ['Testlauf – Vorgang verworfen', 'nicht_anzeigen'],
]

// Korrekt erkannte Aussteuerungen — the bot correctly handed the item to a person.
const BIZ_EXC = [
  'IBAN-Prüfziffer ungültig – Vorgang an Sachbearbeitung übergeben',
  'Mandat bereits vorhanden – Doppelanlage verhindert',
  'Kundennummer nicht im Kernbanksystem gefunden – manuelle Prüfung',
  'Dokument unleserlich – manuelle Nachbearbeitung erforderlich',
  'Freigabegrenze überschritten – Vier-Augen-Prinzip angefordert',
]

function pick<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)]
}

// Business-hours weighting: more runs 07:00–19:00 on weekdays.
function activityFactor(d: Date): number {
  const h = d.getHours()
  const wd = d.getDay()
  const dayFactor = wd === 0 || wd === 6 ? 0.25 : 1
  const hourFactor = h >= 7 && h < 19 ? 1 : 0.2
  return dayFactor * hourFactor
}

// Σ activityFactor over one week ÷ 7 — converts a per-day rate into the
// per-hour expectation used inside the hourly loop.
const FACTOR_UNITS_PER_DAY = (5 * (12 * 1 + 12 * 0.2) + 2 * 0.25 * (12 * 1 + 12 * 0.2)) / 7

/** Expected runs per hour of full activity, from the 2026 year-to-date count. */
function hourlyRate(p: DemoProcess): number {
  // Slight uplift versus the sheet so a 7-day window shows the whole estate,
  // with a floor so low-frequency processes still appear.
  const perDay = Math.max((p.runs2026 / DAYS_2026) * 1.5, 0.4)
  return perDay / FACTOR_UNITS_PER_DAY
}

const processId = (p: DemoProcess) => `p:${DEMO_FOLDERS[p.folder]}/${p.name}`
const queueId = (p: DemoProcess) => `q:${p.name}-Queue`

export function demoAutomations(): Automation[] {
  const out: Automation[] = []
  for (const p of PROCESSES) {
    out.push({
      id: processId(p),
      kind: 'process',
      technicalName: p.name,
      folder: DEMO_FOLDERS[p.folder],
      displayName: cleanName(p.name),
      description: null,
      humanMinutesPerItem: null,
    })
    if (p.itemsPerRun > 0) {
      out.push({
        id: queueId(p),
        kind: 'queue',
        technicalName: `${p.name}-Queue`,
        folder: DEMO_FOLDERS[p.folder],
        displayName: `${cleanName(p.name)} Queue`,
        description: null,
        humanMinutesPerItem: p.humanMin ?? null,
      })
    }
  }
  return out
}

/** "A-20401-008-ÜberweisungExtern" → "Überweisung Extern" (same rule as health.autoCleanName). */
function cleanName(technical: string): string {
  return technical
    .replace(/^[A-Z]-\d{5}-\d{3}-/, '')
    .replace(/([a-zäöü])([A-ZÄÖÜ])/g, '$1 $2')
    .replace(/([A-ZÄÖÜ]+)([A-ZÄÖÜ][a-zäöü])/g, '$1 $2')
    .trim()
}

export interface DemoOptions {
  /** Start of the data to generate (normally the previous window's start). */
  from: Date
  /** End of the data — the Datenstand. */
  to: Date
  /** Seed; defaults to the hour of `from` so refetches are stable. */
  seed?: number
}

/**
 * Generate runs, transactions and manual errors for [from, to]. Retried
 * transactions are already collapsed: a failed attempt that succeeded on retry
 * is ONE successful transaction with `attempts` > 1.
 */
export function generateDemoData(opts: DemoOptions): DashboardData {
  const { from, to } = opts
  const rnd = mulberry32(opts.seed ?? Math.floor(from.getTime() / 3600_000))
  const automations = demoAutomations()
  const runs: Run[] = []
  const txns: Txn[] = []
  const totalHours = Math.ceil((to.getTime() - from.getTime()) / 3600_000)
  let n = 0

  for (let h = 0; h < totalHours; h++) {
    const hourStart = new Date(from.getTime() + h * 3600_000)
    const factor = activityFactor(hourStart)
    for (const p of PROCESSES) {
      const expected = hourlyRate(p) * factor
      const count = Math.floor(expected) + (rnd() < expected % 1 ? 1 : 0)
      for (let r = 0; r < count; r++) {
        const created = new Date(hourStart.getTime() + rnd() * 3500_000)
        if (created > to) continue
        const durMs = p.durMin * 60_000 * (0.7 + rnd() * 0.6)
        const startT = new Date(created.getTime() + 10_000 + rnd() * 40_000)
        const end = new Date(startT.getTime() + durMs)
        const stillRunning = end.getTime() > to.getTime() - 120_000
        const roll = rnd()
        const state: Run['state'] = stillRunning
          ? 'running'
          : roll < p.failRate
            ? 'faulted'
            : roll < p.failRate + 0.001
              ? 'stopped'
              : 'success'
        const fault = state === 'faulted' ? pick(rnd, FAULTS) : null
        runs.push({
          automationId: processId(p),
          day: berlinDay(created),
          createdAt: created.toISOString(),
          startedAt: startT.toISOString(),
          endedAt: state === 'running' ? null : end.toISOString(),
          state,
          category: fault ? fault[1] : null,
          family: fault ? normalizeMessage(fault[0].replace('{path}', `\\\\vbk-fs01\\exports\\batch_${n}.csv`)) : null,
        })
        n++

        // Dispatcher/performer: the items this performer run worked through.
        // A few runs find an empty queue (Leerlauf) — rare, but realistic.
        if (p.itemsPerRun === 0 || rnd() < 0.03) continue
        const items = Math.max(1, Math.round(p.itemsPerRun * (0.5 + rnd())))
        const runMs = Math.max(durMs, 60_000)
        for (let i = 0; i < items; i++) {
          const itemCreated = new Date(created.getTime() - rnd() * 1800_000)
          const startP = new Date(startT.getTime() + (i / items) * runMs)
          const endP = new Date(Math.min(startP.getTime() + 30_000 + rnd() * 150_000, end.getTime()))
          const pending = state === 'running' && startP.getTime() > to.getTime()
          const roll = rnd()
          const isBiz = rnd() < 0.92
          let outcome: Txn['outcome'] = 'success'
          let attempts = 1
          let category: Category | null = null
          let family: string | null = null
          let processing = endP.getTime() - startP.getTime()
          if (pending) outcome = 'pending'
          else if (roll < 0.044) {
            if (isBiz) outcome = 'business_exception'
            else {
              const [msg, cat] = pick(rnd, APP_EXC)
              // Most application exceptions go through on the retry: one
              // successful transaction with two attempts.
              if (rnd() < 0.6) {
                attempts = 2
                processing *= 2
              } else {
                outcome = cat === 'nicht_anzeigen' ? 'ignored' : 'failed'
                attempts = rnd() < 0.5 ? 2 : 1
                if (outcome === 'failed') {
                  category = cat
                  family = normalizeMessage(msg)
                }
              }
            }
          }
          txns.push({
            automationId: queueId(p),
            day: berlinDay(itemCreated),
            createdAt: itemCreated.toISOString(),
            startedAt: pending ? null : startP.toISOString(),
            endedAt: pending ? null : endP.toISOString(),
            outcome,
            attempts,
            processingMs: pending ? null : processing,
            category,
            family,
          })
          n++
        }
      }
    }
  }

  // A couple of IT incidents that never reach Orchestrator.
  const manualErrors: ManualErrorRow[] = []
  const span = to.getTime() - from.getTime()
  const incidents: [string, Category, number][] = [
    ['Citrix-Sitzungen für alle Robots nicht erreichbar (Wartungsfenster überzogen)', 'vbank_it', 45],
    ['Avaloq-Batchlauf verzögert – Buchungen erst am Folgetag sichtbar', 'avaloq', 120],
  ]
  incidents.forEach(([description, category, downtime], i) => {
    const t = new Date(from.getTime() + span * (0.3 + 0.4 * i))
    const target = automations.find((a) => a.kind === 'queue' && a.technicalName.includes(i === 0 ? 'Person' : 'Überweisung'))!
    manualErrors.push({
      id: `demo-manual-${i}`,
      automationId: target.id,
      targetName: target.displayName,
      occurredAt: t.toISOString(),
      category,
      description,
      downtimeMinutes: downtime,
    })
  })

  return {
    datenstand: berlinDay(to),
    automations,
    runs,
    txns,
    manualErrors,
    settings: { hoursPerPT: 8, thresholds: { okMin: 90, attentionMin: 75 } },
  }
}

/** The BIZ_EXC texts, exported for the seed script's mapping table. */
export const DEMO_BUSINESS_EXCEPTIONS = BIZ_EXC
export const DEMO_APP_EXCEPTIONS = APP_EXC
export const DEMO_FAULTS = FAULTS
