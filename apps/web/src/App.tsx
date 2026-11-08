import { useCallback, useState } from 'react'
import { Agenda } from './Agenda'
import { Login } from './Login'
import type { Session } from './api'
import './App.css'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [booking, setBooking] = useState(false)
  const [expired, setExpired] = useState(false)
  const onExpired = useCallback(() => { setSession(null); setBooking(false); setExpired(true) }, [])
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Clínica San Rafael, inicio">
          <span className="brand-mark" aria-hidden="true">+</span>
          <span>San Rafael<small>Sistema de gestión clínica</small></span>
        </a>
        <div className="session-actions">
          <span className="badge">Admisión</span>
          {session && <button className="secondary" disabled={booking} onClick={() => { setSession(null); setExpired(false) }}>Cerrar sesión</button>}
        </div>
      </header>
      <main>
        {!session ? <>{expired && <p role="alert" className="notice error">Tu sesión venció o perdió acceso. Inicia sesión nuevamente.</p>}<Login onLogin={value => { setExpired(false); setSession(value) }} /></> : <Agenda session={session} onExpired={onExpired} onBookingChange={setBooking} />}
      </main>
      <footer>SIGES SR · Clínica San Rafael<span>Uso exclusivo del personal autorizado</span></footer>
    </div>
  )
}

export default App
