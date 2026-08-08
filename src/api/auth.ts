// Token management for the two supported credential styles:
//  A. Personal Access Token  -> used directly as the Bearer token
//  B. External Application   -> client-credentials flow against /identity/connect/token
//     (proxied by the dev server to cloud.uipath.com/identity_), cached and
//     refreshed 60s before expiry.

const env = import.meta.env

export interface AuthConfig {
  org: string
  tenant: string
  configured: boolean
  mode: 'pat' | 'client' | 'none'
}

export function getAuthConfig(): AuthConfig {
  const org = (env.VITE_UIPATH_ORG ?? '').trim()
  const tenant = (env.VITE_UIPATH_TENANT ?? '').trim()
  const pat = (env.VITE_UIPATH_PAT ?? '').trim()
  const clientId = (env.VITE_UIPATH_CLIENT_ID ?? '').trim()
  const clientSecret = (env.VITE_UIPATH_CLIENT_SECRET ?? '').trim()

  const placeholder = org === 'your-org-name' || tenant === 'your-tenant-name'
  const hasIdentity = org !== '' && tenant !== '' && !placeholder
  const mode: AuthConfig['mode'] = pat ? 'pat' : clientId && clientSecret ? 'client' : 'none'

  return { org, tenant, configured: hasIdentity && mode !== 'none', mode }
}

let cachedToken: { token: string; expiresAt: number } | null = null

export async function getAccessToken(): Promise<string> {
  const pat = (env.VITE_UIPATH_PAT ?? '').trim()
  if (pat) return pat

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: (env.VITE_UIPATH_CLIENT_ID ?? '').trim(),
    client_secret: (env.VITE_UIPATH_CLIENT_SECRET ?? '').trim(),
    scope:
      (env.VITE_UIPATH_SCOPES ?? '').trim() ||
      'OR.Jobs.Read OR.Queues.Read OR.Folders.Read OR.Monitoring.Read OR.Execution.Read',
  })

  const res = await fetch('/identity/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Token request failed (${res.status}). Check client ID, secret and scopes in .env. ${text.slice(0, 300)}`,
    )
  }

  const json = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
  return cachedToken.token
}
