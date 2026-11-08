import { useState } from 'react'
import { Login } from './Login'
import type { Session } from './api'
import './App.css'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Clínica San Rafael, inicio">
          <span className="brand-mark" aria-hidden="true">+</span>
          <span>San Rafael<small>Sistema de gestión clínica</small></span>
        </a>
        <div className="session-actions">
          <span className="badge">Admisión</span>
          {session && <button className="secondary" onClick={() => setSession(null)}>Cerrar sesión</button>}
        </div>
      </header>
      <main>
        {!session ? <Login onLogin={setSession} /> : (
          <section className="card welcome">
            <p className="eyebrow">Área de admisión</p>
            <h1>Sesión iniciada</h1>
            <p>Has ingresado al sistema de la Clínica San Rafael con tu cuenta de admisión.</p>
          </section>
        )}
      </main>
      <footer>SIGES SR · Clínica San Rafael<span>Uso exclusivo del personal autorizado</span></footer>
    </div>
  )
}

export default App
