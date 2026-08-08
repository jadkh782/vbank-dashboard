// Demo mode: open the app with ?demo to render generated sample data instead
// of calling Orchestrator. Used to preview the dashboard without credentials.

import type {
  JobState,
  OrchAlert,
  OrchFolder,
  OrchJob,
  OrchQueueDefinition,
  OrchQueueItem,
  TenantData,
} from './types'

export function isDemoMode(): boolean {
  return new URLSearchParams(window.location.search).has('demo')
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

export const DEMO_FOLDERS: OrchFolder[] = [
  { Id: 1, DisplayName: 'Finance', FullyQualifiedName: 'Vbank/Finance' },
  { Id: 2, DisplayName: 'Operations', FullyQualifiedName: 'Vbank/Operations' },
]

const PROCESSES = [
  { name: 'Vbank_InvoiceProcessing', folder: 1, weight: 0.3, failRate: 0.06, durMin: 4 },
  { name: 'Vbank_PaymentReconciliation', folder: 1, weight: 0.22, failRate: 0.11, durMin: 9 },
  { name: 'Vbank_KYC_Refresh', folder: 2, weight: 0.18, failRate: 0.04, durMin: 6 },
  { name: 'Vbank_CardDisputes', folder: 2, weight: 0.16, failRate: 0.15, durMin: 12 },
  { name: 'Vbank_DailyReporting', folder: 1, weight: 0.14, failRate: 0.02, durMin: 3 },
]

const FAULTS = [
  'Selector not found: <webctrl tag=\'INPUT\' id=\'amount\' /> at PaymentPortal.SubmitPage',
  'Timeout reached. Activity Click \'Submit\' failed after 30000ms',
  'The remote session was disconnected because the session was logged off',
  'CSV export file was not found in {path}: shared drive unavailable',
  'Invalid credentials for SAP connection GW-PRD-04',
]

const APP_EXC = [
  'Element not found: account overview grid did not load within 15s',
  'HTTP 502 from core banking API endpoint /v2/transactions',
  'Excel process crashed while writing reconciliation workbook',
]

const BIZ_EXC = [
  'IBAN validation failed: checksum mismatch',
  'Duplicate invoice number — already posted in ledger',
  'Customer record incomplete: missing date of birth',
]

const MACHINES = ['VBK-RPA-01', 'VBK-RPA-02', 'VBK-RPA-03']

const QUEUES: OrchQueueDefinition[] = [
  { Id: 11, Name: 'InvoiceQueue', Description: null, FolderId: 1, FolderName: 'Finance' },
  { Id: 12, Name: 'PaymentsQueue', Description: null, FolderId: 1, FolderName: 'Finance' },
  { Id: 13, Name: 'DisputesQueue', Description: null, FolderId: 2, FolderName: 'Operations' },
  { Id: 14, Name: 'KYCQueue', Description: null, FolderId: 2, FolderName: 'Operations' },
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

  const jobs: OrchJob[] = []
  const queueItems: OrchQueueItem[] = []
  const totalHours = Math.ceil((to.getTime() - start.getTime()) / 3600_000)
  let id = 1

  for (let h = 0; h < totalHours; h++) {
    const hourStart = new Date(start.getTime() + h * 3600_000)
    const factor = activityFactor(hourStart)
    for (const p of PROCESSES) {
      if (!folderIds.has(p.folder)) continue
      const expected = 3.2 * p.weight * factor
      const runs = Math.floor(expected) + (rnd() < expected % 1 ? 1 : 0)
      for (let r = 0; r < runs; r++) {
        const created = new Date(hourStart.getTime() + rnd() * 3500_000)
        if (created > to) continue
        const durMs = p.durMin * 60_000 * (0.6 + rnd() * 0.9)
        const startT = new Date(created.getTime() + 15_000 + rnd() * 60_000)
        const end = new Date(startT.getTime() + durMs)
        const stillRunning = end.getTime() > to.getTime() - 120_000
        const roll = rnd()
        const state: JobState = stillRunning
          ? 'Running'
          : roll < p.failRate
            ? 'Faulted'
            : roll < p.failRate + 0.015
              ? 'Stopped'
              : 'Successful'
        const folder = DEMO_FOLDERS.find((f) => f.Id === p.folder)!
        jobs.push({
          Id: id,
          Key: `job-${id}`,
          State: state,
          ReleaseName: p.name,
          HostMachineName: pick(rnd, MACHINES),
          Source: 'Schedule',
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
      }
    }

    for (const q of QUEUES) {
      if (!folderIds.has(q.FolderId)) continue
      const expected = 9 * factor
      const items = Math.floor(expected) + (rnd() < expected % 1 ? 1 : 0)
      for (let i = 0; i < items; i++) {
        const created = new Date(hourStart.getTime() + rnd() * 3500_000)
        if (created > to) continue
        const roll = rnd()
        const isNew = created.getTime() > to.getTime() - 3600_000 && roll < 0.35
        const status = isNew ? 'New' : roll < 0.08 ? 'Failed' : roll < 0.12 ? 'Retried' : 'Successful'
        const isBiz = rnd() < 0.45
        const startP = new Date(created.getTime() + 30_000 + rnd() * 600_000)
        const endP = new Date(startP.getTime() + 40_000 + rnd() * 240_000)
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
          CreationTime: created.toISOString(),
          StartProcessing: status === 'New' ? null : startP.toISOString(),
          EndProcessing: status === 'New' ? null : endP.toISOString(),
          Reference: `TX-${100000 + id}`,
          FolderId: q.FolderId,
        })
        id++
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
      Severity: rnd() < 0.3 ? 'Fatal' : 'Error',
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
    license: { allowed: 3, used: 3 },
    truncated: false,
    fetchedAt: Date.now(),
  }
}
