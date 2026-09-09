// Export every unique error from Orchestrator (all folders, full history —
// no date window) plus every process and queue name, as JSON. Used to build
// the classification workbook (Exelentic / V-Bank IT / Neustartfähig / ignore).
//
//   node scripts/export-errors.mjs [out.json]
//
// Reads .env exactly like scripts/check-orchestrator.mjs.
import { readFileSync, existsSync, writeFileSync } from 'node:fs'

function loadEnv() {
  const env = {}
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq < 0) continue
      const key = line.slice(0, eq).trim()
      let val = line.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      env[key] = val
    }
  }
  return env
}

const env = loadEnv()
const get = (k) => (env[k] ?? process.env[k] ?? '').trim()
const strip = (u) => u.replace(/\/+$/, '')

const tenant = get('VITE_UIPATH_TENANT')
const orchestratorUrl = strip(get('VITE_UIPATH_ORCHESTRATOR_URL'))
const identityUrl = strip(get('VITE_UIPATH_IDENTITY_URL')) || `${orchestratorUrl}/identity`
if (/^(1|true|yes)$/i.test(get('VITE_UIPATH_TLS_INSECURE'))) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const clientId = get('VITE_UIPATH_CLIENT_ID')
const clientSecret = get('VITE_UIPATH_CLIENT_SECRET')
const scope =
  get('VITE_UIPATH_SCOPES') ||
  'OR.Jobs.Read OR.Queues.Read OR.Folders.Read OR.Monitoring.Read OR.Execution.Read'
const outFile = process.argv[2] || 'orchestrator-errors.json'

if (!orchestratorUrl || !clientId || !clientSecret) {
  console.error('Missing VITE_UIPATH_ORCHESTRATOR_URL / CLIENT_ID / CLIENT_SECRET in .env')
  process.exit(1)
}

// ── Same keyword rule and normalisation as src/lib/errors.ts + store.ts ────
const SYSTEM_KEYWORDS = [
  'server', 'timeout', 'connection', 'network', 'login', 'unavailable',
  'remote', 'disconnected', '502', '503', 'crashed',
]
const isSystem = (reason) => {
  const lower = reason.toLowerCase()
  return SYSTEM_KEYWORDS.some((k) => lower.includes(k))
}
function normalizeMessage(raw) {
  let m = raw
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g, '<time>')
    .replace(/(?:[A-Za-z]:)?[\\/](?:[\w .()-]+[\\/])+[\w .()-]+/g, '<path>')
    .replace(/0x[0-9a-f]+/gi, '<hex>')
    .replace(/\b\d{4,}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
  m = m.replace(/^(job (has )?(faulted|stopped)[:.]?\s*)/i, '')
  if (m.length > 180) m = `${m.slice(0, 177)}…`
  return m || 'Unspecified error'
}

// ── HTTP ───────────────────────────────────────────────────────────────────
const tokenRes = await fetch(`${identityUrl}/connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope }),
})
if (!tokenRes.ok) {
  console.error(`Token request failed (${tokenRes.status}): ${(await tokenRes.text()).slice(0, 300)}`)
  process.exit(1)
}
const token = (await tokenRes.json()).access_token
const baseHeaders = { Authorization: `Bearer ${token}` }
if (tenant) baseHeaders['X-UIPATH-TenantName'] = tenant

async function odata(path, folderId) {
  const headers = { ...baseHeaders }
  if (folderId !== undefined) headers['X-UIPATH-OrganizationUnitId'] = String(folderId)
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${orchestratorUrl}/odata/${path}`, { headers })
    if (res.ok) return res.json()
    const text = await res.text()
    if (res.status >= 500 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      continue
    }
    throw new Error(`${res.status} for ${path.split('?')[0]} (folder ${folderId}): ${text.slice(0, 300)}`)
  }
}

const PAGE = 1000
async function allPages(path, folderId) {
  const sep = path.includes('?') ? '&' : '?'
  const items = []
  for (let page = 0; ; page++) {
    const res = await odata(`${path}${sep}$top=${PAGE}&$skip=${page * PAGE}`, folderId)
    items.push(...res.value)
    if (res.value.length < PAGE) return items
    if (page >= 200) {
      console.warn(`  ! ${path.split('?')[0]} folder ${folderId}: stopped after ${items.length} records`)
      return items
    }
  }
}

async function pooled(items, fn, size = 5) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return out
}

// ── Folders ────────────────────────────────────────────────────────────────
const folders = (await odata('Folders?$orderby=FullyQualifiedName&$top=1000')).value
console.log(`${folders.length} folders`)

// ── Processes (Releases) and queue definitions ─────────────────────────────
const releases = (
  await pooled(folders, async (f) => {
    const v = await allPages('Releases?$select=Id,Name,ProcessKey,ProcessVersion,Description,CreationTime', f.Id)
    return v.map((r) => ({ ...r, FolderId: f.Id, FolderName: f.DisplayName }))
  })
).flat()
const queueDefs = (
  await pooled(folders, async (f) => {
    const v = await allPages('QueueDefinitions?$select=Id,Name,Description,CreationTime', f.Id)
    return v.map((q) => ({ ...q, FolderId: f.Id, FolderName: f.DisplayName }))
  })
).flat()
console.log(`${releases.length} processes, ${queueDefs.length} queues`)

// ── Job statistics per process (all states, full history) ──────────────────
// Per-folder counts by ReleaseName+State, cheap enough via $apply/groupby is not
// supported everywhere on 22.10, so page through jobs with a narrow $select.
const JOB_SELECT = '$select=Id,State,ReleaseName,CreationTime,EndTime,Info'
const jobs = (
  await pooled(folders, async (f) => {
    const v = await allPages(`Jobs?${JOB_SELECT}&$orderby=CreationTime desc`, f.Id)
    console.log(`  jobs   ${String(v.length).padStart(6)}  ${f.DisplayName}`)
    return v.map((j) => ({ ...j, FolderId: f.Id, FolderName: f.DisplayName }))
  })
).flat()

// ── Queue items: failed / retried / abandoned, full history ────────────────
const QI_SELECT =
  '$select=Id,QueueDefinitionId,Status,ProcessingExceptionType,CreationTime,EndProcessing,Reference,ProcessingException'
const withQueues = folders.filter((f) => queueDefs.some((q) => q.FolderId === f.Id))
const failedItems = (
  await pooled(withQueues, async (f) => {
    const v = await allPages(
      `QueueItems?$filter=Status eq 'Failed' or Status eq 'Retried' or Status eq 'Abandoned'&${QI_SELECT}`,
      f.Id,
    )
    console.log(`  qitems ${String(v.length).padStart(6)}  ${f.DisplayName}`)
    return v.map((q) => ({ ...q, FolderId: f.Id, FolderName: f.DisplayName }))
  })
).flat()

// Queue item totals per queue (all statuses) for the include/exclude sheet.
const queueTotals = new Map()
for (const f of withQueues) {
  for (const q of queueDefs.filter((d) => d.FolderId === f.Id)) {
    const res = await odata(`QueueItems?$filter=QueueDefinitionId eq ${q.Id}&$top=1&$count=true&$select=Id,CreationTime&$orderby=CreationTime desc`, f.Id)
    queueTotals.set(q.Id, { total: res['@odata.count'] ?? null, last: res.value[0]?.CreationTime ?? null })
  }
}

// ── Group errors ───────────────────────────────────────────────────────────
const queueName = new Map(queueDefs.map((q) => [q.Id, q.Name]))
const groups = new Map()
function add(key, fields, occ) {
  let g = groups.get(key)
  if (!g) {
    g = { ...fields, count: 0, firstSeen: occ.time, lastSeen: occ.time, sample: occ.raw, processes: new Set(), folders: new Set() }
    groups.set(key, g)
  }
  g.count++
  if (occ.time < g.firstSeen) g.firstSeen = occ.time
  if (occ.time > g.lastSeen) { g.lastSeen = occ.time; g.sample = occ.raw }
  g.processes.add(occ.process)
  g.folders.add(occ.folder)
}

for (const j of jobs) {
  if (j.State !== 'Faulted') continue
  const raw = j.Info?.trim() || 'No fault details provided'
  const message = normalizeMessage(raw)
  const current = isSystem(raw) ? 'V-Bank IT' : 'Exelentic'
  add(`job::${message}`, { source: 'Job fault (Prozess abgebrochen)', message, currentDashboard: current }, {
    raw, time: j.CreationTime, process: j.ReleaseName, folder: j.FolderName,
  })
}
for (const q of failedItems) {
  const raw = q.ProcessingException?.Reason?.trim() || `${q.Status} without exception reason`
  const message = normalizeMessage(raw)
  const business = q.ProcessingExceptionType === 'BusinessException'
  const source = business
    ? 'Business exception (Warteschlange)'
    : isSystem(raw)
      ? 'System exception (Warteschlange) – IT-Schlüsselwort'
      : 'System exception (Warteschlange)'
  const current = business ? 'Kein Fehler (Business)' : isSystem(raw) ? 'V-Bank IT' : 'Neustartfähiger Vorgang'
  add(`${business ? 'biz' : 'app'}::${message}`, { source, message, currentDashboard: current }, {
    raw, time: q.CreationTime, process: queueName.get(q.QueueDefinitionId) ?? `Queue #${q.QueueDefinitionId}`, folder: q.FolderName,
  })
}

const errors = [...groups.values()]
  .map((g) => ({ ...g, processes: [...g.processes].sort(), folders: [...g.folders].sort() }))
  .sort((a, b) => b.count - a.count)

// ── Process / queue summary ────────────────────────────────────────────────
const jobStats = new Map()
for (const j of jobs) {
  const k = `${j.FolderId}::${j.ReleaseName}`
  const s = jobStats.get(k) ?? { total: 0, faulted: 0, successful: 0, stopped: 0, last: null }
  s.total++
  if (j.State === 'Faulted') s.faulted++
  else if (j.State === 'Successful') s.successful++
  else if (j.State === 'Stopped') s.stopped++
  if (!s.last || j.CreationTime > s.last) s.last = j.CreationTime
  jobStats.set(k, s)
}
const processes = releases.map((r) => {
  const s = jobStats.get(`${r.FolderId}::${r.Name}`) ?? { total: 0, faulted: 0, successful: 0, stopped: 0, last: null }
  return { name: r.Name, processKey: r.ProcessKey, version: r.ProcessVersion, description: r.Description ?? '', folder: r.FolderName, ...s }
})
// Job release names that no longer have a Release (deleted processes) still matter for history.
const known = new Set(releases.map((r) => `${r.FolderId}::${r.Name}`))
for (const [k, s] of jobStats) {
  if (known.has(k)) continue
  const [folderId, name] = k.split('::')
  processes.push({ name, processKey: '', version: '', description: '(Prozess nicht mehr vorhanden – nur Job-Historie)', folder: folders.find((f) => String(f.Id) === folderId)?.DisplayName ?? folderId, ...s })
}

const failedPerQueue = new Map()
for (const q of failedItems) {
  const s = failedPerQueue.get(q.QueueDefinitionId) ?? { failed: 0, business: 0, app: 0 }
  s.failed++
  if (q.ProcessingExceptionType === 'BusinessException') s.business++
  else s.app++
  failedPerQueue.set(q.QueueDefinitionId, s)
}
const queues = queueDefs.map((q) => ({
  name: q.Name, description: q.Description ?? '', folder: q.FolderName,
  total: queueTotals.get(q.Id)?.total ?? null, last: queueTotals.get(q.Id)?.last ?? null,
  ...(failedPerQueue.get(q.Id) ?? { failed: 0, business: 0, app: 0 }),
}))

const out = {
  exportedAt: new Date().toISOString(),
  orchestrator: orchestratorUrl,
  totals: { folders: folders.length, jobs: jobs.length, faultedJobs: jobs.filter((j) => j.State === 'Faulted').length, failedQueueItems: failedItems.length, uniqueErrors: errors.length, processes: processes.length, queues: queues.length },
  errors, processes, queues,
}
writeFileSync(outFile, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out.totals, null, 2))
console.log(`written ${outFile}`)
