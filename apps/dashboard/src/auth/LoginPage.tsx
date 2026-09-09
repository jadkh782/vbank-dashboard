import { useState, type FormEvent } from 'react'
import { supabase } from './supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError('Anmeldung fehlgeschlagen. Bitte E-Mail-Adresse und Passwort prüfen.')
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <span className="wordmark">
          EXELENTIC<span> /</span> Vbank
        </span>
        <h1 className="login-title">Automatisierung bei der V-Bank</h1>
        <p className="login-sub">Statusbericht · Anmeldung</p>
        <label className="form-field">
          <span>E-Mail-Adresse</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="form-field">
          <span>Passwort</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error ? <div className="error-banner">{error}</div> : null}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Anmeldung…' : 'Anmelden'}
        </button>
      </form>
    </div>
  )
}
