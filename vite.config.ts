import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The UiPath Cloud API does not allow cross-origin browser calls, so the dev
// server forwards them: /orch/* -> the tenant's Orchestrator API and
// /identity/* -> the cloud identity server (token endpoint).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const org = env.VITE_UIPATH_ORG ?? ''
  const tenant = env.VITE_UIPATH_TENANT ?? ''
  const base = env.VITE_UIPATH_BASE_URL ?? 'https://cloud.uipath.com'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/orch': {
          target: base,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/orch/, `/${org}/${tenant}/orchestrator_`),
        },
        '/identity': {
          target: base,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/identity/, '/identity_'),
        },
      },
    },
  }
})
