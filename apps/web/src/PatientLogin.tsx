import { useRef, useState } from 'react'
import type { ReactNode, SubmitEvent } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'
import './PatientLogin.css'

function Symbol({
  kind,
}: {
  kind:
    | 'heart'
    | 'document'
    | 'lock'
    | 'eye'
    | 'arrow'
    | 'calendar'
    | 'file'
    | 'help'
    | 'shield'
}) {
  const paths: Record<typeof kind, ReactNode> = {
    heart: (
      <>
        <path d="M12 4v16M4 12h16" />
        <path
          d="M21 8c0-5-7-6-9-1-2-5-9-4-9 1 0 7 9 12 9 12s9-5 9-12Z"
          opacity=".4"
        />
      </>
    ),
    document: (
      <>
        <rect x="2" y="5" width="20" height="15" rx="2" />
        <circle cx="8" cy="11" r="2" />
        <path d="M5 17a3 3 0 0 1 6 0m4-8h4m-4 4h4m-4 4h4" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="12" rx="2" />
        <path d="M8 10V6a4 4 0 0 1 8 0v4" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    arrow: <path d="M3 12h18m-7-7 7 7-7 7" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 2v6m10-6v6M3 11h18m-11 4h8" />
      </>
    ),
    file: (
      <>
        <path d="M6 2h8l5 5v15H6ZM14 2v6h5m-10 4h7m-7 4h7" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6ZM8 12l3 3 5-6" />
      </>
    ),
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  )
}

export function PatientLogin({
  onLogin,
  expired = false,
}: {
  onLogin: (session: Session) => void
  expired?: boolean
}) {
  const [kind, setKind] = useState<'dni' | 'email'>('dni')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [help, setHelp] = useState<'access' | 'privacy' | null>(null)
  const lock = useRef(false)
  const helpRef = useRef<HTMLDialogElement>(null)
  function changeKind(next: 'dni' | 'email') {
    if (kind === next || busy) return
    setKind(next)
    setIdentifier('')
    setPassword('')
    setVisible(false)
    setError('')
  }
  function openHelp(next: 'access' | 'privacy') {
    setHelp(next)
    helpRef.current?.showModal()
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current) return
    const value = identifier.trim()
    if (kind === 'dni' && !/^\d{8}$/.test(value)) {
      setError('Ingresa un DNI de 8 dígitos.')
      return
    }
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const result = await api<{ accessToken: string }>('/auth/patient-login', {
        body: { identifier: value, password },
      })
      const user = await api<Session['user']>('/auth/me', {
        token: result.accessToken,
      })
      if (user.rol !== 'paciente') {
        setError('Este acceso es exclusivo para pacientes.')
        return
      }
      setPassword('')
      onLogin({ token: result.accessToken, user })
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? 'DNI, correo o contraseña incorrectos, o acceso no habilitado.'
          : cause instanceof ApiError && cause.status === 400
            ? 'Ingresa un DNI de 8 dígitos o un correo electrónico válido.'
            : 'No pudimos iniciar sesión. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <div className="pl-page">
      <header className="pl-header">
        <div className="pl-header-inner">
          <a
            className="pl-brand"
            href="/pacientes/login"
            aria-label="Clínica San Rafael, acceso de pacientes"
          >
            <img className="pl-brand-logo" src="/clinic-logo.png" alt="Clínica San Rafael S.A.C." width="64" height="58" />
            <span>
              <strong>
                CLÍNICA SAN RAFAEL <small>S.A.C.</small>
              </strong>
              <span>Portal Oficial del Paciente</span>
            </span>
          </a>
          <div className="pl-header-actions">
            <span className="pl-service-pill">
              <i />
              Tu salud, siempre contigo
            </span>
            <button className="pl-help-link" onClick={() => openHelp('access')}>
              <Symbol kind="help" />
              <span>Centro de Ayuda</span>
            </button>
          </div>
        </div>
      </header>
      <main className="pl-main">
        <div className="pl-login-card">
          <section className="pl-form-panel" aria-labelledby="pl-title">
            <div>
              <div className="pl-audience">
                <i />
                Acceso exclusivo para pacientes
              </div>
              <h1 id="pl-title">
                Bienvenido a tu
                <br className="pl-desktop-break" /> salud digital
              </h1>
              <p className="pl-intro">
                Gestiona tus citas médicas, consulta tus recetas e historial y
                revisa tus pagos en un solo lugar.
              </p>
              <p className="pl-field-caption" id="pl-access-method">
                Ingresa con
              </p>
              <div
                className="pl-access-tabs"
                role="tablist"
                aria-labelledby="pl-access-method"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={kind === 'dni'}
                  disabled={busy}
                  onClick={() => changeKind('dni')}
                >
                  DNI
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={kind === 'email'}
                  disabled={busy}
                  onClick={() => changeKind('email')}
                >
                  Correo electrónico
                </button>
              </div>
              <form onSubmit={submit} aria-busy={busy}>
                <label htmlFor="patient-identifier">
                  {kind === 'dni' ? 'Número de DNI' : 'Correo electrónico'}
                </label>
                <div className="pl-input-wrap">
                  <Symbol kind="document" />
                  <input
                    id="patient-identifier"
                    name="identifier"
                    type={kind === 'email' ? 'email' : 'text'}
                    inputMode={kind === 'dni' ? 'numeric' : 'email'}
                    autoComplete="username"
                    maxLength={kind === 'dni' ? 8 : 120}
                    pattern={kind === 'dni' ? '[0-9]{8}' : undefined}
                    placeholder={
                      kind === 'dni'
                        ? 'Ingresa tus 8 dígitos de DNI'
                        : 'Ingresa tu correo electrónico'
                    }
                    required
                    disabled={busy}
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                  />
                </div>
                <label htmlFor="patient-password">Contraseña</label>
                <div className="pl-input-wrap">
                  <Symbol kind="lock" />
                  <input
                    id="patient-password"
                    name="password"
                    type={visible ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Tu contraseña personal"
                    required
                    maxLength={72}
                    value={password}
                    disabled={busy}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    className="pl-eye"
                    type="button"
                    aria-label={
                      visible ? 'Ocultar contraseña' : 'Mostrar contraseña'
                    }
                    aria-pressed={visible}
                    disabled={busy}
                    onClick={() => setVisible((value) => !value)}
                  >
                    <Symbol kind="eye" />
                  </button>
                </div>
                <div className="pl-recovery">
                  <button
                    type="button"
                    className="pl-inline-link"
                    disabled={busy}
                    onClick={() => openHelp('access')}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                {(error || expired) && (
                  <p className="pl-error" role="alert">
                    {error ||
                      'Tu sesión venció o perdió acceso. Inicia sesión nuevamente.'}
                  </p>
                )}
                <button
                  className="pl-submit"
                  disabled={busy || !identifier.trim() || !password}
                >
                  <span>
                    {busy ? 'Ingresando…' : 'Ingresar al Portal del Paciente'}
                  </span>
                  <Symbol kind="arrow" />
                </button>
              </form>
              <div className="pl-activation">
                <p>¿Es tu primera vez en la clínica?</p>
                <button
                  className="pl-inline-link"
                  disabled={busy}
                  onClick={() => openHelp('access')}
                >
                  ¿Cómo activar mi acceso?
                </button>
              </div>
            </div>
            <div className="pl-staff-link">
              <span>¿Trabajas en la clínica?</span>
              <a href="/">
                Portal para Médicos y Colaboradores{' '}
                <span aria-hidden="true">›</span>
              </a>
            </div>
          </section>
          <section
            className="pl-visual-panel"
            aria-label="Tu atención, más cerca"
          >
            <img
              className="pl-care-image"
              src="/patient-login-care.jpg"
              alt="Atención médica cercana y personalizada"
            />
            <div className="pl-photo-overlay" />
            <div className="pl-trust-badges">
              <span>
                <Symbol kind="shield" />
                Clínica San Rafael S.A.C.
              </span>
              <span>Tu portal personal de salud</span>
            </div>
            <div className="pl-visual-content">
              <div className="pl-visual-heading">
                <span>CUIDAMOS CADA PASO</span>
                <h2>
                  Más cerca de ti.
                  <br />
                  Más fácil para ti.
                </h2>
                <p>Tu atención empieza antes de llegar a la clínica.</p>
              </div>
              <div className="pl-benefits">
                <article>
                  <div className="pl-benefit-title">
                    <span>
                      <Symbol kind="calendar" />
                    </span>
                    <div>
                      <h3>Tus citas médicas</h3>
                      <small>Organiza tu próxima atención</small>
                    </div>
                  </div>
                  <p>
                    Solicita, reprograma o consulta tus citas. Admisión confirma
                    cada solicitud del portal.
                  </p>
                </article>
                <article>
                  <div className="pl-benefit-title">
                    <span className="pl-green-icon">
                      <Symbol kind="file" />
                    </span>
                    <div>
                      <h3>Recetas e historial</h3>
                      <small>Tu información a tu alcance</small>
                    </div>
                  </div>
                  <p>
                    Revisa las indicaciones de tus consultas y mantén a mano tus
                    recetas y pagos.
                  </p>
                </article>
              </div>
              <div className="pl-reception">
                <img
                  src="/patient-login-reception.jpg"
                  alt="Espacio de recepción y atención"
                />
                <div>
                  <strong>Clínica San Rafael</strong>
                  <p>Cuidamos cada paso de tu atención.</p>
                </div>
                <span className="pl-personal-access">
                  <Symbol kind="shield" />
                  Acceso personal
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>
      <footer className="pl-footer">
        <div>
          <span>
            © {new Date().getFullYear()} Clínica San Rafael S.A.C. Todos los
            derechos reservados.
          </span>
          <nav aria-label="Ayuda de acceso">
            <button onClick={() => openHelp('privacy')}>
              Privacidad y datos personales
            </button>
            <span aria-hidden="true">•</span>
            <button onClick={() => openHelp('access')}>
              Ayuda para ingresar
            </button>
          </nav>
        </div>
      </footer>
      <dialog
        ref={helpRef}
        className="pl-help-dialog"
        aria-labelledby="pl-help-title"
      >
        <h2 id="pl-help-title">
          {help === 'privacy'
            ? 'Tu información personal'
            : 'Ayuda para acceder'}
        </h2>
        <p>
          {help === 'privacy'
            ? 'Este portal permite consultar la información de la ficha vinculada a tu cuenta. No compartas tu contraseña y cierra tu sesión al terminar si utilizas un equipo compartido.'
            : 'Ingresa con el DNI o correo registrado en tu ficha y la contraseña asignada a tu cuenta de paciente. Si necesitas habilitar tu acceso o restablecer tu contraseña, comunícate con admisión de Clínica San Rafael.'}
        </p>
        <button onClick={() => helpRef.current?.close()}>Entendido</button>
      </dialog>
    </div>
  )
}
