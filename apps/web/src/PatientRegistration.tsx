import { useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'

export type Patient = { id: number; nombres: string; apellidos: string; tipoDocumento: string; numeroDocumento: string }
const localToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function PatientRegistration({ session, initialDni, onSelected, onCancel, onExpired, onBusyChange }: { session: Session; initialDni: string; onSelected: (patient: Patient, created: boolean) => void; onCancel: () => void; onExpired: () => void; onBusyChange: (busy: boolean) => void }) {
  const [form, setForm] = useState({ tipoDocumento: 'DNI', numeroDocumento: initialDni, nombres: '', apellidos: '', fechaNacimiento: '', sexo: '', telefono: '', correo: '', direccion: '' })
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [error, setError] = useState('')
  const [duplicateId, setDuplicateId] = useState<number | null>(null)
  const [duplicate, setDuplicate] = useState<Patient | null>(null)
  function update(key: keyof typeof form, value: string) {
    setForm(current => ({ ...current, [key]: value, ...(key === 'tipoDocumento' ? { numeroDocumento: '' } : {}) }))
    setError(''); setDuplicateId(null); setDuplicate(null)
  }
  function setPending(value: boolean) { lock.current = value; setBusy(value); onBusyChange(value) }
  function fail(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 401) onExpired()
    else if (cause instanceof ApiError && cause.status === 403) setError('Tu cuenta no tiene permiso para registrar pacientes.')
    else if (cause instanceof ApiError && cause.status === 400) setError('Revisa los datos del formulario. No se registró el paciente.')
    else setError('No se pudo confirmar el resultado del registro. Verifica si el paciente se registró antes de volver a enviarlo; no se reintentará automáticamente.')
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current || duplicateId !== null) return
    const body = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]))
    if (!body.nombres || !body.apellidos || !/^\+?[0-9 ()-]{6,20}$/.test(body.telefono) || !body.fechaNacimiento || body.fechaNacimiento > localToday()) {
      setError('Ingresa nombres y apellidos, una fecha de nacimiento válida que no sea futura y un teléfono de 6 a 20 caracteres.'); return
    }
    setPending(true); setError('')
    try {
      const patient = await api<Patient>('/patients', { token: session.token, body })
      onSelected(patient, true)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError('Ya existe un paciente con ese documento. Revisa su identidad antes de seleccionarlo; no se modificaron sus datos.')
        const payload = cause.body
        if (payload && typeof payload === 'object' && 'patientId' in payload && typeof payload.patientId === 'number' && Number.isSafeInteger(payload.patientId) && payload.patientId > 0) setDuplicateId(payload.patientId)
      } else fail(cause)
    } finally { setPending(false) }
  }
  async function checkDuplicate() {
    if (lock.current || duplicateId === null) return
    setPending(true)
    try {
      const existing = await api<Patient>(`/patients/${duplicateId}`, { token: session.token })
      if (existing.tipoDocumento !== form.tipoDocumento || existing.numeroDocumento !== form.numeroDocumento.trim()) {
        setError('El documento no coincide. Vuelve a buscar al paciente.'); setDuplicateId(null); return
      }
      setDuplicate(existing)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      else setError('No se pudo consultar el paciente existente. Verifica tu acceso y vuelve a intentar.')
    } finally { setPending(false) }
  }
  return <section className="patient-registration" aria-labelledby="registration-title">
    <h3 id="registration-title">Registrar paciente</h3>
    <p className="small muted">Datos de identificación y contacto. Los campos obligatorios están indicados.</p>
    {error && <p role="alert" className="notice error">{error}</p>}
    <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy}>
        <label htmlFor="new-document-type">Tipo de documento (obligatorio)</label>
        <select id="new-document-type" value={form.tipoDocumento} onChange={e => update('tipoDocumento', e.target.value)}><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option><option value="PASAPORTE">Pasaporte</option></select>
        <label htmlFor="new-document">Número de documento (obligatorio)</label>
        <input id="new-document" required value={form.numeroDocumento} inputMode={form.tipoDocumento === 'DNI' ? 'numeric' : 'text'} pattern={form.tipoDocumento === 'DNI' ? '[0-9]{8}' : '[A-Za-z0-9]{1,15}'} minLength={form.tipoDocumento === 'DNI' ? 8 : 1} maxLength={form.tipoDocumento === 'DNI' ? 8 : 15} onChange={e => update('numeroDocumento', e.target.value)} aria-describedby="new-document-help" />
        <p id="new-document-help" className="small">{form.tipoDocumento === 'DNI' ? 'DNI: exactamente 8 dígitos, incluidos los ceros iniciales.' : 'Hasta 15 letras y números, sin espacios.'}</p>
        <label htmlFor="new-first-name">Nombres (obligatorio)</label><input id="new-first-name" autoComplete="given-name" required maxLength={100} value={form.nombres} onChange={e => update('nombres', e.target.value)} />
        <label htmlFor="new-last-name">Apellidos (obligatorio)</label><input id="new-last-name" autoComplete="family-name" required maxLength={100} value={form.apellidos} onChange={e => update('apellidos', e.target.value)} />
        <label htmlFor="new-birth-date">Fecha de nacimiento (obligatorio)</label><input id="new-birth-date" type="date" required max={localToday()} value={form.fechaNacimiento} onChange={e => update('fechaNacimiento', e.target.value)} />
        <label htmlFor="new-sex">Sexo (obligatorio)</label><select id="new-sex" required value={form.sexo} onChange={e => update('sexo', e.target.value)}><option value="">Seleccionar</option><option value="F">Femenino</option><option value="M">Masculino</option></select>
        <label htmlFor="new-phone">Teléfono (obligatorio)</label><input id="new-phone" type="tel" autoComplete="tel" required minLength={6} maxLength={20} value={form.telefono} onChange={e => update('telefono', e.target.value)} />
        <label htmlFor="new-email">Correo (obligatorio)</label><input id="new-email" type="email" autoComplete="email" required maxLength={120} value={form.correo} onChange={e => update('correo', e.target.value)} />
        <label htmlFor="new-address">Dirección (opcional)</label><input id="new-address" autoComplete="street-address" maxLength={200} value={form.direccion} onChange={e => update('direccion', e.target.value)} />
        <div className="registration-actions"><button type="button" className="secondary" onClick={onCancel}>Cancelar registro</button><button className="primary" disabled={duplicateId !== null}>{busy ? 'Procesando…' : 'Guardar paciente'}</button></div>
        {duplicateId !== null && !duplicate && <button type="button" className="secondary" onClick={checkDuplicate}>Consultar paciente existente</button>}
        {duplicate && <div className="patient-selected"><strong>{duplicate.nombres} {duplicate.apellidos}</strong><p>{duplicate.tipoDocumento} · {duplicate.numeroDocumento}</p><button type="button" className="secondary" onClick={() => onSelected(duplicate, false)}>Seleccionar paciente existente</button></div>}
      </fieldset>
    </form>
  </section>
}
