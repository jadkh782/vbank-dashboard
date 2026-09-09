import { NavLink, Outlet } from 'react-router-dom'
import { useThemeMode } from '@vbank/ui'
import { signOut } from '../auth/useSession'

const NAV = [
  { to: '/', label: 'Tagesprüfung', end: true },
  { to: '/manuelle-fehler', label: 'Manuelle Fehler' },
  { to: '/auswertung', label: 'Auswertung' },
  { to: '/automatisierungen', label: 'Automatisierungen' },
  { to: '/fehlerkatalog', label: 'Fehlerkatalog' },
  { to: '/einstellungen', label: 'Einstellungen' },
]

export function Shell({ email }: { email: string | undefined }) {
  const { mode, toggle } = useThemeMode()
  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-left">
          <span className="wordmark">
            EXELENTIC<span> /</span> Vbank
          </span>
          <span className="masthead-title">
            <b>Control Board</b> · V-Bank Automatisierung
          </span>
        </div>
        <div className="masthead-right">
          {email ? <span className="datenstand">{email}</span> : null}
          <button className="theme-toggle" onClick={toggle}>
            {mode === 'light' ? 'Dunkel' : 'Hell'}
          </button>
          <button className="theme-toggle" onClick={() => void signOut()}>
            Abmelden
          </button>
        </div>
      </header>
      <nav className="nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
      <footer className="footer">
        <span>Exelentic GmbH · Control Board</span>
        <span>intern — nicht für die V-Bank bestimmt</span>
      </footer>
    </div>
  )
}
