import type { ReactNode } from 'react'
import { LoginPage } from './LoginPage'
import { signOut, useRole, useSession } from './useSession'

const ALLOWED = new Set(['reviewer', 'admin'])

/** The Control Board is for reviewers and admins only. */
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
  if (role.error || !role.data || !ALLOWED.has(role.data)) {
    return (
      <div className="state-block" style={{ paddingTop: 120 }}>
        <b>Kein Zugriff für dieses Konto.</b>
        {role.error ? role.error.message : 'Das Control Board ist für Prüferinnen und Prüfer von Exelentic.'}
        <button className="theme-toggle" onClick={() => void signOut()}>
          Abmelden
        </button>
      </div>
    )
  }
  return <>{children}</>
}
