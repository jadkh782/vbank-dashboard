import { useEffect, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { deDate } from '@vbank/shared'
import { ThemeContext, type ThemeMode } from '@vbank/ui'
import { createDataSource, type DataSource } from './data/source'
import { DataSourceContext, useAutomations, useDatenstand } from './data/useDashboardData'
import { WindowProvider, useWindow } from './state/WindowContext'
import { AuthGate } from './auth/AuthGate'
import { signOut } from './auth/useSession'
import { Header } from './components/Header'
import { WindowBar } from './components/WindowBar'
import { StakeholderView } from './pages/stakeholder/StakeholderView'

const queryClient = new QueryClient()

function Shell({ source }: { source: DataSource }) {
  const { datenstand, from, to } = useWindow()
  const automations = useAutomations()
  const qc = useQueryClient()

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

  const folders = useMemo(() => [...new Set((automations.data ?? []).map((a) => a.folder))].sort(), [automations.data])

  return (
    <div className="app">
      <Header
        datenstand={datenstand}
        onPresent={enterPresentation}
        onSignOut={source.kind === 'supabase' ? () => void signOut() : undefined}
      />
      <div className="print-period">
        Automatisierung bei der V-Bank · Zeitraum {from.toLocaleString('de-DE')} – {to.toLocaleString('de-DE')}
      </div>
      <WindowBar folders={folders} />
      <StakeholderView />
      <footer className="footer">
        <span>Exelentic GmbH · Automatisierung bei der V-Bank</span>
        <span>
          Datenstand {deDate(datenstand)} ·{' '}
          <button className="linklike" onClick={() => void qc.invalidateQueries()}>
            Aktualisieren
          </button>
        </span>
      </footer>
    </div>
  )
}

/** Loads the Datenstand first: every window is anchored to it. */
function Boot({ source }: { source: DataSource }) {
  const q = useDatenstand()
  if (q.isLoading) {
    return (
      <div className="state-block" style={{ paddingTop: 120 }}>
        <b>Daten werden geladen…</b>
      </div>
    )
  }
  if (q.error) {
    return <div className="error-banner">Datenabruf fehlgeschlagen: {(q.error as Error).message}</div>
  }
  if (!q.data) {
    return (
      <div className="state-block" style={{ paddingTop: 120 }}>
        <b>Noch keine Daten verfügbar.</b>
        Der Statusbericht wird bereitgestellt, sobald der erste Berichtstag vorliegt.
      </div>
    )
  }
  return (
    <WindowProvider datenstand={q.data}>
      <Shell source={source} />
    </WindowProvider>
  )
}

export default function App() {
  const [mode, setMode] = useState<ThemeMode>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const [source, setSource] = useState<DataSource | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = mode
  }, [mode])

  useEffect(() => {
    void createDataSource().then(setSource)
  }, [])

  const themeApi = useMemo(() => ({ mode, toggle: () => setMode((m) => (m === 'light' ? 'dark' : 'light')) }), [mode])

  if (!source) return null

  const content = <Boot source={source} />
  return (
    <ThemeContext.Provider value={themeApi}>
      <QueryClientProvider client={queryClient}>
        <DataSourceContext.Provider value={source}>
          {source.kind === 'demo' ? content : <AuthGate>{content}</AuthGate>}
        </DataSourceContext.Provider>
      </QueryClientProvider>
    </ThemeContext.Provider>
  )
}
