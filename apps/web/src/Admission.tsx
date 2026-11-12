import { useEffect, useState } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'
import { Agenda } from './Agenda'
import { DailyAppointments } from './DailyAppointments'
import './Admission.css'

type View = 'home' | 'daily' | 'portal' | 'booking' | 'directory'
type Summary = {
  fecha: string
  citasHoy: number
  llegadasRegistradas: number
  pendientesLlegada: number
  solicitudesPendientes: number
}
type Appointment = {
  id: number
  inicio: string
  estado: string
  llegadaEn: string | null
  paciente: {
    nombres: string
    apellidos: string
    tipoDocumento: string
    numeroDocumento: string
  }
  medico: { nombres: string; apellidos: string }
  especialidad: { nombre: string }
}
type DirectoryResult = {
  especialidades: { id: number; nombre: string }[]
  medicos: {
    id: number
    nombres: string
    apellidos: string
    especialidad: { id: number; nombre: string }
  }[]
  hayMas: boolean
}
type Slot = {
  inicio: string
  fin: string
  consultorio: string
  medicoId: number
}
const today = () =>
  new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)
const clock = (value: string) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value))
const navigation: { id: View; label: string; icon: string }[] = [
  { id: 'home', label: 'Inicio', icon: 'home' },
  { id: 'daily', label: 'Citas del día', icon: 'arrival' },
  { id: 'portal', label: 'Solicitudes del portal', icon: 'inbox' },
  { id: 'booking', label: 'Reservar cita', icon: 'calendar' },
  { id: 'directory', label: 'Directorio médico', icon: 'doctor' },
]
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: 'M3 10l9-7 9 7v10H3z M9 20v-7h6v7',
    arrival:
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M16 9l2 2 4-4',
    inbox: 'M4 4h16l2 12v4H2v-4z M2 15h6l2 3h4l2-3h6',
    calendar: 'M4 5h16v16H4z M8 2v6 M16 2v6 M4 11h16 M9 16h6 M12 13v6',
    doctor: 'M6 3v5a6 6 0 0 0 12 0V3 M4 3h4 M16 3h4 M12 14v3a4 4 0 0 0 8 0v-3',
    check: 'M4 12l5 5L20 6',
    waiting: 'M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  }
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] || paths.calendar} />
    </svg>
  )
}

export function Admission({
  session,
  onExpired,
  onLogout,
}: {
  session: Session
  onExpired: () => void
  onLogout: () => void
}) {
  const [view, setView] = useState<View>('home')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [summaryError, setSummaryError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    api<Summary>('/agenda/admission-summary', {
      token: session.token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setSummary(data)
          setSummaryError('')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setSummary(null)
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else setSummaryError('No se pudo cargar el resumen de admisión.')
        }
      })
    return () => controller.abort()
  }, [session.token, onExpired, revision, view, busy])
  return (
    <div className="admission-app">
      <aside className="admission-sidebar">
        <a
          className="admission-brand"
          href="/"
          onClick={(event) => {
            event.preventDefault()
            if (!busy) setView('home')
          }}
        >
          <img src="/clinic-logo.png" alt="" />
          <span>
            Clínica San Rafael<small>ADMISIÓN Y RECEPCIÓN</small>
          </span>
        </a>
        <nav aria-label="Opciones de admisión">
          {navigation.map((item) => (
            <button
              key={item.id}
              aria-label={item.label}
              disabled={busy}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => setView(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === 'portal' && summary && (
                <span className="admission-nav-count">
                  {summary.solicitudesPendientes}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="admission-sidebar-note">
          <Icon name="doctor" />
          <strong>Gestión de pacientes</strong>
          <p>Recepción, solicitudes y reservas en un solo lugar.</p>
          <small>SIGES SR · Personal autorizado</small>
        </div>
      </aside>
      <div className="admission-workspace">
        <header className="admission-topbar">
          <div>
            <strong>Admisión y recepción</strong>
            <span>Clínica San Rafael · Horario de Lima</span>
          </div>
          <div className="admission-account">
            <span className="badge">Admisión</span>
            <button className="secondary" disabled={busy} onClick={onLogout}>
              Cerrar sesión
            </button>
          </div>
        </header>
        <main className="admission-main">
          {view === 'home' ? (
            <>
              <div className="admission-heading">
                <div>
                  <p className="eyebrow">Flujo de pacientes · Admisión</p>
                  <h1>Todo listo para recibir a tus pacientes</h1>
                  <p>
                    Gestiona las llegadas de hoy, revisa las solicitudes del
                    portal y agenda nuevas citas.
                  </p>
                </div>
                <button className="primary" onClick={() => setView('booking')}>
                  <Icon name="calendar" />
                  Agendar nueva cita
                </button>
              </div>
              {summaryError && (
                <p className="notice error" role="alert">
                  {summaryError}{' '}
                  <button
                    className="secondary"
                    onClick={() => setRevision((v) => v + 1)}
                  >
                    Reintentar
                  </button>
                </p>
              )}
              <div className="admission-kpis">
                {[
                  {
                    label: 'Citas de hoy',
                    value: summary?.citasHoy,
                    note: 'Todas las citas de la fecha',
                    icon: 'calendar',
                    target: 'daily',
                  },
                  {
                    label: 'Llegadas registradas',
                    value: summary?.llegadasRegistradas,
                    note: 'Pacientes con llegada registrada',
                    icon: 'check',
                    target: 'daily',
                  },
                  {
                    label: 'Pendientes de llegada',
                    value: summary?.pendientesLlegada,
                    note: 'Citas habilitadas para recepción',
                    icon: 'waiting',
                    target: 'daily',
                  },
                  {
                    label: 'Solicitudes del portal',
                    value: summary?.solicitudesPendientes,
                    note: 'Solicitudes futuras por revisar',
                    icon: 'inbox',
                    target: 'portal',
                  },
                ].map((item) => (
                  <button
                    className="admission-kpi"
                    key={item.label}
                    onClick={() => setView(item.target as View)}
                  >
                    <span>
                      <small>{item.label}</small>
                      <strong>{item.value ?? '—'}</strong>
                      <span>{item.note}</span>
                    </span>
                    <i>
                      <Icon name={item.icon} />
                    </i>
                  </button>
                ))}
              </div>
              <div className="admission-home-grid">
                <Preview
                  session={session}
                  onExpired={onExpired}
                  portal={false}
                  revision={revision}
                  onOpen={() => setView('daily')}
                />
                <Preview
                  session={session}
                  onExpired={onExpired}
                  portal
                  revision={revision}
                  onOpen={() => setView('portal')}
                />
              </div>
              <section className="admission-booking-banner">
                <span className="admission-banner-icon">
                  <Icon name="calendar" />
                </span>
                <div>
                  <h2>Una nueva cita, en pocos pasos</h2>
                  <p>
                    Busca al paciente o registra su ficha, elige un médico y
                    consulta los turnos disponibles.
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => setView('booking')}
                >
                  Reservar cita
                </button>
              </section>
              <button
                className="admission-refresh secondary"
                onClick={() => setRevision((v) => v + 1)}
              >
                Actualizar resumen
              </button>
            </>
          ) : view === 'booking' ? (
            <Agenda
              session={session}
              onExpired={onExpired}
              onBookingChange={setBusy}
            />
          ) : view === 'directory' ? (
            <Directory session={session} onExpired={onExpired} />
          ) : (
            <DailyAppointments
              key={view}
              session={session}
              onExpired={onExpired}
              onBusyChange={setBusy}
              portalOnly={view === 'portal'}
              hidePortalToggle
            />
          )}
        </main>
        <footer>
          SIGES SR · Clínica San Rafael
          <span>Uso exclusivo del personal autorizado</span>
        </footer>
      </div>
    </div>
  )
}

function Preview({
  session,
  onExpired,
  portal,
  revision,
  onOpen,
}: {
  session: Session
  onExpired: () => void
  portal: boolean
  revision: number
  onOpen: () => void
}) {
  const [items, setItems] = useState<Appointment[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const query = portal ? 'pendientesPortal=true' : `fecha=${today()}`
    api<{ citas: Appointment[] }>(
      `/agenda/appointments?${query}&pagina=1&limite=4`,
      { token: session.token, signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setItems(data.citas)
          setError('')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else
            setError(
              'No se pudo cargar la lista. Usa el acceso para volver a consultar.',
            )
        }
      })
    return () => controller.abort()
  }, [session.token, onExpired, portal, revision])
  const states: Record<string, string> = {
    programada: 'Programada',
    confirmada: 'Confirmada',
    pendiente_confirmacion: 'Por confirmar',
    reprogramada: 'Reprogramada',
    cancelada: 'Cancelada',
    atendida: 'Atendida',
    no_asistio: 'No asistió',
  }
  return (
    <section className="admission-panel">
      <div className="admission-panel-heading">
        <h2>
          <Icon name={portal ? 'inbox' : 'arrival'} />
          {portal ? 'Solicitudes del portal' : 'Recepción y llegadas'}
        </h2>
        <span className="admission-panel-tag">
          {portal ? 'Por revisar' : 'Hoy'}
        </span>
      </div>
      <p className="admission-panel-help">
        {portal
          ? 'Revisa cada solicitud para confirmar o rechazar su atención.'
          : 'Consulta las primeras citas del día y registra la llegada del paciente.'}
      </p>
      {error ? (
        <p role="alert" className="notice error">
          {error}
        </p>
      ) : items === null ? (
        <p role="status">Cargando citas…</p>
      ) : items.length === 0 ? (
        <div className="admission-empty">
          <Icon name="check" />
          <strong>
            {portal ? 'Sin solicitudes pendientes' : 'Sin citas para hoy'}
          </strong>
          <p>
            {portal
              ? 'Las nuevas solicitudes aparecerán aquí.'
              : 'Las citas de hoy aparecerán en este panel.'}
          </p>
        </div>
      ) : (
        <div className="admission-preview-list">
          {items.map((item) => (
            <article className="admission-patient-card" key={item.id}>
              <div className="admission-patient-top">
                <span className="admission-initials">
                  {item.paciente.nombres.charAt(0)}
                  {item.paciente.apellidos.charAt(0)}
                </span>
                <div>
                  <h3>
                    {item.paciente.nombres} {item.paciente.apellidos}
                  </h3>
                  <small>
                    {item.paciente.tipoDocumento}:{' '}
                    {item.paciente.numeroDocumento} · Cita #{item.id}
                  </small>
                </div>
                <time dateTime={item.inicio}>
                  {portal && <small>{dateLabel(item.inicio)}</small>}
                  {clock(item.inicio)}
                </time>
              </div>
              <div className="admission-patient-detail">
                <strong>{item.especialidad.nombre}</strong>
                <span>
                  {item.medico.nombres} {item.medico.apellidos}
                </span>
              </div>
              <div className="admission-patient-bottom">
                <span
                  className={`admission-status${item.llegadaEn ? ' arrived' : ''}`}
                >
                  {item.llegadaEn
                    ? `Llegada: ${clock(item.llegadaEn)}`
                    : states[item.estado] || item.estado}
                </span>
                <button className="text-button" onClick={onOpen}>
                  {portal ? 'Revisar solicitud' : 'Gestionar cita'} →
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <button className="secondary admission-panel-open" onClick={onOpen}>
        {portal ? 'Ver todas las solicitudes' : 'Ver todas las citas'}
      </button>
    </section>
  )
}

function Directory({
  session,
  onExpired,
}: {
  session: Session
  onExpired: () => void
}) {
  const [catalog, setCatalog] = useState<DirectoryResult | null>(null)
  const [specialty, setSpecialty] = useState('')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ specialty: '', search: '' })
  const [page, setPage] = useState(1)
  const [directoryLoading, setDirectoryLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [doctor, setDoctor] = useState('')
  const [date, setDate] = useState(today)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ pagina: String(page), limite: '6' })
    if (filters.specialty) params.set('especialidadId', filters.specialty)
    if (filters.search) params.set('buscar', filters.search)
    api<DirectoryResult>(`/agenda/directory?${params}`, {
      token: session.token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setCatalog(data)
          setError('')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else {
            setCatalog((previous) =>
              previous ? { ...previous, medicos: [], hayMas: false } : null,
            )
            setError('No se pudo cargar el directorio.')
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDirectoryLoading(false)
      })
    return () => controller.abort()
  }, [session.token, onExpired, revision, page, filters])
  useEffect(() => {
    if (!doctor || !date) return
    const controller = new AbortController()
    const [especialidadId, medicoId] = doctor.split(':')
    api<{ turnos: Slot[] }>(
      `/agenda/availability?${new URLSearchParams({ fecha: date, especialidadId, medicoId })}`,
      { token: session.token, signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setSlots(data.turnos)
          setError('')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else setError('No se pudo consultar la disponibilidad.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [session.token, onExpired, doctor, date, revision])
  return (
    <section>
      <div className="page-heading">
        <p className="eyebrow">Equipo médico</p>
        <h1>Directorio médico</h1>
        <p>
          Profesionales con horarios habilitados. Consulta sus turnos
          disponibles por fecha.
        </p>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}{' '}
          <button
            className="secondary"
            onClick={() => {
              setLoading(Boolean(doctor && date))
              setRevision((v) => v + 1)
            }}
          >
            Reintentar
          </button>
        </p>
      )}
      <form
        className="admission-directory-filters"
        onSubmit={(event) => {
          event.preventDefault()
          setFilters({ specialty, search: search.trim() })
          setPage(1)
          setDoctor('')
          setSlots(null)
          setError('')
          setDirectoryLoading(true)
        }}
      >
        <div>
          <label htmlFor="directory-specialty">Especialidad</label>
          <select
            id="directory-specialty"
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value)}
          >
            <option value="">Todas las especialidades</option>
            {catalog?.especialidades.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="directory-search">Nombre o apellido del médico</label>
          <input
            id="directory-search"
            type="search"
            value={search}
            minLength={2}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Escribe al menos 2 caracteres"
          />
        </div>
        <button
          className="primary"
          disabled={!specialty && search.trim().length < 2}
        >
          Buscar médicos
        </button>
      </form>
      {directoryLoading && <p role="status">Cargando directorio…</p>}
      {!filters.specialty && !filters.search && !directoryLoading && (
        <p className="empty">
          Selecciona una especialidad o busca por nombre para consultar médicos.
          Mostramos hasta 6 resultados por página.
        </p>
      )}
      {(filters.specialty || filters.search) &&
        !directoryLoading &&
        catalog?.medicos.length === 0 && (
          <p className="empty">No se encontraron médicos con estos filtros.</p>
        )}
      <div className="admission-directory-grid">
        <div>
          {!directoryLoading &&
            catalog?.medicos.map((item) => (
              <section className="admission-panel" key={item.id}>
                <h2>{item.especialidad.nombre}</h2>
                <button
                  className="admission-doctor"
                  aria-pressed={doctor === `${item.especialidad.id}:${item.id}`}
                  key={item.id}
                  onClick={() => {
                    if (doctor === `${item.especialidad.id}:${item.id}`) return
                    setDoctor(`${item.especialidad.id}:${item.id}`)
                    setSlots(null)
                    setLoading(Boolean(date))
                    setError('')
                  }}
                >
                  <span className="admission-initials">
                    {item.nombres.charAt(0)}
                    {item.apellidos.charAt(0)}
                  </span>
                  <span>
                    <strong>
                      {item.nombres} {item.apellidos}
                    </strong>
                    <small>Consultar disponibilidad →</small>
                  </span>
                </button>
              </section>
            ))}
          {(filters.specialty || filters.search) && (
            <nav
              className="daily-pagination"
              aria-label="Páginas del directorio"
            >
              <button
                className="secondary"
                disabled={directoryLoading || page === 1}
                onClick={() => {
                  setPage((v) => v - 1)
                  setDirectoryLoading(true)
                  setDoctor('')
                  setSlots(null)
                }}
              >
                Anterior
              </button>
              <span>Página {page}</span>
              <button
                className="secondary"
                disabled={directoryLoading || !catalog?.hayMas}
                onClick={() => {
                  setPage((v) => v + 1)
                  setDirectoryLoading(true)
                  setDoctor('')
                  setSlots(null)
                }}
              >
                Siguiente
              </button>
            </nav>
          )}
        </div>
        <section className="admission-panel">
          <h2>Disponibilidad</h2>
          <label htmlFor="directory-date">Fecha de consulta</label>
          <input
            id="directory-date"
            type="date"
            min={today()}
            value={date}
            onChange={(event) => {
              setDate(event.target.value)
              setSlots(null)
              setLoading(Boolean(doctor && event.target.value))
              setError('')
            }}
          />
          {!doctor ? (
            <p className="admission-panel-help">
              Selecciona un profesional del directorio.
            </p>
          ) : !date ? (
            <p>Selecciona una fecha.</p>
          ) : loading ? (
            <p role="status">Consultando turnos…</p>
          ) : (
            slots && (
              <>
                <p className="admission-panel-help">
                  {slots.length} turnos disponibles · Horario de Lima
                </p>
                <div className="admission-directory-slots">
                  {slots.map((slot) => (
                    <div key={slot.inicio}>
                      <strong>
                        {clock(slot.inicio)}–{clock(slot.fin)}
                      </strong>
                      <span>{slot.consultorio}</span>
                    </div>
                  ))}
                </div>
                {slots.length === 0 && (
                  <p className="empty">
                    No hay turnos disponibles para esta fecha.
                  </p>
                )}
              </>
            )
          )}
        </section>
      </div>
    </section>
  )
}
