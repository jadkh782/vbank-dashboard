import { useEffect, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ThemeContext, type ThemeMode } from '@vbank/ui'
import { AuthGate } from './auth/AuthGate'
import { useSession } from './auth/useSession'
import { Shell } from './components/Shell'
import { DaysList } from './pages/DaysList'
import { DayReview } from './pages/DayReview'
import { ManuelleFehler } from './pages/ManuelleFehler'
import { Auswertung } from './pages/Auswertung'
import { Automatisierungen } from './pages/Automatisierungen'
import { Fehlerkatalog } from './pages/Fehlerkatalog'
import { Einstellungen } from './pages/Einstellungen'

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } })

function Routed() {
  const { session } = useSession()
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell email={session?.user.email} />}>
          <Route index element={<DaysList />} />
          <Route path="tage/:day" element={<DayReview />} />
          <Route path="manuelle-fehler" element={<ManuelleFehler />} />
          <Route path="auswertung" element={<Auswertung />} />
          <Route path="automatisierungen" element={<Automatisierungen />} />
          <Route path="fehlerkatalog" element={<Fehlerkatalog />} />
          <Route path="einstellungen" element={<Einstellungen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  const [mode, setMode] = useState<ThemeMode>(() => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  useEffect(() => {
    document.documentElement.dataset.theme = mode
  }, [mode])
  const themeApi = useMemo(() => ({ mode, toggle: () => setMode((m) => (m === 'light' ? 'dark' : 'light')) }), [mode])

  const configured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

  return (
    <ThemeContext.Provider value={themeApi}>
      <QueryClientProvider client={queryClient}>
        {configured ? (
          <AuthGate>
            <Routed />
          </AuthGate>
        ) : (
          <div className="state-block" style={{ paddingTop: 120 }}>
            <b>Konfiguration fehlt.</b>
            VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY in apps/control-board/.env eintragen (siehe .env.example).
          </div>
        )}
      </QueryClientProvider>
    </ThemeContext.Provider>
  )
}
