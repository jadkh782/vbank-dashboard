import type { ReactNode } from 'react'
import { LoginPage } from './LoginPage'
import { signOut, useRole, useSession } from './useSession'

const ALLOWED = new Set(['viewer', 'reviewer', 'admin'])

/** Login wall: a session AND a profile with a reading role are required. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSession()
  const role = useRole(session?.user.id)

  if (loading || (session && role.isLoading)) {
    return (
      <div className="state-block" style={{ paddingTop: 120 }}>
        <b>Anmeldung wird geprüft…</b>
      </div>
    )
  }
  if (!session) return <LoginPage />
  if (role.error) {
    return (
      <div className="state-block" style={{ paddingTop: 120 }}>
        <b>Zugriff konnte nicht geprüft werden.</b>
        {role.error.message}
        <button className="theme-toggle" onClick={() => void signOut()}>
          Abmelden
        </button>
      </div>
    )
  }
  if (!role.data || !ALLOWED.has(role.data)) {
    return (
      <div className="state-block" style={{ paddingTop: 120 }}>
        <b>Kein Zugriff für dieses Konto.</b>
        Bitte wenden Sie sich an Exelentic, damit Ihr Konto freigeschaltet wird.
        <button className="theme-toggle" onClick={() => void signOut()}>
          Abmelden
        </button>
      </div>
    )
  }
  return <>{children}</>
}
