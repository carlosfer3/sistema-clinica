import { PatientLogin } from './PatientLogin'
import { Cashier } from './Cashier'
import { PatientPortal } from './PatientPortal'
import { Medical } from './Medical'
import { Nursing } from './Nursing'
import { DailyAppointments } from './DailyAppointments'
import { useCallback, useEffect, useState } from 'react'
import { Agenda } from './Agenda'
import { Login } from './Login'
import type { Session } from './api'
import { api } from './api'
import './App.css'

function App() {
  const patientAccess = /^\/pacientes(?:\/login)?\/?$/.test(window.location.pathname)
  const [view, setView] = useState<'booking' | 'daily'>('booking')
  const [session, updateSession] = useState<Session | null>(null)
  const [storedToken] = useState(() => {
    if (patientAccess) return null
    try { return sessionStorage.getItem('siges.staff.token') } catch { return null }
  })
  const [restoring, setRestoring] = useState(Boolean(storedToken))
  const setSession = useCallback((value: Session | null) => {
    updateSession(value)
    try {
      if (value && value.user.rol !== 'paciente') sessionStorage.setItem('siges.staff.token', value.token)
      else sessionStorage.removeItem('siges.staff.token')
    } catch { /* The session can still work in memory when storage is unavailable. */ }
  }, [])
  useEffect(() => {
    if (patientAccess) return
    const controller = new AbortController()
    const token = storedToken
    if (!token) return
    api<Session['user']>('/auth/me', { token, signal: controller.signal })
      .then(user => {
        if (controller.signal.aborted) return
        if (['admision', 'enfermeria', 'medico', 'cajero'].includes(user.rol)) setSession({ token, user })
        else setSession(null)
      })
      .catch(() => { if (!controller.signal.aborted) setSession(null) })
      .finally(() => { if (!controller.signal.aborted) setRestoring(false) })
    return () => controller.abort()
  }, [patientAccess, setSession, storedToken])
  const [booking, setBooking] = useState(false)
  const [expired, setExpired] = useState(false)
  const onExpired = useCallback(() => { setSession(null); setBooking(false); setExpired(true) }, [setSession])
  useEffect(() => { document.title = patientAccess ? 'Acceso Pacientes | Clínica San Rafael S.A.C.' : 'Personal | Clínica San Rafael' }, [patientAccess])
  if (restoring) return <main><p role="status">Restaurando sesión…</p></main>
  if (!session && patientAccess) return <PatientLogin expired={expired} onLogin={value => { setExpired(false); setSession(value) }} />
  if (session?.user.rol === 'paciente') return <PatientPortal session={session} onExpired={onExpired} onLogout={() => { setSession(null); setExpired(false) }} />
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Clínica San Rafael, inicio">
          <img className="brand-logo" src="/clinic-logo.png" alt="Clínica San Rafael S.A.C." width="64" height="58" />
          <span>San Rafael<small>Sistema de gestión clínica</small></span>
        </a>
        <div className="session-actions">
          <span className="badge">{session ? session.user.rol === 'cajero' ? 'Caja' : session.user.rol === 'medico' ? 'Médico' : session.user.rol === 'enfermeria' ? 'Enfermería' : 'Admisión' : 'Personal'}</span>
          {session && <button className="secondary" disabled={booking} onClick={() => { setSession(null); setExpired(false) }}>Cerrar sesión</button>}
        </div>
      </header>
      <main>
        {!session ? <>{expired && <p role="alert" className="notice error">Tu sesión venció o perdió acceso. Inicia sesión nuevamente.</p>}<Login onLogin={value => { setExpired(false); setView('booking'); setSession(value) }} /></> : session.user.rol === 'cajero' ? <Cashier session={session} onExpired={onExpired} onBusyChange={setBooking} /> : session.user.rol === 'medico' ? <Medical session={session} onExpired={onExpired} onBusyChange={setBooking} /> : session.user.rol === 'enfermeria' ? <Nursing session={session} onExpired={onExpired} onBusyChange={setBooking} /> : <><nav className="admission-navigation" aria-label="Opciones de admisión"><button className="secondary" aria-pressed={view === 'booking'} disabled={booking} onClick={() => setView('booking')}>Reservar cita</button><button className="secondary" aria-pressed={view === 'daily'} disabled={booking} onClick={() => setView('daily')}>Citas del día</button></nav>{view === 'booking' ? <Agenda session={session} onExpired={onExpired} onBookingChange={setBooking} /> : <DailyAppointments session={session} onExpired={onExpired} onBusyChange={setBooking} />}</>}
      </main>
      <footer>SIGES SR · Clínica San Rafael<span>Uso exclusivo del personal autorizado</span></footer>
    </div>
  )
}

export default App
