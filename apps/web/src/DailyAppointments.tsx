import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'

type Appointment = {
  id: number; inicio: string; fin: string; estado: string; modalidad: string; llegadaEn: string | null;
  paciente: { id: number; tipoDocumento: string; numeroDocumento: string; nombres: string; apellidos: string };
  medico: { id: number; nombres: string; apellidos: string }; especialidad: { id: number; nombre: string };
}
type Listing = { fecha: string; zonaHoraria: string; pagina: number; limite: number; hayMas: boolean; citas: Appointment[] }
const states: Record<string, string> = { programada: 'Programada', confirmada: 'Confirmada', reprogramada: 'Reprogramada', cancelada: 'Cancelada', atendida: 'Atendida', no_asistio: 'No asistió' }
const time = (date: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(date))
const today = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)

export function DailyAppointments({ session, onExpired, onBusyChange }: { session: Session; onExpired: () => void; onBusyChange: (busy: boolean) => void }) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [page, setPage] = useState(1)
  const [state, setState] = useState('')
  const [date, setDate] = useState(today)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [saving, setSaving] = useState(false)
  const lock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!date) return
    const controller = new AbortController()
    const params = new URLSearchParams({ fecha: date, pagina: String(page), limite: '20' })
    if (state) params.set('estado', state)
    api<Listing>(`/agenda/appointments?${params}`, { token: session.token, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setListing(data); setError('') } })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        else { setListing(null); setError(cause instanceof ApiError && cause.status === 403 ? 'Tu cuenta no tiene permiso para consultar las citas.' : 'No se pudieron cargar las citas. Intenta actualizar la lista.') }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [session.token, onExpired, page, state, date, revision])
  function changeDate(value: string) { setDate(value); setPage(1); setSelected(null); setListing(null); setNotice(''); setError(''); setLoading(!!value); setRevision(v => v + 1) }
  function reload() { setLoading(true); setSelected(null); setError(''); setRevision(value => value + 1) }
  async function arrive() {
    if (!selected || lock.current || listing?.fecha !== today()) return
    lock.current = true; setSaving(true); onBusyChange(true); setNotice(''); setError('')
    try {
      const result = await api<{ llegadaEn: string }>(`/agenda/appointments/${selected.id}/arrival`, { token: session.token, body: {} })
      if (!mounted.current) return
      setNotice(`Llegada registrada para ${selected.paciente.nombres} ${selected.paciente.apellidos} a las ${time(result.llegadaEn)} (Lima).`)
      reload()
    } catch (cause) {
      if (!mounted.current) return
      if (cause instanceof ApiError && cause.status === 401) { onExpired(); return }
      setSelected(null)
      if (cause instanceof ApiError && [400, 404, 409].includes(cause.status)) {
        reload(); setNotice('La cita ya no permite registrar la llegada. Actualizamos la lista; revisa su estado y fecha.')
      } else {
        setError(cause instanceof ApiError && cause.status === 403 ? 'Tu cuenta no tiene permiso para registrar llegadas.' : 'No se pudo confirmar el resultado. Actualiza la lista para comprobar si la llegada quedó registrada antes de intentar otra vez.')
      }
    } finally {
      lock.current = false
      if (mounted.current) { setSaving(false); onBusyChange(false) }
    }
  }
  return <section className="daily-appointments" aria-labelledby="daily-title">
    <div className="page-heading"><p className="eyebrow">Área de admisión / Recepción</p><h1 id="daily-title">Citas del día</h1><p>{listing ? `${listing.fecha} · ` : ''}Horario de Lima. Confirma la identidad del paciente antes de registrar su llegada.</p></div>
    <div className="daily-toolbar">
      <div><label htmlFor="daily-date">Fecha de las citas</label><input id="daily-date" type="date" required value={date} disabled={saving} onChange={event => changeDate(event.target.value)} /></div>
      <button className="secondary" disabled={saving} onClick={() => changeDate(today())}>Hoy</button>
      <div><label htmlFor="daily-state">Estado de la cita</label><select id="daily-state" value={state} disabled={saving || !date} onChange={event => { setState(event.target.value); setPage(1); setSelected(null); setNotice(''); setListing(null); setLoading(true) }}><option value="">Todos los estados</option>{Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <button className="secondary" disabled={saving || loading || !date} onClick={reload}>Actualizar lista</button>
    </div>
    {notice && <p className="notice success" role="status">{notice}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {!date && <p className="empty">Selecciona una fecha para consultar las citas.</p>}
    {loading ? <p role="status">Cargando citas…</p> : listing && <>
      {listing.citas.length === 0 && <p className="empty">No hay citas para el {listing.fecha} con este filtro.</p>}
      {listing.fecha !== today() && <p className="small muted">La llegada solo se puede registrar para citas de hoy, según la fecha de Lima.</p>}
      <div className="daily-list">{listing.citas.map(appointment => <article className="card daily-row" key={appointment.id} aria-label={`Cita ${appointment.id}`}>
        <div><strong>{time(appointment.inicio)}–{time(appointment.fin)}</strong><p className="small">Cita #{appointment.id} · {appointment.modalidad === 'presencial' ? 'Presencial' : 'Virtual'}</p></div>
        <div><strong>{appointment.paciente.nombres} {appointment.paciente.apellidos}</strong><p className="small">{appointment.paciente.tipoDocumento}: {appointment.paciente.numeroDocumento}</p><p className="small">{appointment.medico.nombres} {appointment.medico.apellidos} · {appointment.especialidad.nombre}</p></div>
        <div><span className="badge">{states[appointment.estado] ?? appointment.estado}</span>{appointment.llegadaEn ? <p className="small arrival-recorded">Llegada registrada: {time(appointment.llegadaEn)}</p> : listing.fecha === today() && appointment.modalidad === 'presencial' && ['programada', 'confirmada', 'reprogramada'].includes(appointment.estado) ? <button className="primary" disabled={saving} onClick={() => { setSelected(appointment); setNotice(''); setError('') }}>Registrar llegada</button> : <p className="small muted">No admite registro de llegada.</p>}</div>
      </article>)}</div>
      <nav className="daily-pagination" aria-label="Páginas de citas"><button className="secondary" disabled={page === 1 || saving} onClick={() => { setPage(page - 1); setLoading(true); setSelected(null) }}>Anterior</button><span>Página {page}</span><button className="secondary" disabled={!listing.hayMas || saving} onClick={() => { setPage(page + 1); setLoading(true); setSelected(null) }}>Siguiente</button></nav>
    </>}
    {selected && <section className="card arrival-confirmation" aria-labelledby="arrival-title"><h2 id="arrival-title">Confirmar llegada</h2><p>{selected.paciente.nombres} {selected.paciente.apellidos} · {selected.paciente.tipoDocumento}: {selected.paciente.numeroDocumento}</p><p>Cita #{selected.id} · {time(selected.inicio)} · {selected.medico.nombres} {selected.medico.apellidos}</p><p>Confirma que el paciente está presente en la clínica.</p><div className="daily-pagination"><button className="secondary" disabled={saving} onClick={() => setSelected(null)}>Cancelar</button><button className="primary" disabled={saving} onClick={() => void arrive()}>{saving ? 'Registrando llegada…' : 'Confirmar llegada'}</button></div></section>}
  </section>
}
