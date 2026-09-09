import { useThemeMode } from '@vbank/ui'

export function Header({
  lastUpdated,
  live,
  onPresent,
}: {
  lastUpdated: number | null
  live: boolean
  onPresent: () => void
}) {
  const { mode, toggle } = useThemeMode()

  return (
    <header className="masthead">
      <div className="masthead-left">
        <span className="wordmark">
          EXELENTIC<span> /</span> Vbank
        </span>
        <span className="masthead-title">
          <b>Automatisierung bei der V-Bank</b> · Statusbericht
        </span>
      </div>
      <div className="masthead-right">
        <span className={`live-dot${live ? '' : ' paused'}`} />
        <span>
          {live ? 'Live' : 'Pausiert'}
          {lastUpdated
            ? ` · Stand ${new Date(lastUpdated).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
            : ''}
        </span>
        <button className="theme-toggle present-btn" onClick={onPresent}>
          Präsentation
        </button>
        <button className="theme-toggle" onClick={toggle}>
          {mode === 'light' ? 'Dunkel' : 'Hell'}
        </button>
      </div>
    </header>
  )
}
