import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { Agent as HttpsAgent } from 'node:https'

// Orchestrator does not allow cross-origin browser calls, so the dev server
// forwards them: /orch/* -> the Orchestrator API and /identity/* -> the
// identity server (token endpoint).
//
// Because the proxy runs on THIS machine, a self-hosted Orchestrator that is
// only reachable through a VPN (e.g. Barracuda) works as soon as the VPN client
// is connected here — the browser never talks to Orchestrator directly.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const org = env.VITE_UIPATH_ORG ?? ''
  const tenant = env.VITE_UIPATH_TENANT ?? ''
  const base = (env.VITE_UIPATH_BASE_URL ?? 'https://cloud.uipath.com').replace(/\/+$/, '')

  // Self-hosted (standalone / Automation Suite): explicit URLs win.
  // Automation Cloud: derived from org + tenant.
  const orchestratorUrl = (env.VITE_UIPATH_ORCHESTRATOR_URL ?? '').trim().replace(/\/+$/, '')
  const identityUrl = (env.VITE_UIPATH_IDENTITY_URL ?? '').trim().replace(/\/+$/, '')
  const orchTarget = orchestratorUrl || `${base}/${org}/${tenant}/orchestrator_`
  const identityTarget = identityUrl || `${base}/identity_`

  // Internal CA / self-signed certificate on a self-hosted Orchestrator.
  const insecureTls = /^(1|true|yes)$/i.test((env.VITE_UIPATH_TLS_INSECURE ?? '').trim())

  const split = (url: string) => {
    const u = new URL(url)
    return { origin: u.origin, path: u.pathname.replace(/\/+$/, '') }
  }
  const orch = split(orchTarget)
  const identity = split(identityTarget)

  // Reuse upstream connections. Without keep-alive every proxied request opens
  // a new TLS connection, which through the VPN costs ~2.3 s each — with 90
  // folder queries per refresh that made the first load take over a minute.
  const agent = new HttpsAgent({ keepAlive: true, maxSockets: 8, rejectUnauthorized: !insecureTls })

  const proxy = {
    '/orch': {
      target: orch.origin,
      changeOrigin: true,
      secure: !insecureTls,
      agent,
      rewrite: (path: string) => path.replace(/^\/orch/, orch.path),
    },
    '/identity': {
      target: identity.origin,
      changeOrigin: true,
      secure: !insecureTls,
      agent,
      rewrite: (path: string) => path.replace(/^\/identity/, identity.path),
    },
  }

  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    // `npm run serve` — production build with the same proxy, for hosting on a
    // VPN-connected machine. allowedHosts lets a tunnel hostname (Cloudflare,
    // ngrok) reach it; the machine itself decides who may connect.
    preview: { port: 4173, host: true, proxy, allowedHosts: true },
  }
})
