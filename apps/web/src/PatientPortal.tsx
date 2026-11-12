import { PatientAlerts } from './PatientAlerts'
import { PatientPayments } from './PatientPayments'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, SubmitEvent } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'
import './PatientPortal.css'

type View =
  'home' | 'appointments' | 'history' | 'prescriptions' | 'payments' | 'profile'
type IconName =
  | 'home'
  | 'calendar'
  | 'file'
  | 'clip'
  | 'user'
  | 'bell'
  | 'help'
  | 'logout'
  | 'arrow'
  | 'check'
  | 'pin'
  | 'plus'
  | 'card'
type Profile = {
  id: number
  nombres: string
  apellidos: string
  tipoDocumento: string
  numeroDocumento: string
  fechaNacimiento: string
  telefono: string
  correo: string
  direccion: string | null
}
type Biometrics = { registradoEn: string; presionSistolica: number; presionDiastolica: number; frecuenciaCardiaca: number; saturacionOxigeno: number; pesoKg: number | null; tallaCm: number | null; temperaturaC: number; observaciones: string | null }
type Appointment = {
  id: number
  inicio: string
  fin: string
  estado: string
  modalidad: string
  llegadaEn: string | null
  evaluacionPrevia?: Biometrics | null
  preparacionCompletadaEn?: string | null
  medico: { id: number; nombres: string; apellidos: string }
  especialidad: { id: number; nombre: string }
}
type Appointments = {
  citas: Appointment[]
  total: number
  pagina: number
  hayMas: boolean
}
type Consultation = {
  id: number
  fechaHora: string
  motivo: string
  indicaciones: string | null
  estado: string
  motivoAnulacion: string | null
  medico: {
    usuario: { nombres: string; apellidos: string }
    especialidad: { nombre: string }
  }
  diagnosticos: { codigo: string; descripcion: string }[]
  recetaItems: {
    id: number
    medicamento: string
    dosis: string
    via: string
    frecuencia: string
    duracion: string
    indicaciones: string | null
  }[]
}
type History = { consultas: Consultation[]; pagina: number; hayMas: boolean }
type Modal =
  | { kind: 'book' }
  | { kind: 'detail' | 'reschedule' | 'cancel'; appointment: Appointment }
  | { kind: 'help' | 'privacy' | 'notifications' }
const labels = {
  home: 'Inicio',
  appointments: 'Mis citas',
  history: 'Mi historial',
  prescriptions: 'Mis recetas',
  payments: 'Pagos',
  profile: 'Mi perfil',
}
const icons: Record<View, IconName> = {
  home: 'home',
  appointments: 'calendar',
  history: 'file',
  prescriptions: 'clip',
  payments: 'card',
  profile: 'user',
}
const states: Record<string, string> = {
  pendiente_confirmacion: 'Pendiente de confirmaci\u00f3n',
  programada: 'Programada',
  confirmada: 'Confirmada',
  reprogramada: 'Reprogramada',
  cancelada: 'Cancelada',
  atendida: 'Atendida',
  no_asistio: 'No asistió',
}
const date = (value: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    ...options,
  }).format(new Date(value))
const clock = (value: string) =>
  date(value, { hour: '2-digit', minute: '2-digit', hour12: false })
const today = () =>
  new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)
const changeable = (a: Appointment) =>
  !a.llegadaEn &&
  [
    'pendiente_confirmacion',
    'programada',
    'confirmada',
    'reprogramada',
  ].includes(a.estado)

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    card: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <path d="M2 10h20M6 15h3" />
      </>
    ),
    home: <path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4m10-4v4M3 11h18M7 15h3m4 0h3" />
      </>
    ),
    file: (
      <>
        <path d="M6 2h8l5 5v15H6ZM14 2v6h5M9 12h7m-7 4h7" />
      </>
    ),
    clip: (
      <path d="m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8a5 5 0 0 1 7 7l-8 8" />
    ),
    user: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M4 22v-4a8 8 0 0 1 16 0v4" />
      </>
    ),
    bell: (
      <>
        <path d="M4 17h16l-2-4V9a6 6 0 0 0-12 0v4Zm6 4h4" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10v7m0-11v1" />
      </>
    ),
    logout: <path d="M9 4H4v16h5m-1-8h13m-5-5 5 5-5 5" />,
    arrow: <path d="m9 5 7 7-7 7" />,
    check: <path d="m5 12 4 4L20 5" />,
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    plus: <path d="M12 4v16M4 12h16" />,
  }
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function Dialog({
  title,
  className = '',
  busy,
  onClose,
  children,
}: {
  title: string
  className?: string
  busy: boolean
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`pp-dialog ${className}`}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      aria-labelledby="pp-dialog-title"
    >
      <div className="pp-dialog-heading">
        <h2 id="pp-dialog-title">{title}</h2>
        <button
          className="pp-icon-button"
          aria-label="Cerrar ventana"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  )
}

function BookingForm({
  session,
  appointment,
  express = false,
  busy,
  onExpired,
  onSave,
}: {
  session: Session
  appointment?: Appointment
  express?: boolean
  busy: boolean
  onExpired: () => void
  onSave: (body: { medicoId: number; inicio: string }) => void
}) {
  const formId = useId()
  const [catalog, setCatalog] = useState<
    {
      id: number
      nombre: string
      medicos: { id: number; nombres: string; apellidos: string }[]
    }[]
  >([])
  const [specialty, setSpecialty] = useState(
    appointment ? String(appointment.especialidad.id) : '',
  )
  const [doctor, setDoctor] = useState(
    appointment ? String(appointment.medico.id) : '',
  )
  const [day, setDay] = useState(today)
  const [slots, setSlots] = useState<{ inicio: string; fin: string; medicoId: number; medico: { nombres: string; apellidos: string } }[]>([])
  const [slot, setSlot] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    api<{ especialidades: typeof catalog }>('/portal/catalog', {
      token: session.token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setCatalog(data.especialidades)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else setError('No pudimos cargar los médicos. Intenta nuevamente.')
        }
      })
    return () => controller.abort()
  }, [session.token, onExpired, retry])
  useEffect(() => {
    if (!specialty || (!express && !doctor) || !day) return
    const controller = new AbortController()
    const params = new URLSearchParams({
      especialidadId: specialty,
      fecha: day,
    })
    if (!express) params.set('medicoId', doctor)
    api<{ turnos: typeof slots }>(`/portal/availability?${params}`, {
      token: session.token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setSlots(data.turnos.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.medicoId - b.medicoId).filter((s, i, all) => !express || i === 0 || s.inicio !== all[i - 1].inicio))
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else setError('No pudimos consultar los turnos. Intenta nuevamente.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [specialty, doctor, day, session.token, onExpired, retry, express])
  function reset() {
    setSlot('')
    setSlots([])
    setError('')
    setLoading(true)
  }
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const selected = slots.find(s => s.inicio === slot)
    if (!busy && !loading && selected)
      onSave({ medicoId: selected.medicoId, inicio: selected.inicio })
  }
  return (
    <form className="pp-booking" onSubmit={submit}>
      <div className="pp-presential"><Icon name="pin" /> Consulta presencial</div>
      <p>
        {appointment
          ? 'Elige un nuevo horario con tu médico. Tu cita actual se conserva hasta confirmar el cambio.'
          : 'Encuentra tu próxima consulta en Clínica San Rafael.'}
      </p>
      {appointment ? (
        <p className="pp-form-summary">
          <strong>{appointment.especialidad.nombre}</strong>
          <br />
          {appointment.medico.nombres} {appointment.medico.apellidos}
        </p>
      ) : (
        <>
          <label htmlFor={`${formId}-specialty`}>Especialidad</label>
          <select
            id={`${formId}-specialty`}
            required
            value={specialty}
            disabled={busy}
            onChange={(event) => {
              setSpecialty(event.target.value)
              setDoctor('')
              reset()
            }}
          >
            <option value="">Selecciona una especialidad</option>
            {catalog.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
          {!express && <>
          <label htmlFor={`${formId}-doctor`}>Médico</label>
          <select
            id={`${formId}-doctor`}
            required
            value={doctor}
            disabled={busy || !specialty}
            onChange={(event) => {
              setDoctor(event.target.value)
              reset()
            }}
          >
            <option value="">Selecciona un médico</option>
            {catalog
              .find((s) => String(s.id) === specialty)
              ?.medicos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombres} {d.apellidos}
                </option>
              ))}
          </select>
          </>}
        </>
      )}
      <label htmlFor={`${formId}-day`}>Fecha de la cita</label>
      <input
        id={`${formId}-day`}
        type="date"
        min={today()}
        required
        value={day}
        disabled={busy}
        onChange={(event) => {
          setDay(event.target.value)
          reset()
        }}
      />
      <label htmlFor={`${formId}-slot`}>Horario disponible (Lima)</label>
      <select
        id={`${formId}-slot`}
        required
        value={slot}
        disabled={busy || loading || (!express && !doctor) || !specialty || !day}
        onChange={(event) => setSlot(event.target.value)}
      >
        <option value="">Selecciona un horario</option>
        {slots.map((s) => (
          <option key={s.inicio} value={s.inicio}>
            {clock(s.inicio)}–{clock(s.fin)}
          </option>
        ))}
      </select>
      {(express ? specialty : doctor) &&
        day &&
        (loading ? (
          <p role="status">Consultando disponibilidad…</p>
        ) : (
          !slots.length && <p>No hay horarios disponibles para esta fecha.</p>
        ))}
      {error && (
        <div className="pp-message" role="alert">
          {error}
          <button
            type="button"
            className="pp-text-button"
            disabled={busy}
            onClick={() => {
              reset()
              setRetry((v) => v + 1)
            }}
          >
            Reintentar
          </button>
        </div>
      )}
      {slot && (
        <div className="pp-form-summary pp-selected-slot">
          <span className="pp-summary-label">Fecha y hora</span>
          <strong>{date(slot, { dateStyle: 'full' })} · {clock(slot)} h</strong>
          {express && <>
            <span className="pp-summary-label pp-summary-doctor-label">Médico asignado</span>
            <strong>{slots.find(s => s.inicio === slot)?.medico.nombres} {slots.find(s => s.inicio === slot)?.medico.apellidos}</strong>
          </>}
          <span className="pp-summary-location">Consulta presencial · Clínica San Rafael</span>
        </div>
      )}
      <button className="pp-primary" disabled={busy || !slot || loading}>
        {busy
          ? 'Guardando…'
          : appointment
            ? 'Solicitar reprogramación'
            : 'Solicitar cita'}
      </button>
    </form>
  )
}

export function PatientPortal({
  session,
  onExpired,
  onLogout,
}: {
  session: Session
  onExpired: () => void
  onLogout: () => void
}) {
  const [portalDay, setPortalDay] = useState(today)
  useEffect(() => {
    const timer = setInterval(() => setPortalDay(today()), 60000)
    return () => clearInterval(timer)
  }, [])
  const [view, setView] = useState<View>('home')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [appointments, setAppointments] = useState<Appointments | null>(null)
  const [homeHistory, setHomeHistory] = useState<History | null>(null)
  const [homeHistoryError, setHomeHistoryError] = useState(false)
  const [history, setHistory] = useState<History | null>(null)
  const [page, setPage] = useState(1)
  const [scope, setScope] = useState('upcoming')
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<Modal | null>(null)
  const lock = useRef(false)
  const name = profile?.nombres.split(' ')[0] || ''
  useEffect(() => {
    const controller = new AbortController()
    api<Profile>('/portal/profile', {
      token: session.token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setProfile(data)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else
            setError(
              cause instanceof ApiError && cause.status === 404
                ? 'Tu cuenta todavía no tiene un perfil de paciente vinculado. Contacta a admisión.'
                : 'No pudimos cargar tu perfil. Intenta nuevamente.',
            )
        }
      })
    return () => controller.abort()
  }, [session.token, onExpired, revision])
  useEffect(() => {
    const controller = new AbortController()
    if (view === 'payments') return () => controller.abort()
    const clinical = view === 'history' || view === 'prescriptions'
    const params = new URLSearchParams({
      pagina: String(view === 'home' ? 1 : page),
      limite: view === 'home' ? '2' : '10',
    })
    if (!clinical) params.set('scope', view === 'home' ? 'upcoming' : scope)
    const read = async () => {
      try {
        if (clinical) {
          const data = await api<History>(`/portal/history?${params}`, {
            token: session.token,
            signal: controller.signal,
          })
          if (!controller.signal.aborted) setHistory(data)
        } else {
          const data = await api<Appointments>(
            `/portal/appointments?${params}`,
            { token: session.token, signal: controller.signal },
          )
          if (!controller.signal.aborted) setAppointments(data)
        }
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        else
          setError(
            cause instanceof ApiError && cause.status === 404
              ? 'Tu cuenta todavía no tiene un perfil de paciente vinculado. Contacta a admisión.'
              : 'No pudimos cargar tu información. Intenta nuevamente.',
          )
      }
    }
    void read()
    return () => controller.abort()
  }, [view, page, scope, revision, session.token, onExpired])
  useEffect(() => {
    if (view !== 'home') return
    const controller = new AbortController()
    api<History>('/portal/history?pagina=1&limite=2', { token: session.token, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setHomeHistory(data); setHomeHistoryError(false) } })
      .catch(cause => { if (!controller.signal.aborted) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setHomeHistoryError(true) } })
    return () => controller.abort()
  }, [view, revision, session.token, onExpired])
  function navigate(next: View) {
    if (busy) return
    setView(next)
    setPage(1)
    setAppointments(null)
    setHistory(null)
    setError('')
    setMessage('')
  }
  function refresh() {
    setError('')
    setAppointments(null)
    setHistory(null)
    setRevision((v) => v + 1)
  }
  async function save(body?: { medicoId: number; inicio: string }, express = false) {
    if ((!modal && !express) || lock.current) return
    const current = express ? { kind: 'book' as const } : modal!
    if (!['book', 'reschedule', 'cancel'].includes(current.kind)) return
    lock.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const isBook = current.kind === 'book'
      const path = isBook
        ? '/portal/appointments'
        : 'appointment' in current
          ? `/portal/appointments/${current.appointment.id}/${current.kind}`
          : ''
      await api(path, {
        token: session.token,
        body:
          current.kind === 'cancel'
            ? {}
            : isBook
              ? body
              : { inicio: body?.inicio },
      })
      setModal(null)
      setPage(1)
      refresh()
      setMessage(
        current.kind === 'cancel'
          ? 'Tu cita se canceló correctamente.'
          : current.kind === 'reschedule'
            ? 'Solicitud de reprogramación enviada. Admisión debe confirmar el nuevo horario.'
            : 'Solicitud enviada. Admisión debe confirmar tu cita.',
      )
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onExpired()
        return
      }
      setModal(null)
      refresh()
      setError(
        cause instanceof ApiError && [400, 404, 409].includes(cause.status)
          ? 'No pudimos realizar el cambio. Revisa el estado de tu cita y selecciona un horario disponible.'
          : 'No pudimos confirmar el resultado. Revisa tus citas antes de volver a intentarlo.',
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  function pagination(hayMas: boolean) {
    return (
      <nav className="pp-pagination" aria-label="Páginas">
        <button
          disabled={busy || page === 1}
          onClick={() => {
            setPage((v) => v - 1)
            setAppointments(null)
            setHistory(null)
          }}
        >
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          disabled={busy || !hayMas}
          onClick={() => {
            setPage((v) => v + 1)
            setAppointments(null)
            setHistory(null)
          }}
        >
          Siguiente
        </button>
      </nav>
    )
  }
  function appointmentCard(a: Appointment, featured = false) {
    const tomorrow = new Date(
      new Date(`${portalDay}T12:00:00Z`).getTime() + 86400000,
    )
      .toISOString()
      .slice(0, 10)
    const day = new Date(new Date(a.inicio).getTime() - 5 * 3600000)
      .toISOString()
      .slice(0, 10)
    return featured ? (
      <article className="pp-featured" aria-label={`Cita ${a.id}`} key={a.id}>
        <div className="pp-featured-top">
          <span className="pp-day-tag">
            {day === portalDay
              ? 'Hoy'
              : day === tomorrow
                ? 'Mañana'
                : 'Próxima cita'}
          </span>
          <span className="pp-status">
            <Icon
              name={
                a.estado === 'pendiente_confirmacion' ? 'calendar' : 'check'
              }
            />
            {states[a.estado]}
          </span>
        </div>
        <div className="pp-featured-body">
          <div className="pp-featured-date">
            <strong>
              {date(a.inicio, { day: 'numeric', month: 'short' }).replace(
                '.',
                '',
              )}
            </strong>
            <span>
              {date(a.inicio, { weekday: 'long' })} · {clock(a.inicio)} h
            </span>
          </div>
          <div className="pp-featured-doctor">
            <h3>
              {a.medico.nombres} {a.medico.apellidos}
            </h3>
            <p>{a.especialidad.nombre}</p>
            <span>
              <Icon name="pin" />
              {a.modalidad === 'presencial'
                ? 'Presencial · Clínica San Rafael'
                : 'Consulta virtual'}
            </span>
          </div>
        </div>
        <div className="pp-featured-footer">
          <button
            className="pp-white-button"
            onClick={() => setModal({ kind: 'detail', appointment: a })}
          >
            Ver detalle
          </button>
          {changeable(a) && (
            <button
              className="pp-outline-button"
              onClick={() => setModal({ kind: 'reschedule', appointment: a })}
            >
              Reprogramar
            </button>
          )}
          <span>Tu próxima consulta</span>
        </div>
      </article>
    ) : (
      <article
        className="pp-appointment"
        key={a.id}
        aria-label={`Cita ${a.id}`}
      >
        <div className="pp-date-tile">
          <strong>{date(a.inicio, { day: 'numeric' })}</strong>
          <small>{date(a.inicio, { month: 'short' }).replace('.', '')}</small>
        </div>
        <div className="pp-appointment-doctor">
          <h3>{a.especialidad.nombre}</h3>
          <p>
            {a.medico.nombres} {a.medico.apellidos}
          </p>
        </div>
        <div className="pp-appointment-date">
          <span>
            {date(a.inicio, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </span>
          <p>
            {clock(a.inicio)} h
            {view === 'appointments' && <> · {states[a.estado]}</>}
          </p>
        </div>
        <button
          className="pp-text-button"
          onClick={() => setModal({ kind: 'detail', appointment: a })}
        >
          Ver detalle
          <Icon name="arrow" />
        </button>
      </article>
    )
  }
  const next = appointments?.citas[0]
  const biometrics = next?.evaluacionPrevia
  const bmi = biometrics?.pesoKg && biometrics.tallaCm ? (biometrics.pesoKg / ((biometrics.tallaCm / 100) ** 2)).toFixed(1) : null
  return (
    <div className={`pp-shell ${view === 'home' ? 'pp-reference-home' : ''}`}>
      <aside className="pp-sidebar">
        <a className="pp-logo" href="/pacientes/login" aria-label="Clínica San Rafael, inicio">
          <img src="/clinic-logo.png" alt="Clínica San Rafael S.A.C." />
        </a>
        <span className="pp-nav-caption">MI PORTAL</span>
        <nav aria-label="Mi portal">
          {(Object.keys(labels) as View[]).map((key) => (
            <button
              key={key}
              className={view === key ? 'pp-nav-active' : ''}
              disabled={busy}
              aria-current={view === key ? 'page' : undefined}
              onClick={() => navigate(key)}
            >
              <Icon name={icons[key]} />
              {labels[key]}
            </button>
          ))}
        </nav>
        <div className="pp-sidebar-bottom">
          <button
            className="pp-help-card"
            disabled={busy}
            onClick={() => setModal({ kind: 'help' })}
          >
            <strong>
              <Icon name="help" />
              ¿Necesitas ayuda?
            </strong>
            <span>
              Visita el centro de ayuda
              <Icon name="arrow" />
            </span>
          </button>
          <button className="pp-logout" disabled={busy} onClick={onLogout}>
            <Icon name="logout" />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="pp-workspace">
        <header className="pp-topbar">
          <strong>Portal del paciente</strong>
          <span className="pp-breadcrumb">{labels[view]}</span>
          <div className="pp-account">
            <button
              className="pp-icon-button"
              disabled={busy}
              aria-label="Notificaciones"
              onClick={() => setModal({ kind: 'notifications' })}
            >
              <Icon name="bell" />
            </button>
            <button
              className="pp-account-button"
              disabled={busy}
              onClick={() => navigate('profile')}
            >
              <Icon name="user" />
              <span>
                {name || 'Mi cuenta'}
                <small>Mi cuenta</small>
              </span>
              <span className="pp-chevron">⌄</span>
            </button>
          </div>
        </header>
        <main className="pp-main">
          <div className="pp-greeting">
            <div>
              <h1>
                {view === 'home'
                  ? `Hola${name ? `, ${name}` : ''}`
                  : labels[view]}
              </h1>
              <p>
                {view === 'home'
                  ? 'Tu salud, un día a la vez.'
                  : view === 'appointments'
                    ? 'Cada consulta, un paso para cuidarte.'
                    : view === 'profile'
                      ? 'Tu información, siempre a mano.'
                      : 'Todo sobre tu atención, en un solo lugar.'}
              </p>
            </div>
            {(view === 'appointments' || view === 'home') && (
              <button
                className="pp-primary"
                disabled={busy || !profile}
                onClick={() => setModal({ kind: 'book' })}
              >
                <Icon name="plus" />
                Agendar cita
              </button>
            )}
          </div>
          {error && (
            <div className="pp-message pp-error" role="alert">
              {error}
              <button className="pp-text-button" onClick={refresh}>
                Reintentar
              </button>
            </div>
          )}
          {message && (
            <p className="pp-message pp-success" role="status">
              {message}
            </p>
          )}
          {view === 'home' && (
            <div className="pp-home-dashboard">
              <section className="pp-home-hero pp-home-live" aria-labelledby="pp-next-title">
                {!appointments ? <p role="status">Cargando tus citas…</p> : next ? <>
                  <div className="pp-live-top"><span className="pp-live-status">{states[next.estado]}</span><span>{date(next.inicio, { dateStyle: 'long' })} · {clock(next.inicio)} h</span><span className="pp-live-reference">Cita #{next.id}</span></div>
                  <article className="pp-live-doctor" aria-label={`Cita ${next.id}`}>
                    <span className="pp-live-avatar"><Icon name="user" /></span>
                    <div className="pp-live-doctor-info"><small>Tu próxima atención</small><h2 id="pp-next-title">{next.especialidad.nombre} — {next.medico.nombres} {next.medico.apellidos}</h2><p><Icon name="pin" />Presencial · Clínica San Rafael</p></div>
                    <div className="pp-live-actions"><button className="pp-white-button" onClick={() => setModal({ kind: 'detail', appointment: next })}>Ver detalle</button>{changeable(next) && <button className="pp-outline-button" onClick={() => setModal({ kind: 'reschedule', appointment: next })}>Reprogramar</button>}</div>
                  </article>
                  <div className="pp-care-flow"><h3>Flujo de tu atención</h3><ol>
                    <li className={next.estado !== 'pendiente_confirmacion' ? 'pp-flow-done' : ''}><span>{next.estado !== 'pendiente_confirmacion' ? '✓' : '1'}</span><div><strong>1. Cita confirmada</strong><small>{next.estado === 'pendiente_confirmacion' ? 'Pendiente de admisión' : 'Cupo reservado'}</small></div></li>
                    <li className={next.llegadaEn ? 'pp-flow-done' : ''}><span>{next.llegadaEn ? '✓' : '2'}</span><div><strong>2. Registro de llegada</strong><small>{next.llegadaEn ? `${clock(next.llegadaEn)} h · Admisión` : 'Pendiente de llegada'}</small></div></li>
                    <li className={next.preparacionCompletadaEn ? 'pp-flow-done' : ''}><span>{next.preparacionCompletadaEn ? '✓' : '3'}</span><div><strong>3. Triaje asistencial</strong><small>{next.preparacionCompletadaEn ? 'Completado' : 'Pendiente de enfermería'}</small></div></li>
                    <li><span>4</span><div><strong>4. Consulta médica</strong><small>Pendiente de atención</small></div></li>
                  </ol></div>
                </> : <><h2 id="pp-next-title">Aún no tienes próximas citas</h2><p>Cuando programes una consulta, encontrarás aquí todos sus detalles.</p></>}
              </section>
              <div className="pp-home-columns">
                <div className="pp-home-primary">
                  <section className="pp-home-panel">
                    <div className="pp-section-heading"><h2><Icon name="clip" />Tratamiento y medicación</h2><button className="pp-text-button" onClick={() => navigate('prescriptions')}>Ver todas las recetas <Icon name="arrow" /></button></div>
                    <p className="pp-home-caption">Indicaciones registradas en tus consultas más recientes.</p>
                    {homeHistoryError ? <p role="alert">No pudimos cargar tus recetas. <button className="pp-text-button" onClick={refresh}>Reintentar</button></p> : !homeHistory ? <p role="status">Cargando tus recetas…</p> : <>
                      {homeHistory.consultas.filter(c => c.estado === 'activo' && c.recetaItems.length).map(c => <div key={c.id} className="pp-home-prescription"><div className="pp-home-record-heading"><strong>{c.medico.especialidad.nombre}</strong><span>{date(c.fechaHora, { dateStyle: 'medium' })}</span></div><p>{c.medico.usuario.nombres} {c.medico.usuario.apellidos}</p>{c.recetaItems.map(r => <article key={r.id} className="pp-home-medicine"><span className="pp-quick-icon"><Icon name="clip" /></span><div><h3>{r.medicamento}</h3><p>{r.dosis} · {r.via}</p><div className="pp-home-medication-tags"><span>{r.frecuencia}</span><span>Duración: {r.duracion}</span></div>{r.indicaciones && <p>{r.indicaciones}</p>}</div></article>)}</div>)}
                      {!homeHistory.consultas.some(c => c.estado === 'activo' && c.recetaItems.length) && <div className="pp-home-empty">No hay recetas en tus consultas más recientes. Puedes revisar las anteriores en Mis recetas.</div>}
                    </>}
                  </section>
                  <section className="pp-home-panel">
                    <div className="pp-section-heading"><h2><Icon name="file" />Resultados clínicos y documentos</h2><button className="pp-text-button" onClick={() => navigate('history')}>Ver historial médico <Icon name="arrow" /></button></div>
                    <p className="pp-home-caption">Consulta tus diagnósticos e indicaciones registrados.</p>
                    {homeHistoryError ? <p>No pudimos cargar tus atenciones.</p> : !homeHistory ? <p role="status">Cargando tus atenciones…</p> : homeHistory.consultas.length ? <div className="pp-home-records">{homeHistory.consultas.map(c => <article key={c.id} className="pp-home-record"><div className="pp-home-record-heading"><span className="pp-count">{c.estado === 'anulado' ? 'Anulada' : 'Consulta'}</span><span>{date(c.fechaHora, { dateStyle: 'medium' })}</span></div><h3>{c.medico.especialidad.nombre}</h3><p>{c.medico.usuario.nombres} {c.medico.usuario.apellidos}</p>{c.estado === 'anulado' ? <p>{c.motivoAnulacion}</p> : <><strong>{c.motivo}</strong>{c.diagnosticos.map(d => <p key={d.codigo}>{d.codigo} · {d.descripcion}</p>)}</>}<button className="pp-text-button" onClick={() => navigate('history')}>Consultar historial <Icon name="arrow" /></button></article>)}</div> : <div className="pp-home-empty">Todavía no tienes consultas registradas.</div>}
                  </section>
                </div>
                <aside className="pp-home-secondary">
                  <section className="pp-home-panel pp-biometrics"><div className="pp-section-heading"><h2><Icon name="check" />Constantes biométricas</h2></div><p className="pp-home-caption">{biometrics ? `Triaje registrado · ${date(biometrics.registradoEn, { dateStyle: 'short', timeStyle: 'short' })}` : 'Sin triaje registrado para tu próxima cita'}</p>
                    <div className="pp-biometrics-grid">
                      <div><small>P. arterial</small><strong>{biometrics ? `${biometrics.presionSistolica}/${biometrics.presionDiastolica}` : '—'}</strong><span>mmHg</span></div>
                      <div><small>Frecuencia</small><strong>{biometrics?.frecuenciaCardiaca ?? '—'}</strong><span>lpm</span></div>
                      <div><small>SpO₂</small><strong>{biometrics ? `${biometrics.saturacionOxigeno}%` : '—'}</strong><span>Saturación de oxígeno</span></div>
                      <div><small>IMC / Peso</small><strong>{bmi ?? '—'}</strong><span>{biometrics?.pesoKg ? `${biometrics.pesoKg} kg` : 'Sin peso registrado'}</span></div>
                    </div>
                    {biometrics && <p className="pp-biometric-note">Temperatura: {biometrics.temperaturaC} °C{biometrics.observaciones && <><br />{biometrics.observaciones}</>}</p>}
                  </section>
                  {appointments && appointments.citas.slice(1).map(a => <section className="pp-home-panel" key={a.id}><h2>Próxima en agenda</h2>{appointmentCard(a)}</section>)}
                  <PatientAlerts session={session} appointments={appointments?.citas ?? null} onExpired={onExpired} onAppointments={() => navigate('appointments')} onPayments={() => navigate('payments')} onPrescriptions={() => navigate('prescriptions')} />
                  <section className="pp-home-support"><span className="pp-quick-icon"><Icon name="help" /></span><h2>¿Necesitas ayuda?</h2><p>Consulta cómo gestionar tus citas, recetas y datos del paciente.</p><button className="pp-primary" onClick={() => setModal({ kind: 'help' })}>Centro de ayuda <Icon name="arrow" /></button><button className="pp-text-button" onClick={() => navigate('payments')}>Consultar mis pagos <Icon name="arrow" /></button></section>
                </aside>
              </div>
            </div>
          )}
          {view === 'appointments' && (
            <section className="pp-appointments-page">
              <div className="pp-tabs" role="tablist" aria-label="Estado de las citas">
                {([{ key: 'upcoming', label: 'Próximas citas' }, { key: 'past', label: 'Historial y pasadas' }, { key: 'cancelled', label: 'Canceladas' }]).map(tab => (
                  <button key={tab.key} role="tab" aria-selected={scope === tab.key} className={scope === tab.key ? 'pp-tab-active' : ''} disabled={busy} onClick={() => { setScope(tab.key); setPage(1); setAppointments(null) }}>
                    {tab.label} {scope === tab.key && appointments && <span className="pp-count">{appointments.total}</span>}
                  </button>
                ))}
              </div>
              <div className="pp-appointments-grid">
                <div role="tabpanel" aria-label={scope === 'upcoming' ? 'Próximas citas' : scope === 'past' ? 'Historial y pasadas' : 'Canceladas'}>
                  {!appointments ? <p role="status">{error ? 'No se pudieron cargar tus citas.' : 'Cargando tus citas?'}</p> : <>
                    {appointments.citas.length ? appointments.citas.map((a, i) => appointmentCard(a, scope === 'upcoming' && page === 1 && i === 0)) : <div className="pp-empty"><Icon name="calendar" /><h3>No tienes citas en esta lista</h3><p>Las citas asociadas a tu cuenta aparecerán aquí.</p></div>}
                    {pagination(appointments.hayMas)}
                  </>}
                  <section className="pp-reminder"><Icon name="help" /><h3>Prepara tu visita</h3><p>Revisa la fecha y hora de tu cita y lleva tu documento de identidad. Las solicitudes de reserva y reprogramación quedan pendientes de confirmación por admisión.</p></section>
                </div>
                <aside className="pp-appointments-aside">
                  <section className="pp-express"><div className="pp-section-heading"><h2>Reserva exprés</h2><span className="pp-count">Online</span></div>
                    <p>Elige una especialidad y una fecha. Te asignaremos un médico disponible en el horario seleccionado.</p>
                    <BookingForm key={revision} session={session} express busy={busy || !profile} onExpired={onExpired} onSave={body => void save(body, true)} />
                  </section>
                </aside>
              </div>
            </section>
          )}
          {(view === 'history' || view === 'prescriptions') && (
            <section>
              {!history ? (
                <p role="status">
                  {error
                    ? 'No se pudo cargar tu información.'
                    : 'Cargando tu información…'}
                </p>
              ) : (
                <>
                  {(view === 'history'
                    ? history.consultas
                    : history.consultas.filter(
                        (c) => c.estado === 'activo' && c.recetaItems.length,
                      )
                  ).map((c) => (
                    <article className="pp-history-card" key={c.id}>
                      <div className="pp-section-heading">
                        <h2>{c.medico.especialidad.nombre}</h2>
                        <span>
                          {date(c.fechaHora, { dateStyle: 'medium' })}
                        </span>
                      </div>
                      <p>
                        {c.medico.usuario.nombres} {c.medico.usuario.apellidos}
                      </p>
                      {c.estado === 'anulado' ? (
                        <p className="pp-message">
                          Consulta anulada · {c.motivoAnulacion}
                        </p>
                      ) : view === 'history' ? (
                        <>
                          <h3>Motivo de consulta</h3>
                          <p>{c.motivo}</p>
                          <h3>Diagnósticos</h3>
                          {c.diagnosticos.map((d) => (
                            <p key={d.codigo}>
                              {d.codigo} · {d.descripcion}
                            </p>
                          ))}
                          {c.indicaciones && (
                            <>
                              <h3>Indicaciones</h3>
                              <p>{c.indicaciones}</p>
                            </>
                          )}
                        </>
                      ) : (
                        c.recetaItems.map((r) => (
                          <div className="pp-prescription" key={r.id}>
                            <h3>{r.medicamento}</h3>
                            <dl>
                              <div>
                                <dt>Dosis</dt>
                                <dd>{r.dosis}</dd>
                              </div>
                              <div>
                                <dt>Vía</dt>
                                <dd>{r.via}</dd>
                              </div>
                              <div>
                                <dt>Frecuencia</dt>
                                <dd>{r.frecuencia}</dd>
                              </div>
                              <div>
                                <dt>Duración</dt>
                                <dd>{r.duracion}</dd>
                              </div>
                            </dl>
                            {r.indicaciones && <p>{r.indicaciones}</p>}
                          </div>
                        ))
                      )}
                    </article>
                  ))}
                  {!(
                    view === 'history'
                      ? history.consultas
                      : history.consultas.filter(
                          (c) => c.estado === 'activo' && c.recetaItems.length,
                        )
                  ).length && (
                    <div className="pp-empty">
                      {view === 'history'
                        ? 'Todavía no tienes consultas registradas.'
                        : 'No hay recetas registradas en esta página de consultas.'}
                    </div>
                  )}
                  {pagination(history.hayMas)}
                </>
              )}
            </section>
          )}
          {view === 'payments' && (
            <PatientPayments session={session} onExpired={onExpired} />
          )}
          {view === 'profile' &&
            (profile ? (
              <section className="pp-history-card">
                <h2>Mis datos personales</h2>
                <dl className="pp-profile-grid">
                  {Object.entries({
                    Nombre: `${profile.nombres} ${profile.apellidos}`,
                    [profile.tipoDocumento]: profile.numeroDocumento,
                    'Fecha de nacimiento': date(
                      `${profile.fechaNacimiento.slice(0, 10)}T12:00:00-05:00`,
                      { dateStyle: 'long' },
                    ),
                    Teléfono: profile.telefono,
                    'Correo electrónico': profile.correo,
                    Dirección: profile.direccion || 'Sin dirección registrada',
                  }).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <p>
                  Si necesitas actualizar tus datos, contacta al área de
                  admisión.
                </p>
              </section>
            ) : (
              <p role="status">
                {error ? 'Perfil no disponible.' : 'Cargando tu perfil…'}
              </p>
            ))}
          <footer className="pp-footer">
            <span>Clínica San Rafael S.A.C.</span>
            <div>
              <button onClick={() => setModal({ kind: 'privacy' })}>
                Privacidad
              </button>
              <button onClick={() => setModal({ kind: 'help' })}>
                Centro de ayuda
              </button>
            </div>
          </footer>
        </main>
      </div>
      {modal && (
        <Dialog
          className={modal.kind === 'detail' || modal.kind === 'cancel' ? 'pp-appointment-dialog' : ''}
          title={
            modal.kind === 'book'
              ? 'Agendar cita'
              : modal.kind === 'reschedule'
                ? 'Reprogramar cita'
                : modal.kind === 'cancel'
                  ? 'Cancelar cita'
                  : modal.kind === 'detail'
                    ? 'Detalle de tu cita'
                    : modal.kind === 'privacy'
                      ? 'Privacidad'
                      : modal.kind === 'notifications'
                        ? 'Notificaciones'
                        : '¿Cómo podemos ayudarte?'
          }
          busy={busy}
          onClose={() => setModal(null)}
        >
          {(modal.kind === 'book' || modal.kind === 'reschedule') && (
            <BookingForm
              session={session}
              appointment={
                modal.kind === 'reschedule' ? modal.appointment : undefined
              }
              busy={busy}
              onExpired={onExpired}
              onSave={(body) => void save(body)}
            />
          )}
          {(modal.kind === 'detail' || modal.kind === 'cancel') && (
            <>
              <div className={`pp-detail-status pp-detail-status-${modal.appointment.estado}`}>
                <span aria-hidden="true" />{states[modal.appointment.estado] || modal.appointment.estado}
              </div>
              <div className="pp-detail-when">
                <div className="pp-detail-calendar" aria-hidden="true">
                  <b>{date(modal.appointment.inicio, { month: 'short' })}</b>
                  <span>{date(modal.appointment.inicio, { day: '2-digit' })}</span>
                </div>
                <div>
                  <strong>{date(modal.appointment.inicio, { dateStyle: 'full' })}</strong>
                  <p>{clock(modal.appointment.inicio)}–{clock(modal.appointment.fin)} h · Horario de Lima</p>
                </div>
              </div>
              <dl className="pp-detail-rows">
                <div><Icon name="file" /><div><dt>Especialidad</dt><dd>{modal.appointment.especialidad.nombre}</dd></div></div>
                <div><Icon name="user" /><div><dt>Médico</dt><dd>{modal.appointment.medico.nombres} {modal.appointment.medico.apellidos}</dd></div></div>
                <div><Icon name="pin" /><div><dt>Lugar</dt><dd>Clínica San Rafael</dd></div></div>
                <div><Icon name="calendar" /><div><dt>Modalidad</dt><dd>{modal.appointment.modalidad === 'presencial' ? 'Presencial' : 'Consulta virtual'}</dd></div></div>
              </dl>
              {modal.kind === 'cancel' ? (
                <div className="pp-detail-confirm">
                  <p>
                    ¿Confirmas que deseas cancelar esta cita? El horario quedará
                    libre para otro paciente.
                  </p>
                  <button className="pp-keep-appointment" disabled={busy} onClick={() => setModal({ kind: 'detail', appointment: modal.appointment })}>Mantener cita</button>
                  <button
                    className="pp-danger"
                    disabled={busy}
                    onClick={() => void save()}
                  >
                    {busy ? 'Cancelando…' : 'Confirmar cancelación'}
                  </button>
                </div>
              ) : (
                changeable(modal.appointment) && (
                  <div className="pp-dialog-actions pp-detail-actions">
                    <button
                      className="pp-primary"
                      onClick={() =>
                        setModal({
                          kind: 'reschedule',
                          appointment: modal.appointment,
                        })
                      }
                    >
                      Reprogramar
                    </button>
                    <button
                      className="pp-detail-cancel"
                      onClick={() =>
                        setModal({
                          kind: 'cancel',
                          appointment: modal.appointment,
                        })
                      }
                    >
                      Cancelar cita
                    </button>
                  </div>
                )
              )}
            </>
          )}
          {modal.kind === 'help' && (
            <>
              <p>
                En <strong>Mis citas</strong> puedes consultar tus horarios, ver
                el detalle, reprogramar o cancelar una cita antes de registrar
                tu llegada.
              </p>
              <p>
                En <strong>Mi historial</strong> y <strong>Mis recetas</strong>{' '}
                encontrarás tus atenciones registradas. Para actualizar tus
                datos o solicitar ayuda, comunícate con admisión de Clínica San
                Rafael.
              </p>
            </>
          )}
          {modal.kind === 'privacy' && (
            <p>
              Este portal muestra la información asociada a tu cuenta de
              paciente. Mantén tu contraseña privada y cierra la sesión si
              utilizas un equipo compartido. Para consultas sobre tus datos
              personales, contacta a Clínica San Rafael.
            </p>
          )}
          {modal.kind === 'notifications' && (
            <PatientAlerts
              session={session}
              appointments={appointments?.citas ?? null}
              onExpired={onExpired}
              onAppointments={() => {
                setModal(null)
                navigate('appointments')
              }}
              onPayments={() => {
                setModal(null)
                navigate('payments')
              }}
              onPrescriptions={() => {
                setModal(null)
                navigate('prescriptions')
              }}
            />
          )}
        </Dialog>
      )}
    </div>
  )
}
