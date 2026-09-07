// Demo mode: open the app with ?demo to render generated sample data instead
// of calling Orchestrator. Used to preview the dashboard without credentials.
//
// The process list mirrors the V-Bank „Prozessübersicht" (Stand 11.08.2026):
// technical names, area (Orchestrator folder) and relative run volume come
// from that sheet. Volumes are scaled from the 2026 year-to-date performer
// runs so the mix between processes matches the real estate.

import type {
  JobState,
  OrchAlert,
  OrchFolder,
  OrchJob,
  OrchQueueDefinition,
  OrchQueueItem,
  TenantData,
} from './types'

/**
 * `?demo` forces demo data; `?live` forces the real connection. Without either,
 * VITE_DEMO_DEFAULT=true (set on public hosts such as Vercel, which cannot
 * reach a VPN-only Orchestrator) makes demo data the default.
 */
export function isDemoMode(): boolean {
  const params = new URLSearchParams(window.location.search)
  if (params.has('demo')) return true
  if (params.has('live')) return false
  return /^(1|true|yes)$/i.test((import.meta.env.VITE_DEMO_DEFAULT ?? '').trim())
}

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
export const DEMO_FOLDERS: OrchFolder[] = [
  { Id: 1, DisplayName: 'Kontoservice', FullyQualifiedName: 'V-Bank/Kontoservice' },
  { Id: 2, DisplayName: 'Zahlungsverkehr', FullyQualifiedName: 'V-Bank/Zahlungsverkehr' },
  { Id: 3, DisplayName: 'Handel', FullyQualifiedName: 'V-Bank/Handel' },
  { Id: 4, DisplayName: 'Reporting & Regulatorik', FullyQualifiedName: 'V-Bank/Reporting & Regulatorik' },
  { Id: 5, DisplayName: 'Firmen & Kredit', FullyQualifiedName: 'V-Bank/Firmen & Kredit' },
]

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
}

// Days covered by the „Performerläufe 2026" column (01.01.–11.08.2026).
const DAYS_2026 = 223

const PROCESSES: DemoProcess[] = [
  // Reporting & Regulatorik
  { name: 'A-10210-001-Kennzahlenberichte', folder: 4, runs2026: 376, durMin: 11, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-10320-001-BaisDownload', folder: 4, runs2026: 161, durMin: 6, failRate: 0.003, itemsPerRun: 0 },
  { name: 'A-10320-002-BaisUpload', folder: 4, runs2026: 167, durMin: 7, failRate: 0.003, itemsPerRun: 0 },
  { name: 'A-10601-001-Transaktionsstatistik', folder: 4, runs2026: 223, durMin: 9, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-30130-001-VerwaltungsberichtUpload', folder: 4, runs2026: 257, durMin: 8, failRate: 0.002, itemsPerRun: 10 },
  // Kontoservice
  { name: 'A-20201-001-Computershareübertragungskontrolle', folder: 1, runs2026: 214, durMin: 14, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-20201-002-MoneyAccountKlassenänderungen', folder: 1, runs2026: 29, durMin: 5, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-20201-005-InvestmentPolicyKlassenänderungen', folder: 1, runs2026: 51, durMin: 6, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-20201-007-MoneyAccountKontraktänderungen', folder: 1, runs2026: 14, durMin: 5, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-20201-008-Versandinstruktionen', folder: 1, runs2026: 731, durMin: 4, failRate: 0.003, itemsPerRun: 6 },
  { name: 'A-20201-009-AccountingZinsabschluss', folder: 1, runs2026: 124, durMin: 22, failRate: 0.002, itemsPerRun: 20 },
  { name: 'A-20201-010-InvestmentPolicyReferenzkonten', folder: 1, runs2026: 104, durMin: 7, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-20201-013-PersonDokumente', folder: 1, runs2026: 1260, durMin: 5, failRate: 0.003, itemsPerRun: 8 },
  { name: 'A-20201-014-PersonKlassenänderungen', folder: 1, runs2026: 69, durMin: 6, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-20802-001-LeiVerlängerung', folder: 1, runs2026: 155, durMin: 9, failRate: 0.002, itemsPerRun: 6 },
  { name: 'A-20802-002-LeiVerlängerungGebührenbuchung', folder: 1, runs2026: 163, durMin: 6, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-20803-003-ContainerEröffnungen', folder: 1, runs2026: 1246, durMin: 8, failRate: 0.004, itemsPerRun: 5 },
  // Zahlungsverkehr
  { name: 'A-20401-001-Daueraufträge', folder: 2, runs2026: 77, durMin: 6, failRate: 0.002, itemsPerRun: 4 },
  { name: 'A-20401-002-Lastschriftmandate', folder: 2, runs2026: 328, durMin: 5, failRate: 0.002, itemsPerRun: 5 },
  { name: 'A-20401-003-LastschriftmandatVerwaltungsgebühren', folder: 2, runs2026: 390, durMin: 10, failRate: 0.002, itemsPerRun: 15 },
  { name: 'A-20401-006-LastschriftmandatLöschung', folder: 2, runs2026: 107, durMin: 4, failRate: 0.002, itemsPerRun: 4 },
  { name: 'A-20401-008-ÜberweisungExtern', folder: 2, runs2026: 3187, durMin: 3, failRate: 0.003, itemsPerRun: 12 },
  // Firmen & Kredit
  { name: 'A-20701-001-Jahresabschlussberichte', folder: 5, runs2026: 868, durMin: 16, failRate: 0.003, itemsPerRun: 4 },
  { name: 'A-20701-002-KreditBerichte', folder: 5, runs2026: 257, durMin: 12, failRate: 0.002, itemsPerRun: 0 },
  // Handel
  { name: 'A-30201-001-InfrontVerfügungsrahmen', folder: 3, runs2026: 176, durMin: 7, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-30201-002-BörsenabrechnungNullpositionen', folder: 3, runs2026: 250, durMin: 9, failRate: 0.002, itemsPerRun: 0 },
  { name: 'A-30201-004-AssignmentDaten', folder: 3, runs2026: 189, durMin: 8, failRate: 0.002, itemsPerRun: 0 },
]

// Rare, mostly infrastructure-side faults (→ V-Bank IT), one selector case (→ Exelentic).
const FAULTS = [
  'The remote session was disconnected because the session was logged off',
  'Timeout reached. Activity Click \'Freigeben\' failed after 30000ms',
  'Connection to file server \\\\vbk-fs01 unavailable: network path not found for {path}',
  'Selector not found: <webctrl tag=\'INPUT\' id=\'kontonummer\' /> at Kernbanksystem.Stammdaten',
]

const APP_EXC = [
  'HTTP 503 from Kernbanksystem service /api/v2/konten — retried successfully on next run',
  'Excel process crashed while writing Gebührenbuchung workbook',
  'Login to Archivsystem failed: session token expired',
]

// Korrekt erkannte Aussteuerungen — the bot correctly handed the item to a person.
const BIZ_EXC = [
  'IBAN-Prüfziffer ungültig – Vorgang an Sachbearbeitung übergeben',
  'Mandat bereits vorhanden – Doppelanlage verhindert',
  'Kundennummer nicht im Kernbanksystem gefunden – manuelle Prüfung',
  'Dokument unleserlich – manuelle Nachbearbeitung erforderlich',
  'Freigabegrenze überschritten – Vier-Augen-Prinzip angefordert',
]

const MACHINES = ['VBK-RPA-01', 'VBK-RPA-02', 'VBK-RPA-03']

const QUEUES: OrchQueueDefinition[] = PROCESSES.filter((p) => p.itemsPerRun > 0).map((p, i) => ({
  Id: 100 + i,
  Name: `${p.name}-Queue`,
  Description: null,
  FolderId: p.folder,
  FolderName: DEMO_FOLDERS.find((f) => f.Id === p.folder)!.DisplayName,
}))

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

export function generateDemoData(
  selectedFolderId: number | 'all',
  from: Date,
  to: Date,
): TenantData {
  const windowMs = to.getTime() - from.getTime()
  const start = new Date(from.getTime() - windowMs)
  const rnd = mulberry32(Math.floor(start.getTime() / 3600_000))

  const folders =
    selectedFolderId === 'all' ? DEMO_FOLDERS : DEMO_FOLDERS.filter((f) => f.Id === selectedFolderId)
  const folderIds = new Set(folders.map((f) => f.Id))
  const queueOf = new Map(QUEUES.map((q) => [q.Name.replace(/-Queue$/, ''), q]))

  const jobs: OrchJob[] = []
  const queueItems: OrchQueueItem[] = []
  const totalHours = Math.ceil((to.getTime() - start.getTime()) / 3600_000)
  let id = 1

  for (let h = 0; h < totalHours; h++) {
    const hourStart = new Date(start.getTime() + h * 3600_000)
    const factor = activityFactor(hourStart)
    for (const p of PROCESSES) {
      if (!folderIds.has(p.folder)) continue
      const expected = hourlyRate(p) * factor
      const runs = Math.floor(expected) + (rnd() < expected % 1 ? 1 : 0)
      for (let r = 0; r < runs; r++) {
        const created = new Date(hourStart.getTime() + rnd() * 3500_000)
        if (created > to) continue
        const durMs = p.durMin * 60_000 * (0.7 + rnd() * 0.6)
        const startT = new Date(created.getTime() + 10_000 + rnd() * 40_000)
        const end = new Date(startT.getTime() + durMs)
        const stillRunning = end.getTime() > to.getTime() - 120_000
        const roll = rnd()
        const state: JobState = stillRunning
          ? 'Running'
          : roll < p.failRate
            ? 'Faulted'
            : roll < p.failRate + 0.001
              ? 'Stopped'
              : 'Successful'
        const folder = DEMO_FOLDERS.find((f) => f.Id === p.folder)!
        jobs.push({
          Id: id,
          Key: `job-${id}`,
          State: state,
          ReleaseName: p.name,
          HostMachineName: pick(rnd, MACHINES),
          Source: p.itemsPerRun > 0 ? 'Trigger' : 'Schedule',
          CreationTime: created.toISOString(),
          StartTime: startT.toISOString(),
          EndTime: state === 'Running' ? null : end.toISOString(),
          Info:
            state === 'Faulted'
              ? pick(rnd, FAULTS).replace('{path}', `\\\\vbk-fs01\\exports\\batch_${id}.csv`)
              : state === 'Successful'
                ? 'Job completed'
                : null,
          FolderId: folder.Id,
          FolderName: folder.DisplayName,
        })
        id++

        // Dispatcher/performer: the items this performer run worked through.
        // A few runs find an empty queue (Leerlauf) — rare, but realistic.
        const q = queueOf.get(p.name)
        if (!q || rnd() < 0.03) continue
        const items = Math.max(1, Math.round(p.itemsPerRun * (0.5 + rnd())))
        const runMs = Math.max(durMs, 60_000)
        for (let i = 0; i < items; i++) {
          const itemCreated = new Date(created.getTime() - rnd() * 1800_000)
          const startP = new Date(startT.getTime() + (i / items) * runMs)
          const endP = new Date(
            Math.min(startP.getTime() + 30_000 + rnd() * 150_000, end.getTime()),
          )
          const pending = state === 'Running' && startP.getTime() > to.getTime()
          const roll = rnd()
          const isBiz = rnd() < 0.92
          const status = pending
            ? 'New'
            : roll < 0.04
              ? 'Failed'
              : roll < 0.044
                ? 'Retried'
                : 'Successful'
          queueItems.push({
            Id: id,
            QueueDefinitionId: q.Id,
            Status: status,
            ProcessingExceptionType:
              status === 'Failed' || status === 'Retried'
                ? isBiz
                  ? 'BusinessException'
                  : 'ApplicationException'
                : null,
            ProcessingException:
              status === 'Failed' || status === 'Retried'
                ? { Reason: isBiz ? pick(rnd, BIZ_EXC) : pick(rnd, APP_EXC), Type: null }
                : null,
            CreationTime: itemCreated.toISOString(),
            StartProcessing: status === 'New' ? null : startP.toISOString(),
            EndProcessing: status === 'New' ? null : endP.toISOString(),
            Reference: `VB-${200000 + id}`,
            FolderId: q.FolderId,
          })
          id++
        }
      }
    }
  }

  const alerts: OrchAlert[] = jobs
    .filter((j) => j.State === 'Faulted')
    .filter(() => rnd() < 0.5)
    .slice(0, 60)
    .map((j, i) => ({
      Id: `alert-${i}`,
      NotificationName: `Job ${j.ReleaseName} faulted on ${j.HostMachineName}`,
      Component: 'Jobs',
      Severity: rnd() < 0.2 ? 'Fatal' : 'Error',
      CreationTime: j.CreationTime,
      State: 'Unread',
      Data: null,
    }))

  return {
    folders: DEMO_FOLDERS,
    jobs,
    queues: QUEUES.filter((q) => folderIds.has(q.FolderId)),
    queueItems,
    alerts,
    license: { allowed: 4, used: 3 },
    truncated: false,
    fetchedAt: Date.now(),
  }
}
