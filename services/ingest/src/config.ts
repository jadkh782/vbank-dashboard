// Configuration from the environment (`node --env-file=.env`, see package.json).

function req(name: string): string {
  const v = (process.env[name] ?? '').trim()
  if (!v) throw new Error(`Missing ${name} in the environment (.env)`)
  return v
}
const opt = (name: string, fallback: string) => (process.env[name] ?? '').trim() || fallback
const strip = (u: string) => u.replace(/\/+$/, '')

export interface Config {
  orchUrl: string
  identityUrl: string
  tenant: string
  clientId: string
  clientSecret: string
  scopes: string
  tlsInsecure: boolean
  supabaseUrl: string
  supabaseServiceKey: string
  lookbackDays: number
  dailyAt: { hour: number; minute: number }
  pollMs: number
  folderConcurrency: number
}

let cached: Config | null = null

export function config(): Config {
  if (cached) return cached
  const orchUrl = strip(req('ORCH_URL'))
  const [h, m] = opt('DAILY_AT', '02:00').split(':').map(Number)
  cached = {
    orchUrl,
    identityUrl: strip(opt('IDENTITY_URL', `${orchUrl}/identity`)),
    tenant: opt('TENANT', 'Default'),
    clientId: req('CLIENT_ID'),
    clientSecret: req('CLIENT_SECRET'),
    scopes: opt('SCOPES', 'OR.Jobs.Read OR.Queues.Read OR.Folders.Read OR.Monitoring.Read OR.Execution.Read'),
    tlsInsecure: /^(1|true|yes)$/i.test(opt('TLS_INSECURE', '')),
    supabaseUrl: strip(req('SUPABASE_URL')),
    supabaseServiceKey: req('SUPABASE_SERVICE_ROLE_KEY'),
    lookbackDays: Number(opt('LOOKBACK_DAYS', '3')),
    dailyAt: { hour: h, minute: m || 0 },
    pollMs: Number(opt('POLL_MS', '30000')),
    folderConcurrency: Number(opt('FOLDER_CONCURRENCY', '5')),
  }
  return cached
}

/** Only the Orchestrator part — for `check` before Supabase is configured. */
export function orchestratorConfigured(): boolean {
  return !!(process.env.ORCH_URL && process.env.CLIENT_ID && process.env.CLIENT_SECRET)
}
