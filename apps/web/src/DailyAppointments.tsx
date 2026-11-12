import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'

type Appointment = {
  id: number
  inicio: string
  fin: string
  estado: string
  modalidad: string
  llegadaEn: string | null
  paciente: {
    id: number
    tipoDocumento: string
    numeroDocumento: string
    nombres: string
    apellidos: string
  }
  medico: { id: number; nombres: string; apellidos: string }
  especialidad: { id: number; nombre: string }
}
type Listing = {
  fecha: string
  zonaHoraria: string
  pagina: number
  limite: number
  hayMas: boolean
  citas: Appointment[]
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
const time = (date: string) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date))
const today = () =>
  new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)

export function DailyAppointments({
  session,
  onExpired,
  onBusyChange,
}: {
  session: Session
  onExpired: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [page, setPage] = useState(1)
  const [pendingPortal, setPendingPortal] = useState(false)
  const [state, setState] = useState('')
  const [date, setDate] = useState(today)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeIsError, setNoticeIsError] = useState(false)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [action, setAction] = useState<
    'arrival' | 'cancel' | 'reschedule' | 'confirm'
  >('arrival')
  const [newDate, setNewDate] = useState(today)
  const [slots, setSlots] = useState<{ inicio: string; fin: string }[]>([])
  const [slot, setSlot] = useState('')
  const [rescheduleReason, setRescheduleReason] = useState('')
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const lock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!date && !pendingPortal) return
    const controller = new AbortController()
    const params = new URLSearchParams({
      fecha: date,
      pagina: String(page),
      limite: '20',
    })
    if (pendingPortal) {
      params.delete('fecha')
      params.set('pendientesPortal', 'true')
    } else if (state) params.set('estado', state)
    api<Listing>(`/agenda/appointments?${params}`, {
      token: session.token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setListing(data)
          setError('')
        }
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        else {
          setListing(null)
          setError(
            cause instanceof ApiError && cause.status === 403
              ? 'Tu cuenta no tiene permiso para consultar las citas.'
              : 'No se pudieron cargar las citas. Intenta actualizar la lista.',
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [session.token, onExpired, page, state, date, revision, pendingPortal])
  useEffect(() => {
    if (!selected || action !== 'reschedule' || !newDate) return
    const controller = new AbortController()
    const params = new URLSearchParams({
      fecha: newDate,
      especialidadId: String(selected.especialidad.id),
      medicoId: String(selected.medico.id),
    })
    api<{ turnos: { inicio: string; fin: string }[] }>(
      `/agenda/availability?${params}`,
      { token: session.token, signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setSlots(data.turnos)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else
            setError(
              'No se pudo consultar disponibilidad. Vuelve a seleccionar la fecha.',
            )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSlotsLoading(false)
      })
    return () => controller.abort()
  }, [selected, action, newDate, session.token, onExpired])
  function choose(
    appointment: Appointment,
    nextAction: 'cancel' | 'reschedule' | 'confirm',
  ) {
    if (selected?.id === appointment.id && action === nextAction) return
    setSelected(appointment)
    setRescheduleReason('')
    setAction(nextAction)
    setNewDate(today())
    setSlot('')
    setSlots([])
    setSlotsLoading(nextAction === 'reschedule')
    setError('')
    setNotice('')
    setNoticeIsError(false)
  }
  async function changeAppointment() {
    if (!selected || lock.current || (action === 'reschedule' && (!slot || !rescheduleReason.trim()))) return
    lock.current = true
    setSaving(true)
    onBusyChange(true)
    setError('')
    setNotice('')
    setNoticeIsError(false)
    try {
      await api(`/agenda/appointments/${selected.id}/${action}`, {
        token: session.token,
        body: action === 'reschedule' ? { inicio: slot, motivo: rescheduleReason.trim() } : {},
      })
      if (!mounted.current) return
      setNotice(
        action === 'confirm'
          ? 'Cita confirmada por admisi\u00f3n.'
          : action === 'cancel'
            ? 'Cita cancelada. El turno quedó libre.'
            : `Cita reprogramada para ${newDate} a las ${time(slot)} (Lima).`,
      )
      reload()
    } catch (cause) {
      if (!mounted.current) return
      if (cause instanceof ApiError && cause.status === 401) {
        onExpired()
        return
      }
      reload()
      setNoticeIsError(true)
      setNotice(
        cause instanceof ApiError && [400, 404, 409].includes(cause.status)
          ? 'No se pudo realizar el cambio: la cita o el turno ya no están disponibles. Revisa la lista y selecciona nuevamente.'
          : 'No se pudo confirmar el resultado. Actualiza la lista y comprueba la fecha y el estado antes de volver a intentarlo.',
      )
    } finally {
      lock.current = false
      if (mounted.current) {
        setSaving(false)
        onBusyChange(false)
      }
    }
  }
  function changeDate(value: string) {
    setPendingPortal(false)
    setDate(value)
    setPage(1)
    setSelected(null)
    setListing(null)
    setNotice('')
    setNoticeIsError(false)
    setError('')
    setLoading(!!value)
    setRevision((v) => v + 1)
  }
  function reload() {
    setLoading(true)
    setSelected(null)
    setError('')
    setRevision((value) => value + 1)
  }
  async function arrive() {
    if (!selected || lock.current || listing?.fecha !== today()) return
    lock.current = true
    setSaving(true)
    onBusyChange(true)
    setNotice('')
    setNoticeIsError(false)
    setError('')
    try {
      const result = await api<{ llegadaEn: string }>(
        `/agenda/appointments/${selected.id}/arrival`,
        { token: session.token, body: {} },
      )
      if (!mounted.current) return
      setNotice(
        `Llegada registrada para ${selected.paciente.nombres} ${selected.paciente.apellidos} a las ${time(result.llegadaEn)} (Lima).`,
      )
      reload()
    } catch (cause) {
      if (!mounted.current) return
      if (cause instanceof ApiError && cause.status === 401) {
        onExpired()
        return
      }
      setSelected(null)
      if (cause instanceof ApiError && [400, 404, 409].includes(cause.status)) {
        reload()
        setNotice(
          'La cita ya no permite registrar la llegada. Actualizamos la lista; revisa su estado y fecha.',
        )
      } else {
        setError(
          cause instanceof ApiError && cause.status === 403
            ? 'Tu cuenta no tiene permiso para registrar llegadas.'
            : 'No se pudo confirmar el resultado. Actualiza la lista para comprobar si la llegada quedó registrada antes de intentar otra vez.',
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
    <section className="daily-appointments" aria-labelledby="daily-title">
      <div className="page-heading">
        <p className="eyebrow">Área de admisión / Recepción</p>
        <h1 id="daily-title">
          {pendingPortal ? 'Solicitudes del portal' : 'Citas del día'}
        </h1>
        <p>
          {pendingPortal
            ? 'Citas solicitadas por pacientes desde el portal, pendientes de confirmación por admisión. Incluye fechas futuras; confirma cada solicitud para habilitar su atención.'
            : <>{listing ? `${listing.fecha} · ` : ''}Horario de Lima. Confirma la identidad del paciente antes de registrar su llegada.</>}
        </p>
      </div>
      <button
        className="secondary"
        aria-pressed={pendingPortal}
        aria-describedby="portal-requests-help"
        disabled={saving}
        onClick={() => {
          setPendingPortal((value) => !value)
          setPage(1)
          setState('')
          setSelected(null)
          setListing(null)
          setLoading(true)
          setNotice('')
        }}
      >
        Solicitudes del portal
      </button>
      <p id="portal-requests-help" className="small muted portal-requests-help">
        {pendingPortal
          ? 'Pulsa de nuevo para volver a las citas de la fecha seleccionada.'
          : 'Consulta las citas del portal pendientes de confirmar, incluidas las de fechas futuras.'}
      </p>
      <div className="daily-toolbar">
        <div>
          <label htmlFor="daily-date">Fecha de las citas</label>
          <input
            id="daily-date"
            type="date"
            required
            value={date}
            disabled={saving || pendingPortal}
            onChange={(event) => changeDate(event.target.value)}
          />
        </div>
        <button
          className="secondary"
          disabled={saving}
          onClick={() => changeDate(today())}
        >
          Hoy
        </button>
        <div>
          <label htmlFor="daily-state">Estado de la cita</label>
          <select
            id="daily-state"
            value={state}
            disabled={saving || !date || pendingPortal}
            onChange={(event) => {
              setState(event.target.value)
              setPage(1)
              setSelected(null)
              setNotice('')
              setNoticeIsError(false)
              setListing(null)
              setLoading(true)
            }}
          >
            <option value="">Todos los estados</option>
            {Object.entries(states).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button
          className="secondary"
          disabled={saving || loading || !date}
          onClick={reload}
        >
          Actualizar lista
        </button>
      </div>
      {notice && (
        <p
          className={`notice ${noticeIsError ? 'error' : 'success'}`}
          role={noticeIsError ? 'alert' : 'status'}
        >
          {notice}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!date && (
        <p className="empty">Selecciona una fecha para consultar las citas.</p>
      )}
      {loading ? (
        <p role="status">Cargando citas…</p>
      ) : (
        listing && (
          <>
            {listing.citas.length === 0 && (
              <p className="empty">
                No hay citas para el {listing.fecha} con este filtro.
              </p>
            )}
            {!pendingPortal && listing.fecha !== today() && (
              <p className="small muted">
                La llegada solo se puede registrar para citas de hoy, según la
                fecha de Lima.
              </p>
            )}
            <div className="daily-table-wrap">
              <table className="daily-table">
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Hora</th>
                    <th scope="col">Paciente</th>
                    <th scope="col">DNI</th>
                    <th scope="col">Especialidad</th>
                    <th scope="col">Doctor asignado</th>
                    <th scope="col">Estado</th>
                    <th scope="col"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {listing.citas.map((appointment) => {
                    const isPending = appointment.estado === 'pendiente_confirmacion'
                    const isConfirmed = ['programada', 'confirmada', 'reprogramada'].includes(appointment.estado)
                    const canRegisterArrival = listing.fecha === today() && isConfirmed && !appointment.llegadaEn
                    return (
                      <tr key={appointment.id} aria-label={`Cita ${appointment.id}`}>
                        <td data-label="ID">{appointment.id}</td>
                        <td data-label="Hora">
                          {pendingPortal && <span className="daily-date">{new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short' }).format(new Date(appointment.inicio))}</span>}
                          {time(appointment.inicio)}–{time(appointment.fin)}
                        </td>
                        <td data-label="Paciente">{appointment.paciente.nombres} {appointment.paciente.apellidos}</td>
                        <td data-label="DNI">{appointment.paciente.numeroDocumento}</td>
                        <td data-label="Especialidad">{appointment.especialidad.nombre}</td>
                        <td data-label="Doctor asignado">{appointment.medico.nombres} {appointment.medico.apellidos}</td>
                        <td data-label="Estado"><span className="badge">{states[appointment.estado] ?? appointment.estado}</span>{appointment.llegadaEn && <span className="arrival-recorded">Llegada registrada: {time(appointment.llegadaEn)}</span>}</td>
                        <td data-label="Acciones">
                          <div className="daily-actions">
                            {isPending && <button className="primary" disabled={saving} onClick={() => choose(appointment, 'confirm')}>Confirmar cita</button>}
                            {canRegisterArrival && <button className="primary" disabled={saving} onClick={() => { setSelected(appointment); setAction('arrival'); setNotice(''); setNoticeIsError(false); setError('') }}>Registrar llegada</button>}
                            {isConfirmed && !appointment.llegadaEn && <><button className="secondary" disabled={saving} onClick={() => choose(appointment, 'reschedule')}>Reprogramar</button><button className="secondary" disabled={saving} onClick={() => choose(appointment, 'cancel')}>Cancelar cita</button></>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <nav className="daily-pagination" aria-label="Páginas de citas">
              <button
                className="secondary"
                disabled={page === 1 || saving}
                onClick={() => {
                  setPage(page - 1)
                  setLoading(true)
                  setSelected(null)
                }}
              >
                Anterior
              </button>
              <span>Página {page}</span>
              <button
                className="secondary"
                disabled={!listing.hayMas || saving}
                onClick={() => {
                  setPage(page + 1)
                  setLoading(true)
                  setSelected(null)
                }}
              >
                Siguiente
              </button>
            </nav>
          </>
        )
      )}
      {selected && action === 'arrival' && (
        <div className="modal-backdrop" role="presentation">
          <section className="card arrival-confirmation modal" role="dialog" aria-modal="true" aria-labelledby="arrival-title">
            <h2 id="arrival-title">Confirmar llegada</h2>
            <div className="arrival-details">
              <div>
                <p className="eyebrow">Paciente</p>
                <strong>{selected.paciente.nombres} {selected.paciente.apellidos}</strong>
                <p className="small">{selected.paciente.tipoDocumento}: {selected.paciente.numeroDocumento}</p>
              </div>
              <div>
                <p className="eyebrow">Consulta</p>
                <strong>Cita #{selected.id} · {time(selected.inicio)}</strong>
                <p className="small">{selected.especialidad.nombre} · Dr. {selected.medico.nombres} {selected.medico.apellidos}</p>
              </div>
            </div>
            <p className="arrival-reminder">Confirma que el paciente está presente en la clínica.</p>
            <div className="daily-pagination">
              <button
                className="secondary"
                disabled={saving}
                onClick={() => setSelected(null)}
              >
                Cancelar
              </button>
              <button
                className="primary"
                disabled={saving}
                onClick={() => void arrive()}
              >
                {saving ? 'Registrando llegada…' : 'Confirmar llegada'}
              </button>
            </div>
          </section>
        </div>
      )}
      {selected && action === 'cancel' && (
        <div className="modal-backdrop" role="presentation">
          <section className="card modal cancellation-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
            <h2 id="cancel-title">¿Está seguro de cancelar la cita?</h2>
            <div className="daily-pagination">
              <button className="secondary" disabled={saving} onClick={() => setSelected(null)}>Volver</button>
              <button className="danger" disabled={saving} onClick={() => void changeAppointment()}>{saving ? 'Guardando cambio…' : 'Confirmar cancelación'}</button>
            </div>
          </section>
        </div>
      )}
      {selected && action !== 'arrival' && action !== 'cancel' && (
        <div className={action === 'reschedule' ? 'modal-backdrop' : undefined}>
        <section
          className={action === 'reschedule' ? 'card modal reschedule-modal' : 'card arrival-confirmation'}
          role={action === 'reschedule' ? 'dialog' : undefined}
          aria-modal={action === 'reschedule' ? true : undefined}
          aria-labelledby="change-title"
        >
          <h2 id="change-title">
            {action === 'confirm'
              ? 'Confirmar solicitud del portal'
              : 'Reprogramar cita'}
          </h2>
          {action === 'reschedule' ? (
            <div className="reschedule-details">
              <div>
                <p className="eyebrow">Paciente</p>
                <strong>{selected.paciente.nombres} {selected.paciente.apellidos}</strong>
                <p className="small">{selected.paciente.tipoDocumento}: {selected.paciente.numeroDocumento}</p>
              </div>
              <div>
                <p className="eyebrow">Cita actual</p>
                <strong>Cita #{selected.id} · {time(selected.inicio)}</strong>
                <p className="small">{selected.especialidad.nombre}</p>
                <p className="small">Dr. {selected.medico.nombres} {selected.medico.apellidos}</p>
              </div>
            </div>
          ) : (
            <>
              <p>{selected.paciente.nombres} {selected.paciente.apellidos} · Cita #{selected.id}</p>
              <p>{new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }).format(new Date(selected.inicio))} · {selected.medico.nombres} {selected.medico.apellidos}</p>
            </>
          )}
          {action === 'confirm' ? (
            <p>
              Confirma la solicitud del paciente para habilitar su atención en
              el horario indicado.
            </p>
          ) : (
            <div className="reschedule-form">
              <h3>Nueva programación</h3>
              <div className="reschedule-fields">
                <div><label htmlFor="reschedule-date">Nueva fecha</label><input id="reschedule-date" type="date" min={today()} value={newDate} disabled={saving} onChange={(event) => { setNewDate(event.target.value); setSlots([]); setSlot(''); setSlotsLoading(!!event.target.value); setError('') }} /></div>
                <div><label htmlFor="reschedule-slot">Nuevo turno (Lima)</label><select id="reschedule-slot" value={slot} disabled={saving || slotsLoading} onChange={(event) => setSlot(event.target.value)}><option value="">Selecciona un turno</option>{slots.map((item) => <option key={item.inicio} value={item.inicio}>{time(item.inicio)}–{time(item.fin)}</option>)}</select></div>
              </div>
              {slotsLoading ? (
                <p role="status">Consultando turnos…</p>
              ) : (
                slots.length === 0 && (
                  <p>No hay turnos disponibles para esta fecha.</p>
                )
              )}
              {slot && (
                <p>
                  Nuevo horario: {newDate} · {time(slot)} (Lima). Se conserva el
                  médico y el paciente.
                </p>
              )}
              <label htmlFor="reschedule-reason">Motivo de la reprogramación (obligatorio)</label>
              <textarea id="reschedule-reason" required maxLength={300} rows={3} value={rescheduleReason} disabled={saving} onChange={event => setRescheduleReason(event.target.value)} />
            </div>
          )}
          <div className="daily-pagination">
            <button
              className="secondary"
              disabled={saving}
              onClick={() => setSelected(null)}
            >
              Volver
            </button>
            <button
              className="primary"
              disabled={
                saving || (action === 'reschedule' && (!slot || slotsLoading || !rescheduleReason.trim()))
              }
              onClick={() => void changeAppointment()}
            >
              {saving
                ? 'Guardando cambio…'
                : action === 'confirm'
                  ? 'Confirmar solicitud'
                  : 'Confirmar reprogramación'}
            </button>
          </div>
        </section>
        </div>
      )}
    </section>
  )
}
