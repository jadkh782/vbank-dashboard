import { deDate } from '@vbank/shared'
import { useThemeMode } from '@vbank/ui'

export function Header({
  datenstand,
  onPresent,
  onSignOut,
}: {
  datenstand: string
  onPresent: () => void
  onSignOut?: () => void
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
        <span className="datenstand">Datenstand: {deDate(datenstand)}</span>
        <button className="theme-toggle present-btn" onClick={onPresent}>
          Präsentation
        </button>
        <button className="theme-toggle" onClick={toggle}>
          {mode === 'light' ? 'Dunkel' : 'Hell'}
        </button>
        {onSignOut ? (
          <button className="theme-toggle" onClick={onSignOut}>
            Abmelden
          </button>
        ) : null}
      </div>
    </header>
  )
}
