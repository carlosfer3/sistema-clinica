import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'

type Pending = {
  citaId: number; paciente: { id: number; nombres: string; apellidos: string; tipoDocumento: string; numeroDocumento: string; edad: number };
  inicio: string; llegadaEn: string; medico: { id: number; nombres: string; apellidos: string }; especialidad: { id: number; nombre: string }; estadoPreparacion: 'pendiente';
}
type Queue = { fecha: string; hayMas: boolean; pacientes: Pending[] }
const time = (value: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
const fields = [
  { name: 'temperaturaC', label: 'Temperatura (°C)', min: 0.1, max: 100, step: 0.1, required: true },
  { name: 'presionSistolica', label: 'Presión sistólica (mmHg)', min: 1, max: 1000, step: 1, required: true },
  { name: 'presionDiastolica', label: 'Presión diastólica (mmHg)', min: 1, max: 1000, step: 1, required: true },
  { name: 'frecuenciaCardiaca', label: 'Frecuencia cardíaca (latidos/min)', min: 1, max: 1000, step: 1, required: true },
  { name: 'frecuenciaRespiratoria', label: 'Frecuencia respiratoria (respiraciones/min)', min: 1, max: 1000, step: 1, required: true },
  { name: 'saturacionOxigeno', label: 'Saturación de oxígeno (%)', min: 0, max: 100, step: 0.1, required: true },
  { name: 'pesoKg', label: 'Peso (kg, opcional)', min: 0.01, max: 2000, step: 0.01, required: false },
  { name: 'tallaCm', label: 'Talla (cm, opcional)', min: 0.1, max: 400, step: 0.1, required: false },
]

export function Nursing({ session, onExpired, onBusyChange }: { session: Session; onExpired: () => void; onBusyChange: (busy: boolean) => void }) {
  const [queue, setQueue] = useState<Queue | null>(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<Pending | null>(null)
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer) }, [])
  const lock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    api<Queue>(`/agenda/nursing-queue?${new URLSearchParams({ pagina: String(page), limite: '20' })}`, { token: session.token, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setQueue(data); setError('') } })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        else { setQueue(null); setError(cause instanceof ApiError && cause.status === 403 ? 'Tu cuenta perdió el permiso para consultar pacientes pendientes.' : 'No se pudieron cargar los pacientes pendientes. Actualiza la lista para intentar nuevamente.') }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [session.token, onExpired, revision, page])
  function reload() { setSelected(null); setError(''); setLoading(true); setRevision(value => value + 1) }
  async function save(values: Record<string, number | string>) {
    if (!selected || lock.current) return
    lock.current = true; setSaving(true); onBusyChange(true); setError(''); setNotice('')
    try {
      await api(`/agenda/appointments/${selected.citaId}/vital-signs`, { token: session.token, body: values })
      if (!mounted.current) return
      const name = `${selected.paciente.nombres} ${selected.paciente.apellidos}`
      setPage(1); reload(); setNotice(`Evaluación registrada para ${name}. La preparación está completada y el médico puede consultar los signos vitales.`)
    } catch (cause) {
      if (!mounted.current) return
      if (cause instanceof ApiError && cause.status === 401) { onExpired(); return }
      if (cause instanceof ApiError && [404, 409].includes(cause.status)) { reload(); setNotice('La cita ya no está pendiente de evaluación. Actualizamos la lista; no se sobrescribió ningún registro.') }
      else if (cause instanceof ApiError && cause.status === 400) setError('Revisa las mediciones y confirma que la cita corresponde a hoy. No se guardó la evaluación.')
      else if (cause instanceof ApiError && cause.status === 403) { setSelected(null); setQueue(null); setError('Tu cuenta no tiene permiso para registrar signos vitales.') }
      else { setSelected(null); setQueue(null); setError('No se pudo confirmar el resultado. Actualiza la lista para comprobar si se completó la preparación antes de volver a registrar. No se reintentará automáticamente.') }
    } finally {
      lock.current = false
      if (mounted.current) { setSaving(false); onBusyChange(false) }
    }
  }
  return <section className="nursing" aria-labelledby="nursing-title">
    <div className="page-heading"><p className="eyebrow">Área de enfermería</p><h1 id="nursing-title">Evaluación previa</h1><p>{queue?.fecha ? `${queue.fecha} · ` : ''}Pacientes con llegada registrada y pendientes de preparación. Horario de Lima.</p></div>
    {notice && <p role="status" className="notice">{notice}</p>}
    {error && !selected && <p role="alert" className="notice error">{error}</p>}
    {selected && <VitalSignsForm key={selected.citaId} appointment={selected} saving={saving} error={error} onSave={save} onCancel={() => { setSelected(null); setError('') }} />}
    <>
      <button className="secondary" disabled={saving || loading} onClick={reload}>Actualizar pendientes</button>
      {loading ? <p role="status">Cargando pacientes pendientes…</p> : queue && <>
        {queue.pacientes.length === 0 && <p className="empty">No hay pacientes pendientes de evaluación en esta página.</p>}
        <div className="daily-table-wrap"><table className="daily-table"><thead><tr><th>Llegada</th><th>Espera</th><th>Paciente</th><th>DNI</th><th>Especialidad</th><th>Médico</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{queue.pacientes.map(appointment => <tr key={appointment.citaId}>
          <td data-label="Llegada">{time(appointment.llegadaEn)}</td>
          <td data-label="Espera">{Math.max(0, Math.floor((now - new Date(appointment.llegadaEn).getTime()) / 60000))} min</td>
          <td data-label="Paciente"><strong>{appointment.paciente.nombres} {appointment.paciente.apellidos}</strong></td>
          <td data-label="DNI">{appointment.paciente.numeroDocumento}</td>
          <td data-label="Especialidad">{appointment.especialidad.nombre}</td>
          <td data-label="Médico">{appointment.medico.nombres} {appointment.medico.apellidos}</td>
          <td data-label="Acciones"><button className="primary" onClick={() => { setSelected(appointment); setError(''); setNotice('') }}>Evaluar</button></td>
        </tr>)}</tbody></table></div>
        <nav className="daily-pagination" aria-label="Páginas de pacientes pendientes"><button className="secondary" disabled={page === 1} onClick={() => { setLoading(true); setPage(page - 1) }}>Anterior</button><span>Página {page}</span><button className="secondary" disabled={!queue.hayMas} onClick={() => { setLoading(true); setPage(page + 1) }}>Siguiente</button></nav>
      </>}
    </>
  </section>
}

function VitalSignsForm({ appointment, saving, error, onSave, onCancel }: { appointment: Pending; saving: boolean; error: string; onSave: (values: Record<string, number | string>) => Promise<void>; onCancel: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const title = useRef<HTMLHeadingElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal(); title.current?.focus() }, [])
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const data: Record<string, number | string> = {}
    for (const field of fields) if (values[field.name]?.trim()) data[field.name] = Number(values[field.name])
    if (values.observaciones?.trim()) data.observaciones = values.observaciones.trim()
    void onSave(data)
  }
  return <dialog ref={dialog} className="card modal nursing-modal" aria-labelledby="vital-title" onCancel={event => { event.preventDefault(); if (!saving) onCancel() }}>
    <div className="nursing-modal-header">
      <h2 id="vital-title" tabIndex={-1} ref={title}>Registrar signos vitales</h2>
      <button type="button" className="nursing-modal-close" aria-label="Cerrar evaluación" disabled={saving} onClick={onCancel}>×</button>
    </div>
    <div className="nursing-modal-body">
    <div className="reschedule-details"><div><p className="eyebrow">Paciente</p><strong>{appointment.paciente.nombres} {appointment.paciente.apellidos}</strong><p>{appointment.paciente.tipoDocumento}: {appointment.paciente.numeroDocumento} · {appointment.paciente.edad} años</p></div><div><p className="eyebrow">Consulta</p><strong>Cita #{appointment.citaId} · {time(appointment.inicio)}</strong><p>{appointment.especialidad.nombre}</p><p>{appointment.medico.nombres} {appointment.medico.apellidos}</p></div></div>
    <p className="small muted">Confirma la identidad del paciente e ingresa las mediciones tomadas antes de la consulta.</p>
    <form onSubmit={submit} aria-busy={saving}>
      {error && <p role="alert" className="notice error">{error}</p>}
      <fieldset disabled={saving}><div className="vital-grid">{fields.map(field => <div key={field.name}><label htmlFor={`vital-${field.name}`}>{field.label}</label><input id={`vital-${field.name}`} type="number" min={field.min} max={field.max} step={field.step} required={field.required} value={values[field.name] ?? ''} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} /></div>)}</div>
      <label htmlFor="vital-observations">Observaciones de enfermería (opcional)</label><textarea id="vital-observations" maxLength={1000} rows={3} value={values.observaciones ?? ''} onChange={event => setValues(current => ({ ...current, observaciones: event.target.value }))} />
      <div className="daily-pagination"><button type="button" className="secondary" onClick={onCancel}>Volver a pendientes</button><button type="submit" className="primary">{saving ? 'Guardando evaluación…' : 'Guardar evaluación'}</button></div></fieldset>
    </form>
    </div>
  </dialog>
}
