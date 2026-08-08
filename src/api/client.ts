import { getAccessToken } from './auth'
import type { ODataResponse } from './types'

export class OrchestratorError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const PAGE_SIZE = 1000
const MAX_PAGES_PER_QUERY = 10 // safety cap: 10,000 records per query per folder

async function orchFetch<T>(path: string, folderId?: number): Promise<ODataResponse<T>> {
  const token = await getAccessToken()
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (folderId !== undefined) headers['X-UIPATH-OrganizationUnitId'] = String(folderId)

  const res = await fetch(`/orch/${path}`, { headers })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new OrchestratorError(res.status, `Orchestrator request failed (${res.status}) for ${path.split('?')[0]}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as ODataResponse<T>
}

export interface PagedResult<T> {
  items: T[]
  truncated: boolean
}

/** Fetch every page of an OData query (up to the safety cap). `path` must not contain $top/$skip. */
export async function fetchAllPages<T>(path: string, folderId?: number): Promise<PagedResult<T>> {
  const sep = path.includes('?') ? '&' : '?'
  const items: T[] = []
  for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
    const paged = `${path}${sep}$top=${PAGE_SIZE}&$skip=${page * PAGE_SIZE}`
    const res = await orchFetch<T>(paged, folderId)
    items.push(...res.value)
    if (res.value.length < PAGE_SIZE) return { items, truncated: false }
  }
  return { items, truncated: true }
}

export async function fetchOne<T>(path: string, folderId?: number): Promise<ODataResponse<T>> {
  return orchFetch<T>(path, folderId)
}

/** For endpoints that return a single object rather than an OData collection. */
export async function fetchRaw<T>(path: string, folderId?: number): Promise<T> {
  const token = await getAccessToken()
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (folderId !== undefined) headers['X-UIPATH-OrganizationUnitId'] = String(folderId)
  const res = await fetch(`/orch/${path}`, { headers })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new OrchestratorError(res.status, `Orchestrator request failed (${res.status}) for ${path.split('?')[0]}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

/** OData datetime literal (UTC, no quotes). */
export function odataDate(d: Date): string {
  return d.toISOString()
}
