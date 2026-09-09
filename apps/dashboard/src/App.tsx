import { useEffect, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeContext, type ThemeMode } from '@vbank/ui'
import { FilterProvider, useFilters } from './state/FilterContext'
import { getAuthConfig } from './api/auth'
import { isDemoMode } from './api/demo'
import { useTenantData } from './hooks/useOrchestrator'
import { Header } from './components/layout/Header'
import { StakeholderFilterBar } from './components/layout/StakeholderFilterBar'
import { StakeholderView } from './pages/stakeholder/StakeholderView'

const queryClient = new QueryClient()

function SetupPanel() {
  const auth = getAuthConfig()
  return (
    <div className="setup-panel">
      <h1>Connect to UiPath Orchestrator</h1>
      <p>
        This dashboard reads live data from your Orchestrator tenant. It needs credentials in a local{' '}
        <code>.env</code> file before it can start.
      </p>
      <ol>
        <li>
          In the project folder, copy <code>.env.example</code> to <code>.env</code>.
        </li>
        <li>
          Self-hosted Orchestrator (e.g. behind a VPN): set <code>VITE_UIPATH_ORCHESTRATOR_URL</code>,{' '}
          <code>VITE_UIPATH_IDENTITY_URL</code> and <code>VITE_UIPATH_TENANT</code>. Automation Cloud: set{' '}
          <code>VITE_UIPATH_ORG</code> and <code>VITE_UIPATH_TENANT</code> instead.
        </li>
        <li>
          Add either a Personal Access Token (<code>VITE_UIPATH_PAT</code>) or an External Application&apos;s{' '}
          <code>VITE_UIPATH_CLIENT_ID</code> and <code>VITE_UIPATH_CLIENT_SECRET</code> with read scopes for
          Jobs, Queues, Folders, Execution and Monitoring.
        </li>
        <li>Restart the dev server — environment changes are read at startup.</li>
      </ol>
      {auth.mode === 'none' && auth.org ? (
        <div className="notice">Org and tenant are set, but no credentials were found in .env.</div>
      ) : null}
    </div>
  )
}

function Shell() {
  const { refreshMs, from, to } = useFilters()
  const { data, error, isLoading, folders } = useTenantData()

  // Presentation mode: fullscreen + larger type for meeting-room screens.
  // Leaving fullscreen (Esc or the browser's own control) always exits.
  const enterPresentation = () => {
    document.documentElement.dataset.presentation = 'true'
    void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) delete document.documentElement.dataset.presentation
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  return (
    <div className="app">
      <Header lastUpdated={data?.fetchedAt ?? null} live={refreshMs !== false} onPresent={enterPresentation} />
      <div className="print-period">
        Automatisierung bei der V-Bank · Zeitraum {from.toLocaleString('de-DE')} – {to.toLocaleString('de-DE')}
      </div>
      <StakeholderFilterBar folders={folders.data ?? []} />

      {folders.error ? (
        <div className="error-banner">
          Verbindung zu UiPath Orchestrator fehlgeschlagen: {(folders.error as Error).message}
        </div>
      ) : error ? (
        <div className="error-banner">Datenabruf fehlgeschlagen: {(error as Error).message}</div>
      ) : null}

      {isLoading && !data ? (
        <div className="state-block" style={{ paddingTop: 90 }}>
          <b>Daten werden geladen…</b>
          Aktuelle Zahlen werden aus UiPath Orchestrator abgerufen.
        </div>
      ) : null}

      {data ? <StakeholderView /> : null}

      <footer className="footer">
        <span>Exelentic GmbH · Automatisierung bei der V-Bank</span>
        <span>
          Quelle: {isDemoMode() ? 'Demodaten' : 'UiPath Orchestrator'} · Daten werden automatisch aktualisiert
        </span>
      </footer>
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState<ThemeMode>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = mode
  }, [mode])

  const themeApi = useMemo(
    () => ({ mode, toggle: () => setMode((m) => (m === 'light' ? 'dark' : 'light')) }),
    [mode],
  )

  const configured = getAuthConfig().configured || isDemoMode()

  return (
    <ThemeContext.Provider value={themeApi}>
      <QueryClientProvider client={queryClient}>
        <FilterProvider>{configured ? <Shell /> : <SetupPanel />}</FilterProvider>
      </QueryClientProvider>
    </ThemeContext.Provider>
  )
}
