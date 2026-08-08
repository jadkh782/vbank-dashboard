import { useThemeMode } from '../../theme'

export type PageKey = 'overview' | 'kennzahlen' | 'jobs' | 'queues' | 'errors' | 'manual' | 'settings'
export type ViewKey = 'stakeholder' | 'technical'

const PAGES: { key: PageKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'kennzahlen', label: 'Kennzahlen' },
  { key: 'jobs', label: 'Jobs & Processes' },
  { key: 'queues', label: 'Queues & Transactions' },
  { key: 'errors', label: 'Errors & Alerts' },
  { key: 'manual', label: 'Manual Errors' },
  { key: 'settings', label: 'Settings' },
]

export function Header({
  view,
  onSwitchView,
  page,
  onNavigate,
  lastUpdated,
  live,
  onPresent,
}: {
  view: ViewKey
  onSwitchView: (v: ViewKey) => void
  page: PageKey
  onNavigate: (p: PageKey) => void
  lastUpdated: number | null
  live: boolean
  onPresent: () => void
}) {
  const { mode, toggle } = useThemeMode()
  const stake = view === 'stakeholder'

  return (
    <>
      <header className="masthead">
        <div className="masthead-left">
          <span className="wordmark">
            EXELENTIC<span> /</span> Vbank
          </span>
          <span className="masthead-title">
            {stake ? (
              <>
                <b>Automatisierung bei der V-Bank</b> · Statusbericht
              </>
            ) : (
              <>
                <b>Intelligent Analysis Dashboard</b> · UiPath Orchestrator
              </>
            )}
          </span>
        </div>
        <div className="masthead-right">
          <span className={`live-dot${live ? '' : ' paused'}`} />
          <span>
            {stake
              ? `${live ? 'Live' : 'Pausiert'}${
                  lastUpdated
                    ? ` · Stand ${new Date(lastUpdated).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
                    : ''
                }`
              : `${live ? 'Live' : 'Paused'}${
                  lastUpdated
                    ? ` · updated ${new Date(lastUpdated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                    : ''
                }`}
          </span>
          {stake ? (
            <button className="theme-toggle" onClick={onPresent}>
              Präsentation
            </button>
          ) : null}
          <button
            className="theme-toggle"
            onClick={() => onSwitchView(stake ? 'technical' : 'stakeholder')}
          >
            {stake ? 'Technische Ansicht →' : '← Stakeholder-Ansicht'}
          </button>
          <button className="theme-toggle" onClick={toggle}>
            {stake ? (mode === 'light' ? 'Dunkel' : 'Hell') : mode === 'light' ? 'Dark' : 'Light'}
          </button>
        </div>
      </header>
      {stake ? null : (
        <nav className="nav">
          {PAGES.map((p) => (
            <button key={p.key} className={page === p.key ? 'active' : undefined} onClick={() => onNavigate(p.key)}>
              {p.label}
            </button>
          ))}
        </nav>
      )}
    </>
  )
}
