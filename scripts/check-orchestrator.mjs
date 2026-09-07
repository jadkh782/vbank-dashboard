// Connectivity check for the Orchestrator connection configured in .env.
// Runs on this machine (so through the VPN if the VPN client is connected),
// exactly like the dev-server proxy does:
//   1. requests a token with the External Application (or uses the PAT)
//   2. lists folders
//   3. counts jobs in the first folder
//
//   npm run check
import { readFileSync, existsSync } from 'node:fs'

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

const org = get('VITE_UIPATH_ORG')
const tenant = get('VITE_UIPATH_TENANT')
const base = strip(get('VITE_UIPATH_BASE_URL') || 'https://cloud.uipath.com')
const selfHosted = get('VITE_UIPATH_ORCHESTRATOR_URL') !== ''
const orchestratorUrl = strip(get('VITE_UIPATH_ORCHESTRATOR_URL')) || `${base}/${org}/${tenant}/orchestrator_`
const identityUrl = strip(get('VITE_UIPATH_IDENTITY_URL')) || `${base}/identity_`
const insecure = /^(1|true|yes)$/i.test(get('VITE_UIPATH_TLS_INSECURE'))
if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const pat = get('VITE_UIPATH_PAT')
const clientId = get('VITE_UIPATH_CLIENT_ID')
const clientSecret = get('VITE_UIPATH_CLIENT_SECRET')
const scope =
  get('VITE_UIPATH_SCOPES') ||
  'OR.Jobs.Read OR.Queues.Read OR.Folders.Read OR.Monitoring.Read OR.Execution.Read'

const ok = (m) => console.log(`  [ok]   ${m}`)
const fail = (m, hint) => {
  console.error(`  [FAIL] ${m}`)
  if (hint) console.error(`         -> ${hint}`)
  process.exit(1)
}

console.log('Orchestrator connectivity check')
console.log(`  mode        : ${selfHosted ? 'self-hosted' : 'Automation Cloud'}`)
console.log(`  orchestrator: ${orchestratorUrl}`)
console.log(`  identity    : ${identityUrl}`)
console.log(`  tenant      : ${tenant || '(none)'}`)
console.log(
  `  credentials : ${pat ? 'Personal Access Token' : clientId ? `External Application ${clientId}` : 'NONE'}`,
)
console.log(`  TLS         : ${insecure ? 'certificate check DISABLED' : 'verified'}`)
console.log()

if (!pat && !(clientId && clientSecret)) {
  fail('No credentials in .env', 'Set VITE_UIPATH_PAT or VITE_UIPATH_CLIENT_ID + VITE_UIPATH_CLIENT_SECRET.')
}
if (!selfHosted && (!org || !tenant || org === 'your-org-name')) {
  fail(
    'VITE_UIPATH_ORG / VITE_UIPATH_TENANT not set',
    'For a self-hosted Orchestrator set VITE_UIPATH_ORCHESTRATOR_URL (+ VITE_UIPATH_IDENTITY_URL) instead.',
  )
}

async function request(url, init) {
  try {
    return await fetch(url, init)
  } catch (e) {
    const cause = e?.cause ?? e
    const code = String(cause?.code ?? '')
    let hint = ''
    if (/ENOTFOUND|EAI_AGAIN/.test(code)) {
      hint = 'Host name could not be resolved. Is the VPN connected? Does the URL use the internal host name?'
    } else if (/ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH/.test(code) || /timeout/i.test(String(cause?.message))) {
      hint = 'Host unreachable. Connect the Barracuda VPN client on this machine and retry.'
    } else if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO/.test(code)) {
      hint =
        'Certificate not trusted (internal CA). Set VITE_UIPATH_TLS_INSECURE=true for now, or import the CA certificate and start with NODE_EXTRA_CA_CERTS.'
    }
    fail(`Network error contacting ${url}: ${cause?.message ?? e}`, hint)
  }
}

// 1. Token
let token = pat
if (!token) {
  const tokenUrl = `${identityUrl}/connect/token`
  const res = await request(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    let hint
    if (res.status === 400 && /invalid_scope/.test(text)) {
      hint =
        'One of VITE_UIPATH_SCOPES is not granted to the External Application. Compare with its Application scopes and remove the missing ones.'
    } else if (res.status === 400 || res.status === 401) {
      hint = 'Check VITE_UIPATH_CLIENT_ID / VITE_UIPATH_CLIENT_SECRET (the secret is only shown once when created).'
    } else if (res.status === 404) {
      hint =
        'Token endpoint not found. Standalone Orchestrator: VITE_UIPATH_IDENTITY_URL=https://<host>/identity. Automation Suite: https://<host>/identity_.'
    }
    fail(`Token request failed (${res.status}) at ${tokenUrl}: ${text.slice(0, 300)}`, hint)
  }
  let json
  try {
    json = JSON.parse(text)
  } catch {
    fail(`Token endpoint returned no JSON. Is ${tokenUrl} the identity server? First bytes: ${text.slice(0, 120)}`)
  }
  token = json.access_token
  ok(`Token obtained (expires in ${json.expires_in}s, scopes: ${json.scope ?? scope})`)
}

const headers = { Authorization: `Bearer ${token}` }
if (selfHosted && tenant) headers['X-UIPATH-TenantName'] = tenant

// 2. Folders
const foldersUrl = `${orchestratorUrl}/odata/Folders?$top=50&$orderby=FullyQualifiedName`
let res = await request(foldersUrl, { headers })
let body = await res.text()
if (!res.ok) {
  let hint
  if (res.status === 401) {
    hint =
      'Token rejected. Self-hosted: check VITE_UIPATH_TENANT (sent as X-UIPATH-TenantName) and that the External Application belongs to this Orchestrator.'
  } else if (res.status === 403) {
    hint = 'Token accepted but not allowed. The External Application needs OR.Folders.Read (application scope).'
  } else if (res.status === 404) {
    hint =
      'URL not found. Standalone Orchestrator: VITE_UIPATH_ORCHESTRATOR_URL=https://<host>. Automation Suite: https://<host>/<org>/<tenant>/orchestrator_.'
  }
  fail(`Folders request failed (${res.status}) at ${foldersUrl}: ${body.slice(0, 300)}`, hint)
}
let folders
try {
  folders = JSON.parse(body).value
} catch {
  fail(
    `Folders endpoint returned no JSON (HTML?). The URL probably points at the web UI, not the API. First bytes: ${body.slice(0, 120)}`,
  )
}
ok(`${folders.length} folder(s) visible: ${folders.map((f) => f.DisplayName).join(', ') || '(none)'}`)
if (folders.length === 0) {
  fail(
    'No folders visible',
    'The External Application has no folder access. Ask the Orchestrator admin to assign it to the folders (Folders -> Manage access).',
  )
}

// 3. Jobs in first folder (last 7 days)
const since = new Date(Date.now() - 7 * 864e5).toISOString()
const f = folders[0]
const jobsUrl = `${orchestratorUrl}/odata/Jobs?$filter=CreationTime ge ${since}&$top=1&$count=true`
res = await request(jobsUrl, { headers: { ...headers, 'X-UIPATH-OrganizationUnitId': String(f.Id) } })
body = await res.text()
if (!res.ok) {
  fail(
    `Jobs request failed (${res.status}) in folder "${f.DisplayName}": ${body.slice(0, 300)}`,
    res.status === 403 ? 'Needs OR.Jobs.Read.' : undefined,
  )
}
const count = JSON.parse(body)['@odata.count']
ok(`Jobs readable: ${count ?? '?'} job(s) in "${f.DisplayName}" in the last 7 days`)

console.log('\nAll good. Start the dashboard with: npm run dev')
