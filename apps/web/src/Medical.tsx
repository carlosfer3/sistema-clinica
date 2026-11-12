import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'
import { PatientHistory } from './PatientHistory'
import { ClinicalAnnulments } from './ClinicalAnnulments'

type Appointment = { citaId: number; inicio: string; paciente: { id: number; nombres: string; apellidos: string; tipoDocumento: string; numeroDocumento: string; edad: number }; especialidad: { nombre: string } }
type Queue = { fecha: string; pacientes: Appointment[]; hayMas: boolean }
type Diagnosis = { codigo: string; descripcion: string }
type VitalSigns = { temperaturaC: string; presionSistolica: number; presionDiastolica: number; frecuenciaCardiaca: number; frecuenciaRespiratoria: number; saturacionOxigeno: string; pesoKg: string | null; tallaCm: string | null; observaciones: string | null; registradoEn: string; autor: { nombres: string; apellidos: string } }
const medicationFields = [{ key: 'medicamento', label: 'Medicamento', max: 150 }, { key: 'dosis', label: 'Dosis', max: 100 }, { key: 'via', label: 'Vía', max: 80 }, { key: 'frecuencia', label: 'Frecuencia', max: 100 }, { key: 'duracion', label: 'Duración', max: 100 }, { key: 'indicaciones', label: 'Indicaciones adicionales (opcional)', max: 500 }] as const
type Medication = Record<typeof medicationFields[number]['key'], string>
const time = (value: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

export function Medical({ session, onExpired, onBusyChange }: { session: Session; onExpired: () => void; onBusyChange: (busy: boolean) => void }) {
  const [queue, setQueue] = useState<Queue | null>(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const lock = useRef(false)
  function reload() { setSelected(null); setQueue(null); setLoading(true); setError(''); setRevision(v => v + 1) }
  useEffect(() => {
    const controller = new AbortController()
    api<Queue>(`/agenda/medical-queue?pagina=${page}&limite=20`, { token: session.token, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setQueue(data) }).catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        else { setQueue(null); setError('No se pudieron cargar los pacientes. Comprueba tus permisos y actualiza la lista.') }
      }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [session.token, onExpired, page, revision])
  async function save(body: unknown) {
    if (lock.current) return
    lock.current = true; setSaving(true); onBusyChange(true); setError(''); setNotice('')
    try {
      const result = await api<{ id: number }>('/consultations', { token: session.token, body })
      reload(); setPage(1); setNotice(`Consulta #${result.id} registrada. La cita está atendida.`)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      else if (cause instanceof ApiError && cause.status === 400) setError('Revisa los datos y los códigos CIE-10. No se guardó la consulta.')
      else { setSelected(null); setQueue(null); setError(cause instanceof ApiError && [403, 404, 409].includes(cause.status) ? 'La cita ya no está disponible o perdiste el permiso. Actualiza la lista.' : 'No se pudo confirmar el resultado. Actualiza la lista antes de volver a atender; no se reintentará automáticamente.') }
    } finally { lock.current = false; setSaving(false); onBusyChange(false) }
  }
  return <section aria-labelledby="medical-title">
    <div className="page-heading"><p className="eyebrow">Área médica</p><h1 id="medical-title">Atención médica</h1><p>{queue?.fecha} · Pacientes preparados para tu consulta. Horario de Lima.</p></div>
    {error && <p className="notice error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    {selected ? <ConsultationForm key={selected.citaId} appointment={selected} session={session} saving={saving} onSave={save} onCancel={reload} onExpired={onExpired} /> : <>
      <ClinicalAnnulments session={session} onExpired={onExpired} onBusyChange={onBusyChange} />
      <h2>Pacientes preparados</h2>
      <button className="secondary" disabled={loading} onClick={reload}>Actualizar pacientes</button>
      {loading ? <p role="status">Cargando pacientes…</p> : queue && <>
        {!queue.pacientes.length && <p className="empty">No hay pacientes preparados en esta página.</p>}
        <div className="daily-list">{queue.pacientes.map(a => <article className="card daily-row" key={a.citaId}><div><strong>{time(a.inicio)}</strong><p>Cita #{a.citaId}</p></div><div><strong>{a.paciente.nombres} {a.paciente.apellidos}</strong><p>{a.paciente.tipoDocumento}: {a.paciente.numeroDocumento} · {a.paciente.edad} años</p><p>{a.especialidad.nombre}</p></div><button className="primary" onClick={() => { setSelected(a); setError(''); setNotice('') }}>Atender paciente</button></article>)}</div>
        <nav className="daily-pagination" aria-label="Páginas de atención médica"><button className="secondary" disabled={page === 1} onClick={() => { setLoading(true); setQueue(null); setPage(page - 1) }}>Anterior</button><span>Página {page}</span><button className="secondary" disabled={!queue.hayMas} onClick={() => { setLoading(true); setQueue(null); setPage(page + 1) }}>Siguiente</button></nav>
      </>}
    </>}
  </section>
}

function ConsultationForm({ appointment, session, saving, onSave, onCancel, onExpired }: { appointment: Appointment; session: Session; saving: boolean; onSave: (body: unknown) => Promise<void>; onCancel: () => void; onExpired: () => void }) {
  const [vitals, setVitals] = useState<VitalSigns | null>(null)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [catalog, setCatalog] = useState<Diagnosis[]>([])
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([])
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [indicaciones, setIndicaciones] = useState('')
  const [medications, setMedications] = useState<Medication[]>([])
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    api<VitalSigns>(`/agenda/appointments/${appointment.citaId}/vital-signs`, { token: session.token, signal: controller.signal }).then(data => { if (!controller.signal.aborted) setVitals(data) }).catch(cause => {
      if (controller.signal.aborted) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      else setLoadError('No se pudo consultar la evaluación previa. Vuelve a la bandeja y actualiza.')
    })
    return () => controller.abort()
  }, [appointment.citaId, session.token, onExpired])
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setSearching(true); setSearchError(''); setCatalog([])
      const search = query.trim()
      const path = search ? `/consultations/diagnoses?q=${encodeURIComponent(search)}` : '/consultations/diagnoses'
      api<Diagnosis[]>(path, { token: session.token, signal: controller.signal }).then(data => { if (!controller.signal.aborted) setCatalog(data) }).catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        else setSearchError('No se pudo consultar CIE-10. Modifica la búsqueda para reintentar.')
      }).finally(() => { if (!controller.signal.aborted) setSearching(false) })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, session.token, onExpired])
  function submit(event: SubmitEvent<HTMLFormElement>) { event.preventDefault(); if (!saving && vitals && diagnoses.length) setConfirming(true) }
  return <section className="card"><h2>Registrar consulta</h2><div className="patient-selected"><strong>{appointment.paciente.nombres} {appointment.paciente.apellidos}</strong><p>{appointment.paciente.tipoDocumento}: {appointment.paciente.numeroDocumento} · {appointment.paciente.edad} años · Cita #{appointment.citaId}</p></div>
    <PatientHistory key={appointment.paciente.id} patientId={appointment.paciente.id} session={session} onExpired={onExpired} />
    <h3>Evaluación de enfermería</h3>
    {loadError ? <p role="alert" className="notice error">{loadError}</p> : !vitals ? <p role="status">Cargando evaluación…</p> : <><dl className="vital-grid">{[['Temperatura', `${vitals.temperaturaC} °C`], ['Presión arterial', `${vitals.presionSistolica}/${vitals.presionDiastolica} mmHg`], ['Frecuencia cardíaca', `${vitals.frecuenciaCardiaca} latidos/min`], ['Frecuencia respiratoria', `${vitals.frecuenciaRespiratoria} respiraciones/min`], ['Saturación', `${vitals.saturacionOxigeno} %`], ['Peso', vitals.pesoKg ? `${vitals.pesoKg} kg` : 'Sin registro'], ['Talla', vitals.tallaCm ? `${vitals.tallaCm} cm` : 'Sin registro']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>Observaciones: {vitals.observaciones || 'Sin observaciones'}</p><p className="small">Registrado por {vitals.autor.nombres} {vitals.autor.apellidos}{vitals.registradoEn && ` ? ${new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }).format(new Date(vitals.registradoEn))}`}</p></>}
    <form onSubmit={submit} aria-busy={saving}><fieldset disabled={saving || !vitals || confirming}>
      <label htmlFor="medical-reason">Motivo de consulta</label><textarea id="medical-reason" required maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} />
      <h3>Diagnósticos CIE-10</h3><p className="small">El primero es principal; los demás son secundarios. Máximo 20.</p>
      <label htmlFor="diagnosis-search">Buscar código o descripción</label><input id="diagnosis-search" maxLength={100} value={query} onChange={e => { setQuery(e.target.value); setCatalog([]) }} />
      {searchError && <p role="alert">{searchError}</p>}{searching ? <p role="status">Buscando diagnósticos…</p> : <div className="diagnosis-results">{catalog.map(d => <button type="button" className="secondary" key={d.codigo} disabled={diagnoses.length >= 20 || diagnoses.some(v => v.codigo === d.codigo)} onClick={() => setDiagnoses(v => [...v, d])}>Agregar {d.codigo} · {d.descripcion}</button>)}{!catalog.length && !searchError && <p>Sin coincidencias en el catálogo cargado.</p>}</div>}
      <ol>{diagnoses.map((d, index) => <li key={d.codigo}>{index === 0 ? 'Principal' : 'Secundario'}: {d.codigo} · {d.descripcion} <button type="button" className="secondary" onClick={() => setDiagnoses(v => v.filter(item => item.codigo !== d.codigo))}>Quitar {d.codigo}</button></li>)}</ol>
      <label htmlFor="medical-instructions">Indicaciones generales</label><textarea id="medical-instructions" required maxLength={5000} rows={4} value={indicaciones} onChange={e => setIndicaciones(e.target.value)} />
      <h3>Receta manual (opcional)</h3><p>Puedes finalizar sin medicamentos. Máximo 30 medicamentos.</p>
      {medications.map((item, index) => <section className="patient-selected" key={index}><h4>Medicamento {index + 1}</h4><div className="vital-grid">{medicationFields.map(f => <div key={f.key}><label htmlFor={`med-${index}-${f.key}`}>{f.label}</label><input id={`med-${index}-${f.key}`} required={f.key !== 'indicaciones'} maxLength={f.max} value={item[f.key]} onChange={e => setMedications(v => v.map((m, i) => i === index ? { ...m, [f.key]: e.target.value } : m))} /></div>)}</div><button type="button" className="secondary" onClick={() => setMedications(v => v.filter((_, i) => i !== index))}>Quitar medicamento {index + 1}</button></section>)}
      <button type="button" className="secondary" disabled={medications.length >= 30} onClick={() => setMedications(v => [...v, { medicamento: '', dosis: '', via: '', frecuencia: '', duracion: '', indicaciones: '' }])}>Agregar medicamento</button>
      <div className="daily-pagination"><button type="button" className="secondary" onClick={onCancel}>Volver a pacientes</button><button className="primary" disabled={!motivo.trim() || !indicaciones.trim() || !diagnoses.length || medications.some(m => medicationFields.some(f => f.key !== 'indicaciones' && !m[f.key].trim()))}>Revisar consulta</button></div>
    </fieldset></form>
    {!vitals && <button className="secondary" onClick={onCancel}>Volver a pacientes</button>}
    {confirming && <section className="notice" aria-label="Confirmar atención"><h3>Confirmar atención</h3><p>{appointment.paciente.nombres} {appointment.paciente.apellidos} · Cita #{appointment.citaId}</p><p>Motivo: {motivo}</p><p>Diagnósticos: {diagnoses.map(d => d.codigo).join(', ')}</p><p>Indicaciones: {indicaciones}</p>{medications.length ? medications.map((m, i) => <p key={i}>{m.medicamento} · {m.dosis} · {m.via} · {m.frecuencia} · {m.duracion} · {m.indicaciones}</p>) : <p>Sin receta.</p>}<p>Al confirmar se guardará el registro definitivo y la cita pasará a atendida.</p><button className="secondary" disabled={saving} onClick={() => setConfirming(false)}>Seguir editando</button><button className="primary" disabled={saving} onClick={async () => { await onSave({ citaId: appointment.citaId, motivo: motivo.trim(), indicaciones: indicaciones.trim(), diagnosticos: diagnoses.map(d => ({ codigo: d.codigo })), receta: medications }); setConfirming(false) }}>{saving ? 'Guardando consulta…' : 'Confirmar y guardar consulta'}</button></section>}
  </section>
}
