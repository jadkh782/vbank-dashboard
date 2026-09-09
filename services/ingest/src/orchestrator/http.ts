// HTTP to Orchestrator: one keep-alive connection pool (a new TLS handshake to
// this host costs ~2.3 s through the VPN), client-credentials token cache,
// OData paging without the browser's 10-page cap, retries on transient errors.

import { Agent, fetch as undiciFetch } from 'undici'
import { config } from '../config'
import { log, sleep } from '../log'

export class OrchestratorError extends Error {
  constructor(
    public status: number,
    message: string,
    public path?: string,
  ) {
    super(message)
  }
}

let agent: Agent | null = null
function dispatcher(): Agent {
  if (!agent) {
    agent = new Agent({
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 120_000,
      connections: 8,
      connect: { rejectUnauthorized: !config().tlsInsecure },
    })
  }
  return agent
}

// ── Token ───────────────────────────────────────────────────────────────────
let token: { value: string; expiresAt: number } | null = null

export async function getToken(force = false): Promise<string> {
  if (!force && token && token.expiresAt > Date.now() + 60_000) return token.value
  const c = config()
  const res = await undiciFetch(`${c.identityUrl}/connect/token`, {
    method: 'POST',
    dispatcher: dispatcher(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: c.clientId,
      client_secret: c.clientSecret,
      scope: c.scopes,
    }),
  })
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300)
    // A 403 HTML page means the public gateway answered — the VPN is not up.
    throw new OrchestratorError(res.status, `Token request failed (${res.status}): ${text}`, 'connect/token')
  }
  const body = (await res.json()) as { access_token: string; expires_in?: number }
  token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 }
  return token.value
}

// ── OData ───────────────────────────────────────────────────────────────────
export interface ODataResponse<T> {
  '@odata.count'?: number
  value: T[]
}

const RETRIES = 4

export async function odata<T = unknown>(path: string, folderId?: number): Promise<T> {
  const c = config()
  const url = `${c.orchUrl}/odata/${path}`
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await getToken(attempt > 0)}`,
      'X-UIPATH-TenantName': c.tenant,
    }
    if (folderId !== undefined) headers['X-UIPATH-OrganizationUnitId'] = String(folderId)
    let res
    try {
      res = await undiciFetch(url, { headers, dispatcher: dispatcher() })
    } catch (e) {
      if (attempt < RETRIES) {
        await sleep(1500 * (attempt + 1))
        continue
      }
      throw new OrchestratorError(0, `Network error for ${path.split('?')[0]}: ${(e as Error).message}`, path)
    }
    if (res.ok) return (await res.json()) as T
    const text = (await res.text()).slice(0, 300)
    if ((res.status === 429 || res.status >= 500 || res.status === 401) && attempt < RETRIES) {
      log.warn(`${res.status} for ${path.split('?')[0]} (folder ${folderId ?? '-'}), retry ${attempt + 1}`)
      await sleep(1500 * (attempt + 1))
      continue
    }
    throw new OrchestratorError(res.status, `${res.status} for ${path.split('?')[0]} (folder ${folderId ?? '-'}): ${text}`, path)
  }
}

const PAGE = 1000
const MAX_PAGES = 500

/** Every page of an OData collection (no artificial cap: backfills need it all). */
export async function allPages<T>(path: string, folderId?: number): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?'
  const items: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await odata<ODataResponse<T>>(`${path}${sep}$top=${PAGE}&$skip=${page * PAGE}`, folderId)
    items.push(...res.value)
    if (res.value.length < PAGE) return items
  }
  log.warn(`${path.split('?')[0]} folder ${folderId}: stopped after ${items.length} records (page cap)`)
  return items
}

export function odataDate(d: Date): string {
  return d.toISOString()
}

export async function closeHttp(): Promise<void> {
  await agent?.close()
  agent = null
}
