import { useEffect, useRef, useState } from 'react'
import { NursingEvaluation, DiscardMeasurements } from './NursingEvaluation'
import './Nursing.css'
import { api, ApiError } from './api'
import type { Session } from './api'

type Pending = {
  citaId: number
  paciente: {
    id: number
    nombres: string
    apellidos: string
    tipoDocumento: string
    numeroDocumento: string
    edad: number
  }
  inicio: string
  llegadaEn: string
  medico: { id: number; nombres: string; apellidos: string }
  especialidad: { id: number; nombre: string }
  estadoPreparacion: 'pendiente'
}
type Queue = {
  fecha: string
  hayMas: boolean
  pacientes: Pending[]
  especialidades?: { id: number; nombre: string }[]
}
const time = (value: string) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
export function Nursing({
  session,
  onExpired,
  onBusyChange,
}: {
  session: Session
  onExpired: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [queue, setQueue] = useState<Queue | null>(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<Pending | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [pendingChange, setPendingChange] = useState<(() => void) | null>(null)
  const [search, setSearch] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [filters, setFilters] = useState({ search: '', specialty: '' })
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])
  const lock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ pagina: String(page), limite: '6' })
    if (filters.search) params.set('buscar', filters.search)
    if (filters.specialty) params.set('especialidadId', filters.specialty)
    api<Queue>(`/agenda/nursing-queue?${params}`, {
      token: session.token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setQueue(data)
          setError('')
        }
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        else {
          setQueue(null)
          setError(
            cause instanceof ApiError && cause.status === 403
              ? 'Tu cuenta perdió el permiso para consultar pacientes pendientes.'
              : 'No se pudieron cargar los pacientes pendientes. Actualiza la lista para intentar nuevamente.',
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [session.token, onExpired, revision, page, filters])
  function requestChange(action: () => void) {
    if (saving) return
    if (dirty) setPendingChange(() => action)
    else action()
  }
  function reload() {
    setDirty(false)
    setSelected(null)
    setError('')
    setLoading(true)
    setRevision((value) => value + 1)
  }
  async function save(values: Record<string, number | string>) {
    if (!selected || lock.current) return
    lock.current = true
    setSaving(true)
    onBusyChange(true)
    setError('')
    setNotice('')
    try {
      await api(`/agenda/appointments/${selected.citaId}/vital-signs`, {
        token: session.token,
        body: values,
      })
      if (!mounted.current) return
      const name = `${selected.paciente.nombres} ${selected.paciente.apellidos}`
      setPage(1)
      reload()
      setNotice(
        `Evaluación registrada para ${name}. La preparación está completada y el médico puede consultar los signos vitales.`,
      )
    } catch (cause) {
      if (!mounted.current) return
      if (cause instanceof ApiError && cause.status === 401) {
        onExpired()
        return
      }
      if (cause instanceof ApiError && [404, 409].includes(cause.status)) {
        reload()
        setNotice(
          'La cita ya no está pendiente de evaluación. Actualizamos la lista; no se sobrescribió ningún registro.',
        )
      } else if (cause instanceof ApiError && cause.status === 400)
        setError(
          'Revisa las mediciones y confirma que la cita corresponde a hoy. No se guardó la evaluación.',
        )
      else if (cause instanceof ApiError && cause.status === 403) {
        setDirty(false)
        setSelected(null)
        setQueue(null)
        setError('Tu cuenta no tiene permiso para registrar signos vitales.')
      } else {
        setDirty(false)
        setSelected(null)
        setQueue(null)
        setError(
          'No se pudo confirmar el resultado. Actualiza la lista para comprobar si se completó la preparación antes de volver a registrar. No se reintentará automáticamente.',
        )
      }
    } finally {
      lock.current = false
      if (mounted.current) {
        setSaving(false)
        onBusyChange(false)
      }
    }
  }
  return (
    <section
      className="nursing nursing-workspace"
      aria-labelledby="nursing-title"
    >
      <div className="page-heading">
        <p className="eyebrow">Estación de cuidados · Enfermería</p>
        <h1 id="nursing-title">Evaluación previa</h1>
        <p>
          {queue?.fecha ? `${queue.fecha} · ` : ''}Registro de signos vitales
          para pacientes con llegada confirmada. Horario de Lima.
        </p>
      </div>
      {notice && (
        <p role="status" className="notice success">
          {notice}
        </p>
      )}
      {error && !selected && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <div className="nw-workspace-grid">
        <aside
          className="nw-panel nw-queue"
          aria-label="Pacientes pendientes de evaluación"
        >
          <div className="nw-queue-heading">
            <div>
              <span className="eyebrow">Llegadas registradas</span>
              <h2>Pacientes pendientes</h2>
            </div>
            <button
              className="secondary"
              disabled={saving || loading}
              onClick={() => requestChange(reload)}
            >
              Actualizar pendientes
            </button>
          </div>
          <form
            className="nw-filters"
            onSubmit={(event) => {
              event.preventDefault()
              requestChange(() => {
                setDirty(false)
                setDirty(false)
                setSelected(null)
                setQueue(null)
                setError('')
                setNotice('')
                setLoading(true)
                setPage(1)
                setFilters({ search: search.trim(), specialty })
                setRevision((v) => v + 1)
              })
            }}
          >
            <label htmlFor="nw-search">
              Buscar paciente por apellido o documento
            </label>
            <input
              id="nw-search"
              type="search"
              minLength={2}
              maxLength={100}
              placeholder="Apellido o documento"
              value={search}
              disabled={saving}
              onChange={(event) => setSearch(event.target.value)}
            />
            <label htmlFor="nw-specialty">Especialidad</label>
            <select
              id="nw-specialty"
              value={specialty}
              disabled={saving}
              onChange={(event) => setSpecialty(event.target.value)}
            >
              <option value="">Todas las especialidades</option>
              {queue?.especialidades?.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.nombre}
                </option>
              ))}
            </select>
            <button className="secondary" disabled={saving}>
              Filtrar pendientes
            </button>
          </form>
          {loading ? (
            <p role="status">Cargando pacientes pendientes…</p>
          ) : (
            queue && (
              <>
                {!queue.pacientes.length && (
                  <p className="empty">
                    No hay pacientes pendientes de evaluación en esta página.
                  </p>
                )}
                <div className="nw-patient-list">
                  {queue.pacientes.map((appointment) => (
                    <article
                      className={`nw-patient-card${selected?.citaId === appointment.citaId ? ' selected-patient' : ''}`}
                      key={appointment.citaId}
                      aria-label={`Cita ${appointment.citaId}`}
                    >
                      <div className="nw-card-top">
                        <span>
                          {selected?.citaId === appointment.citaId
                            ? 'Seleccionado para evaluación'
                            : 'Pendiente de evaluación'}
                        </span>
                        <small>
                          Llegada hace{' '}
                          {Math.max(
                            0,
                            Math.floor(
                              (now -
                                new Date(appointment.llegadaEn).getTime()) /
                                60000,
                            ),
                          )}{' '}
                          min
                        </small>
                      </div>
                      <div className="nw-card-identity">
                        <span className="nw-avatar" aria-hidden="true">
                          {appointment.paciente.nombres.charAt(0)}
                          {appointment.paciente.apellidos.charAt(0)}
                        </span>
                        <div>
                          <h3>
                            {appointment.paciente.nombres}{' '}
                            {appointment.paciente.apellidos}
                          </h3>
                          <p>
                            {appointment.paciente.tipoDocumento}:{' '}
                            {appointment.paciente.numeroDocumento}
                          </p>
                          <small>
                            {appointment.paciente.edad} años · Cita #
                            {appointment.citaId}
                          </small>
                        </div>
                      </div>
                      <div className="nw-card-appointment">
                        <strong>{appointment.especialidad.nombre}</strong>
                        <span>
                          {appointment.medico.nombres}{' '}
                          {appointment.medico.apellidos}
                        </span>
                        <small>
                          Cita: {time(appointment.inicio)} · Llegada:{' '}
                          {time(appointment.llegadaEn)}
                        </small>
                      </div>
                      <button
                        className="primary"
                        disabled={
                          saving || selected?.citaId === appointment.citaId
                        }
                        onClick={() =>
                          requestChange(() => {
                            setDirty(false)
                            setSelected(appointment)
                            setError('')
                            setNotice('')
                          })
                        }
                      >
                        {selected?.citaId === appointment.citaId
                          ? 'En evaluación'
                          : 'Evaluar'}
                      </button>
                    </article>
                  ))}
                </div>
                <nav
                  className="nw-pagination"
                  aria-label="Páginas de pacientes pendientes"
                >
                  <button
                    className="secondary"
                    disabled={saving || page === 1}
                    onClick={() =>
                      requestChange(() => {
                        setDirty(false)
                        setSelected(null)
                        setQueue(null)
                        setLoading(true)
                        setPage(page - 1)
                      })
                    }
                  >
                    Anterior
                  </button>
                  <span>Página {page}</span>
                  <button
                    className="secondary"
                    disabled={saving || !queue.hayMas}
                    onClick={() =>
                      requestChange(() => {
                        setDirty(false)
                        setSelected(null)
                        setQueue(null)
                        setLoading(true)
                        setPage(page + 1)
                      })
                    }
                  >
                    Siguiente
                  </button>
                </nav>
              </>
            )
          )}
        </aside>
        {selected ? (
          <NursingEvaluation
            key={selected.citaId}
            appointment={selected}
            saving={saving}
            error={error}
            onSave={save}
            onDirtyChange={setDirty}
            onCancel={() =>
              requestChange(() => {
                setDirty(false)
                setSelected(null)
                setError('')
              })
            }
          />
        ) : (
          <section className="nw-panel nw-empty-selection">
            <span className="nw-empty-icon" aria-hidden="true">
              ✚
            </span>
            <span className="eyebrow">Registro asistencial</span>
            <h2>Selecciona un paciente para evaluar</h2>
            <p>
              Revisa su identidad y registra las mediciones tomadas antes de la
              consulta médica.
            </p>
            <ol>
              <li>Selecciona un paciente de la bandeja.</li>
              <li>Completa las mediciones y observaciones.</li>
              <li>Guarda la evaluación para habilitar la atención médica.</li>
            </ol>
          </section>
        )}
      </div>
      {pendingChange && (
        <DiscardMeasurements
          onStay={() => setPendingChange(null)}
          onDiscard={() => {
            const action = pendingChange
            setPendingChange(null)
            setDirty(false)
            action()
          }}
        />
      )}
    </section>
  )
}
