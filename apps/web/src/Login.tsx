import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'

export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const { accessToken } = await api<{ accessToken: string }>('/auth/login', { body: { username: username.trim(), password } })
      const user = await api<Session['user']>('/auth/me', { token: accessToken })
      if (!['admision', 'enfermeria'].includes(user.rol)) {
        setError('Esta área requiere una cuenta de admisión o enfermería.')
        return
      }
      setPassword('')
      onLogin({ token: accessToken, user })
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 401
        ? 'Usuario o contraseña incorrectos, o cuenta inactiva.'
        : 'No se pudo iniciar sesión. Comprueba la conexión e inténtalo nuevamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-layout">
      <section className="login-intro">
        <p className="eyebrow">Atención que empieza con orden</p>
        <h1>Una agenda clara.<br />Una mejor atención.</h1>
        <p>El espacio del personal para coordinar citas y preparar la atención de nuestros pacientes.</p>
        <div className="intro-note"><span aria-hidden="true">+</span><div><strong>Clínica San Rafael</strong><p>Cuidamos cada paso de la atención.</p></div></div>
      </section>
      <section className="card login-card" aria-labelledby="login-title">
        <p className="eyebrow">Acceso del personal</p>
        <h2 id="login-title">Bienvenido de nuevo</h2>
        <p>Ingresa con tu cuenta de admisión o enfermería.</p>
        <form onSubmit={submit} aria-busy={busy}>
          <label htmlFor="username">Usuario</label>
          <input id="username" autoComplete="username" required maxLength={50} value={username} onChange={e => setUsername(e.target.value)} disabled={busy} />
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" autoComplete="current-password" required maxLength={72} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
          {error && <p className="notice error" role="alert">{error}</p>}
          <button className="primary" disabled={busy || !username.trim() || !password}>{busy ? 'Ingresando…' : 'Iniciar sesión'}</button>
        </form>
        <p className="muted small">Si necesitas una cuenta, contacta al responsable del sistema.</p>
      </section>
    </div>
  )
}
