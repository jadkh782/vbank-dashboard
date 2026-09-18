import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { deInt } from '@vbank/shared'
import { useThemeMode } from '@vbank/ui'
import { signOut } from '../auth/useSession'
import { useAutomationRows, useDays, useSettingsRow } from '../data/queries'

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const ICONS: Record<string, ReactNode> = {
  days: (
    <svg viewBox="0 0 20 20" {...stroke}>
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M3 8h14M7 2.5V5M13 2.5V5M7.5 12.5l1.8 1.8 3.4-3.6" />
    </svg>
  ),
  manual: (
    <svg viewBox="0 0 20 20" {...stroke}>
      <path d="M10 3 2.8 15.5h14.4L10 3Z" />
      <path d="M10 8v3.6M10 14.2v.1" />
    </svg>
  ),
  report: (
    <svg viewBox="0 0 20 20" {...stroke}>
      <path d="M3 16.5h14M5.5 13V9M10 13V5.5M14.5 13v-3" />
    </svg>
  ),
  automations: (
    <svg viewBox="0 0 20 20" {...stroke}>
      <rect x="3" y="3" width="6" height="6" rx="1.2" />
      <rect x="11" y="3" width="6" height="6" rx="1.2" />
      <rect x="3" y="11" width="6" height="6" rx="1.2" />
      <rect x="11" y="11" width="6" height="6" rx="1.2" />
    </svg>
  ),
  catalog: (
    <svg viewBox="0 0 20 20" {...stroke}>
      <path d="M4 3.5h9.5a2 2 0 0 1 2 2v11H6a2 2 0 0 0-2 2V3.5Z" />
      <path d="M4 14.5a2 2 0 0 1 2-2h9.5M7.5 7h5" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 20 20" {...stroke}>
      <path d="M3 6h9M15 6h2M3 14h2M8 14h9" />
      <circle cx="13" cy="6" r="2" />
      <circle cx="6" cy="14" r="2" />
    </svg>
  ),
}

const NAV = [
  { to: '/', label: 'Tagesprüfung', icon: 'days', end: true },
  { to: '/manuelle-fehler', label: 'Manuelle Fehler', icon: 'manual' },
  { to: '/auswertung', label: 'Auswertung', icon: 'report' },
  { to: '/automatisierungen', label: 'Automatisierungen', icon: 'automations' },
  { to: '/fehlerkatalog', label: 'Fehlerkatalog', icon: 'catalog' },
  { to: '/einstellungen', label: 'Einstellungen', icon: 'settings' },
]

/** Live counters on the tabs: days waiting for review, automations without a description. */
function useNavBadges(): Record<string, { value: number; title: string; tone: 'warn' | 'info' } | undefined> {
  const days = useDays()
  const settings = useSettingsRow()
  const automations = useAutomationRows()
  const goLive = settings.data?.go_live_day ?? '0000-00-00'
  const openDays = (days.data ?? []).filter((d) => d.business_day >= goLive && d.state !== 'published').length
  const openItems = (days.data ?? []).filter((d) => d.business_day >= goLive).reduce((a, d) => a + d.open_count, 0)
  const withoutDesc = (automations.data ?? []).filter((a) => a.included && !a.display_description?.trim()).length
  return {
    '/': openDays > 0 ? { value: openDays, title: `${deInt(openDays)} Tage offen · ${deInt(openItems)} offene Punkte`, tone: openItems > 0 ? 'warn' : 'info' } : undefined,
    '/automatisierungen': withoutDesc > 0 ? { value: withoutDesc, title: `${deInt(withoutDesc)} Automatisierungen ohne Beschreibung`, tone: 'info' } : undefined,
  }
}

export function Shell({ email }: { email: string | undefined }) {
  const { mode, toggle } = useThemeMode()
  const badges = useNavBadges()
  const initials = (email ?? '?').slice(0, 2).toUpperCase()
  return (
    <div className="app">
      <header className="cb-top">
        <div className="cb-top-row">
          <div className="cb-brand">
            <span className="wordmark">
              EXELENTIC<span> /</span> Vbank
            </span>
            <span className="cb-title">
              <b>Control Board</b>
              <span className="cb-title-sub">V-Bank Automatisierung · intern</span>
            </span>
          </div>
          <div className="cb-user">
            {email ? (
              <span className="cb-user-chip" title={email}>
                <span className="cb-avatar" aria-hidden="true">
                  {initials}
                </span>
                <span className="cb-user-mail">{email}</span>
              </span>
            ) : null}
            <button className="theme-toggle" onClick={toggle} aria-label={mode === 'light' ? 'Dunkles Design' : 'Helles Design'}>
              {mode === 'light' ? 'Dunkel' : 'Hell'}
            </button>
            <button className="theme-toggle" onClick={() => void signOut()}>
              Abmelden
            </button>
          </div>
        </div>
        <nav className="cb-nav" aria-label="Hauptnavigation">
          {NAV.map((n) => {
            const badge = badges[n.to]
            return (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `cb-tab${isActive ? ' active' : ''}`}>
                <span className="cb-tab-icon" aria-hidden="true">
                  {ICONS[n.icon]}
                </span>
                <span className="cb-tab-label">{n.label}</span>
                {badge ? (
                  <span className={`cb-tab-badge ${badge.tone}`} title={badge.title}>
                    {deInt(badge.value)}
                  </span>
                ) : null}
              </NavLink>
            )
          })}
        </nav>
      </header>
      <Outlet />
      <footer className="footer">
        <span>Exelentic GmbH · Control Board</span>
        <span>intern — nicht für die V-Bank bestimmt</span>
      </footer>
    </div>
  )
}
