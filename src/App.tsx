import { useEffect, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeContext, type ThemeMode } from './theme'
import { FilterProvider, useFilters } from './state/FilterContext'
import { getAuthConfig } from './api/auth'
import { isDemoMode } from './api/demo'
import { useTenantData } from './hooks/useOrchestrator'
import { Header, type PageKey, type ViewKey } from './components/layout/Header'
import { FilterBar } from './components/layout/FilterBar'
import { StakeholderFilterBar } from './components/layout/StakeholderFilterBar'
import { StakeholderView } from './pages/stakeholder/StakeholderView'
import { Overview } from './pages/Overview'
import { Kennzahlen } from './pages/Kennzahlen'
import { Jobs } from './pages/Jobs'
import { Queues } from './pages/Queues'
import { Errors } from './pages/Errors'
import { ManualErrors } from './pages/ManualErrors'
import { Settings } from './pages/Settings'

const queryClient = new QueryClient()

function SetupPanel() {
  const auth = getAuthConfig()
  return (
    <div className="setup-panel">
      <h1>Connect to UiPath Orchestrator</h1>
      <p>
        This dashboard reads live data from your Automation Cloud tenant. It needs credentials in a local{' '}
        <code>.env</code> file before it can start.
      </p>
      <ol>
        <li>
          In the project folder, copy <code>.env.example</code> to <code>.env</code>.
        </li>
        <li>
          Set <code>VITE_UIPATH_ORG</code> and <code>VITE_UIPATH_TENANT</code> (the two names in your
          Orchestrator URL: <code>cloud.uipath.com/&#123;org&#125;/&#123;tenant&#125;</code>).
        </li>
        <li>
          Add either a Personal Access Token (<code>VITE_UIPATH_PAT</code>) or an External Application's{' '}
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

function initialView(): ViewKey {
  const p = new URLSearchParams(window.location.search).get('view')
  if (p === 'technical' || p === 'stakeholder') return p
  return localStorage.getItem('vbank-view') === 'technical' ? 'technical' : 'stakeholder'
}

function Shell() {
  const [view, setView] = useState<ViewKey>(initialView)
  const [page, setPage] = useState<PageKey>('overview')
  const { refreshMs, from, to } = useFilters()
  const { data, error, isLoading, isFetching, refetch, folders } = useTenantData()

  const switchView = (v: ViewKey) => {
    setView(v)
    localStorage.setItem('vbank-view', v)
  }

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

  const stake = view === 'stakeholder'

  return (
    <div className="app">
      <Header
        view={view}
        onSwitchView={switchView}
        page={page}
        onNavigate={setPage}
        lastUpdated={data?.fetchedAt ?? null}
        live={refreshMs !== false}
        onPresent={enterPresentation}
      />
      {stake ? (
        <div className="print-period">
          Automatisierung bei der V-Bank · Zeitraum {from.toLocaleString('de-DE')} –{' '}
          {to.toLocaleString('de-DE')}
        </div>
      ) : null}
      {stake ? (
        <StakeholderFilterBar folders={folders.data ?? []} />
      ) : (
        <FilterBar folders={folders.data ?? []} onRefresh={() => refetch()} />
      )}

      {folders.error ? (
        <div className="error-banner">
          {stake ? 'Verbindung zu UiPath Orchestrator fehlgeschlagen: ' : 'Could not reach Orchestrator: '}
          {(folders.error as Error).message}
        </div>
      ) : error ? (
        <div className="error-banner">
          {stake ? 'Datenabruf fehlgeschlagen: ' : 'Data request failed: '}
          {(error as Error).message}
        </div>
      ) : null}

      {isLoading && !data ? (
        <div className="state-block" style={{ paddingTop: 90 }}>
          <b>{stake ? 'Daten werden geladen…' : 'Loading tenant data…'}</b>
          {stake
            ? 'Aktuelle Zahlen werden aus UiPath Orchestrator abgerufen.'
            : 'Fetching jobs, queues and alerts from Orchestrator.'}
        </div>
      ) : null}

      {data?.truncated && !stake ? (
        <div className="notice">
          Large result set: some queries hit the 10,000-record safety cap, so figures for this window may be
          partial. Narrow the time range for exact numbers.
        </div>
      ) : null}

      {data ? (
        stake ? (
          <StakeholderView onShowTechnical={() => switchView('technical')} />
        ) : (
          <>
            {page === 'overview' ? <Overview /> : null}
            {page === 'kennzahlen' ? <Kennzahlen /> : null}
            {page === 'jobs' ? <Jobs /> : null}
            {page === 'queues' ? <Queues /> : null}
            {page === 'errors' ? <Errors /> : null}
            {page === 'manual' ? <ManualErrors /> : null}
            {page === 'settings' ? <Settings /> : null}
          </>
        )
      ) : null}

      <footer className="footer">
        <span>Exelentic GmbH · Vbank Intelligent Analysis Dashboard</span>
        <span>
          {stake
            ? `Quelle: ${isDemoMode() ? 'Demodaten' : 'UiPath Orchestrator'} · Daten werden automatisch aktualisiert`
            : `Source: ${isDemoMode() ? 'Demo data (remove ?demo from the URL for live data)' : 'UiPath Orchestrator'} · data refreshes ${refreshMs === false ? 'manually' : 'automatically'}`}
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
