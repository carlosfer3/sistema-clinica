import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'
import { PatientHistory } from './PatientHistory'
import { ClinicalAnnulments } from './ClinicalAnnulments'
import './MedicalConfirmation.css'
import './Medical.css'

type Appointment = {
  citaId: number
  inicio: string
  paciente: {
    id: number
    nombres: string
    apellidos: string
    tipoDocumento: string
    numeroDocumento: string
    edad: number
  }
  especialidad: { nombre: string }
}
type Queue = { fecha: string; pacientes: Appointment[]; hayMas: boolean }
type Diagnosis = { codigo: string; descripcion: string }
type VitalSigns = {
  temperaturaC: string
  presionSistolica: number
  presionDiastolica: number
  frecuenciaCardiaca: number
  frecuenciaRespiratoria: number
  saturacionOxigeno: string
  pesoKg: string | null
  tallaCm: string | null
  observaciones: string | null
  registradoEn: string
  autor: { nombres: string; apellidos: string }
}
const medicationFields = [
  { key: 'medicamento', label: 'Medicamento', max: 150 },
  { key: 'dosis', label: 'Dosis', max: 100 },
  { key: 'via', label: 'Vía', max: 80 },
  { key: 'frecuencia', label: 'Frecuencia', max: 100 },
  { key: 'duracion', label: 'Duración', max: 100 },
  {
    key: 'indicaciones',
    label: 'Indicaciones adicionales (opcional)',
    max: 500,
  },
] as const
type Medication = Record<(typeof medicationFields)[number]['key'], string>
const time = (value: string) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

export function Medical({
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
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [otherBusy, setOtherBusy] = useState(false)
  const [view, setView] = useState<'patients' | 'consultations'>('patients')
  const lock = useRef(false)
  function reload() {
    setSelected(null)
    setQueue(null)
    setLoading(true)
    setError('')
    setRevision((v) => v + 1)
  }
  useEffect(() => {
    const controller = new AbortController()
    api<Queue>(`/agenda/medical-queue?pagina=${page}&limite=20`, {
      token: session.token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setQueue(data)
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        else {
          setQueue(null)
          setError(
            'No se pudieron cargar los pacientes. Comprueba tus permisos y actualiza la lista.',
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [session.token, onExpired, page, revision])
  async function save(body: unknown) {
    if (lock.current) return false
    lock.current = true
    setSaving(true)
    onBusyChange(true)
    setError('')
    setNotice('')
    try {
      const result = await api<{ id: number }>('/consultations', {
        token: session.token,
        body,
      })
      setNotice(`Consulta #${result.id} registrada. La cita está atendida.`)
      return true
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      else if (cause instanceof ApiError && cause.status === 400)
        setError(
          'Revisa los datos y los códigos CIE-10. No se guardó la consulta.',
        )
      else {
        setSelected(null)
        setQueue(null)
        setError(
          cause instanceof ApiError && [403, 404, 409].includes(cause.status)
            ? 'La cita ya no está disponible o perdiste el permiso. Actualiza la lista.'
            : 'No se pudo confirmar el resultado. Actualiza la lista antes de volver a atender; no se reintentará automáticamente.',
        )
      }
    } finally {
      lock.current = false
      setSaving(false)
      onBusyChange(false)
    }
    return false
  }
  return (
    <section className="medical-station" aria-labelledby="medical-title">
      <aside className="medical-sidebar">
        <div className="medical-sidebar-brand">
          <img src="/clinic-logo.png" alt="" />
          <div>
            San Rafael<small>ESTACIÓN MÉDICA</small>
          </div>
        </div>
        <nav aria-label="Opciones del médico">
          <button
            aria-current={selected ? 'page' : undefined}
            disabled={!selected}
            onClick={() =>
              document.getElementById('medical-workspace')?.scrollIntoView()
            }
          >
            <span aria-hidden="true">✚</span>Atención en curso
          </button>
          <button
            aria-current={!selected && view === 'patients' ? 'page' : undefined}
            disabled={Boolean(selected) || saving || otherBusy}
            onClick={() => setView('patients')}
          >
            <span aria-hidden="true">▦</span>Pacientes preparados
          </button>
          <button
            aria-current={
              !selected && view === 'consultations' ? 'page' : undefined
            }
            disabled={Boolean(selected) || saving || otherBusy}
            onClick={() => setView('consultations')}
          >
            <span aria-hidden="true">≡</span>Consultas registradas
          </button>
        </nav>
        <div className="medical-sidebar-note">
          <strong>Atención e historia clínica</strong>
          <p>
            Revisa la evaluación de enfermería y los antecedentes antes de
            registrar la consulta.
          </p>
          <small>SIGES SR · Portal médico</small>
        </div>
      </aside>
      <div className="page-heading">
        <p className="eyebrow">Área médica</p>
        <h1 id="medical-title">Atención médica</h1>
        <p>
          {queue?.fecha} · Pacientes preparados para tu consulta. Horario de
          Lima.
        </p>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {selected ? (
        <ConsultationForm
          key={selected.citaId}
          appointment={selected}
          session={session}
          saving={saving}
          onSave={save}
          onCancel={reload}
          onExpired={onExpired}
        />
      ) : (
        <>
          {view === 'consultations' ? (
            <div className="medical-panel">
              <ClinicalAnnulments
                session={session}
                onExpired={onExpired}
                onBusyChange={(value) => {
                  setOtherBusy(value)
                  onBusyChange(value)
                }}
              />
            </div>
          ) : (
            <div className="medical-panel">
              <h2>Pacientes preparados</h2>
              <button className="secondary" disabled={loading} onClick={reload}>
                Actualizar pacientes
              </button>
              {loading ? (
                <p role="status">Cargando pacientes…</p>
              ) : (
                queue && (
                  <>
                    {!queue.pacientes.length && (
                      <p className="empty">
                        No hay pacientes preparados en esta página.
                      </p>
                    )}
                    <div className="medical-ready-grid">
                      {queue.pacientes.map((a) => (
                        <article className="medical-ready-card" key={a.citaId} aria-label={`Paciente preparado: ${a.paciente.nombres} ${a.paciente.apellidos}`}>
                          <div className="medical-ready-meta">
                            <time dateTime={a.inicio}>{time(a.inicio)}</time>
                            <span>Cita #{a.citaId}</span>
                          </div>
                          <div className="medical-ready-identity">
                            <span className="medical-ready-avatar" aria-hidden="true">{a.paciente.nombres.charAt(0)}{a.paciente.apellidos.charAt(0)}</span>
                            <div><h3>
                              {a.paciente.nombres} {a.paciente.apellidos}
                            </h3>
                            <p>
                              {a.paciente.tipoDocumento}:{' '}
                              {a.paciente.numeroDocumento} · {a.paciente.edad}{' '}
                              años
                            </p>
                            </div>
                          </div>
                          <p className="medical-ready-specialty">{a.especialidad.nombre}</p>
                          <button
                            className="primary"
                            onClick={() => {
                              setSelected(a)
                              setError('')
                              setNotice('')
                            }}
                          >
                            Atender paciente
                          </button>
                        </article>
                      ))}
                    </div>
                    <nav
                      className="daily-pagination"
                      aria-label="Páginas de atención médica"
                    >
                      <button
                        className="secondary"
                        disabled={page === 1}
                        onClick={() => {
                          setLoading(true)
                          setQueue(null)
                          setPage(page - 1)
                        }}
                      >
                        Anterior
                      </button>
                      <span>Página {page}</span>
                      <button
                        className="secondary"
                        disabled={!queue.hayMas}
                        onClick={() => {
                          setLoading(true)
                          setQueue(null)
                          setPage(page + 1)
                        }}
                      >
                        Siguiente
                      </button>
                    </nav>
                  </>
                )
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function ConsultationForm({
  appointment,
  session,
  saving,
  onSave,
  onCancel,
  onExpired,
}: {
  appointment: Appointment
  session: Session
  saving: boolean
  onSave: (body: unknown) => Promise<boolean>
  onCancel: () => void
  onExpired: () => void
}) {
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
  const [saved, setSaved] = useState(false)
  const confirmationDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (confirming) confirmationDialog.current?.showModal()
  }, [confirming])
  useEffect(() => {
    const controller = new AbortController()
    api<VitalSigns>(`/agenda/appointments/${appointment.citaId}/vital-signs`, {
      token: session.token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setVitals(data)
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        else
          setLoadError(
            'No se pudo consultar la evaluación previa. Vuelve a la bandeja y actualiza.',
          )
      })
    return () => controller.abort()
  }, [appointment.citaId, session.token, onExpired])
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setSearching(true)
      setSearchError('')
      setCatalog([])
      const search = query.trim()
      const path = search
        ? `/consultations/diagnoses?q=${encodeURIComponent(search)}`
        : '/consultations/diagnoses'
      api<Diagnosis[]>(path, {
        token: session.token,
        signal: controller.signal,
      })
        .then((data) => {
          if (!controller.signal.aborted) setCatalog(data)
        })
        .catch((cause) => {
          if (controller.signal.aborted) return
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else
            setSearchError(
              'No se pudo consultar CIE-10. Modifica la búsqueda para reintentar.',
            )
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false)
        })
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, session.token, onExpired])
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!saving && vitals && diagnoses.length) setConfirming(true)
  }
  return (
    <section className="medical-consultation" id="medical-workspace">
      <header className="medical-patient-banner">
        <span className="medical-patient-avatar" aria-hidden="true">
          {appointment.paciente.nombres.charAt(0)}
          {appointment.paciente.apellidos.charAt(0)}
        </span>
        <div>
          <p className="eyebrow">Paciente en consulta</p>
          <h2>
            {appointment.paciente.nombres} {appointment.paciente.apellidos}
          </h2>
          <p>
            {appointment.paciente.tipoDocumento}:{' '}
            {appointment.paciente.numeroDocumento} · {appointment.paciente.edad}{' '}
            años · Cita #{appointment.citaId}
          </p>
          <span>
            {appointment.especialidad.nombre} · Turno {time(appointment.inicio)}
          </span>
        </div>
        <span className="medical-session-tag">
          {saved ? 'Atendida' : 'Registro de consulta'}
        </span>
      </header>
      <div className="medical-consultation-grid">
        <aside className="medical-clinical-context">
          <section className="medical-panel medical-vitals">
            <h3>Evaluación de enfermería</h3>
            {loadError ? (
              <p role="alert" className="notice error">
                {loadError}
              </p>
            ) : !vitals ? (
              <p role="status">Cargando evaluación…</p>
            ) : (
              <>
                <dl className="vital-grid">
                  {[
                    ['Temperatura', `${vitals.temperaturaC} °C`],
                    [
                      'Presión arterial',
                      `${vitals.presionSistolica}/${vitals.presionDiastolica} mmHg`,
                    ],
                    [
                      'Frecuencia cardíaca',
                      `${vitals.frecuenciaCardiaca} latidos/min`,
                    ],
                    [
                      'Frecuencia respiratoria',
                      `${vitals.frecuenciaRespiratoria} respiraciones/min`,
                    ],
                    ['Saturación', `${vitals.saturacionOxigeno} %`],
                    [
                      'Peso',
                      vitals.pesoKg ? `${vitals.pesoKg} kg` : 'Sin registro',
                    ],
                    [
                      'Talla',
                      vitals.tallaCm ? `${vitals.tallaCm} cm` : 'Sin registro',
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <p>
                  Observaciones: {vitals.observaciones || 'Sin observaciones'}
                </p>
                <p className="small">
                  Registrado por {vitals.autor.nombres} {vitals.autor.apellidos}
                  {vitals.registradoEn &&
                    ` · ${new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }).format(new Date(vitals.registradoEn))}`}
                </p>
              </>
            )}
          </section>
          <div className="medical-panel medical-history">
            <PatientHistory
              key={appointment.paciente.id}
              patientId={appointment.paciente.id}
              session={session}
              onExpired={onExpired}
            />
          </div>
        </aside>
        <section className="medical-panel medical-entry">
          <div className="medical-entry-heading">
            <p className="eyebrow">Registro clínico</p>
            <h2>Registrar consulta</h2>
            <p>Completa el motivo, los diagnósticos y el plan de atención.</p>
          </div>
          <form onSubmit={submit} aria-busy={saving}>
            <fieldset disabled={saving || !vitals || confirming}>
              <label htmlFor="medical-reason">Motivo de consulta</label>
              <textarea
                id="medical-reason"
                required
                maxLength={300}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
              <h3>Diagnósticos CIE-10</h3>
              <p className="small">
                El primero es principal; los demás son secundarios. Máximo 20.
              </p>
              <label htmlFor="diagnosis-search">
                Buscar código o descripción
              </label>
              <input
                id="diagnosis-search"
                maxLength={100}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setCatalog([])
                }}
              />
              {searchError && <p role="alert">{searchError}</p>}
              {searching ? (
                <p role="status">Buscando diagnósticos…</p>
              ) : (
                <div className="diagnosis-results">
                  {catalog.map((d) => (
                    <button
                      type="button"
                      className="secondary"
                      key={d.codigo}
                      disabled={
                        diagnoses.length >= 20 ||
                        diagnoses.some((v) => v.codigo === d.codigo)
                      }
                      onClick={() => setDiagnoses((v) => [...v, d])}
                    >
                      Agregar {d.codigo} · {d.descripcion}
                    </button>
                  ))}
                  {!catalog.length && !searchError && (
                    <p>Sin coincidencias en el catálogo cargado.</p>
                  )}
                </div>
              )}
              <ol>
                {diagnoses.map((d, index) => (
                  <li key={d.codigo}>
                    {index === 0 ? 'Principal' : 'Secundario'}: {d.codigo} ·{' '}
                    {d.descripcion}{' '}
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setDiagnoses((v) =>
                          v.filter((item) => item.codigo !== d.codigo),
                        )
                      }
                    >
                      Quitar {d.codigo}
                    </button>
                  </li>
                ))}
              </ol>
              <label htmlFor="medical-instructions">
                Indicaciones generales
              </label>
              <textarea
                id="medical-instructions"
                required
                maxLength={5000}
                rows={4}
                value={indicaciones}
                onChange={(e) => setIndicaciones(e.target.value)}
              />
              <h3>Receta manual (opcional)</h3>
              <p>Puedes finalizar sin medicamentos. Máximo 30 medicamentos.</p>
              {medications.map((item, index) => (
                <section className="patient-selected" key={index}>
                  <h4>Medicamento {index + 1}</h4>
                  <div className="vital-grid">
                    {medicationFields.map((f) => (
                      <div key={f.key}>
                        <label htmlFor={`med-${index}-${f.key}`}>
                          {f.label}
                        </label>
                        <input
                          id={`med-${index}-${f.key}`}
                          required={f.key !== 'indicaciones'}
                          maxLength={f.max}
                          value={item[f.key]}
                          onChange={(e) =>
                            setMedications((v) =>
                              v.map((m, i) =>
                                i === index
                                  ? { ...m, [f.key]: e.target.value }
                                  : m,
                              ),
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setMedications((v) => v.filter((_, i) => i !== index))
                    }
                  >
                    Quitar medicamento {index + 1}
                  </button>
                </section>
              ))}
              <button
                type="button"
                className="secondary"
                disabled={medications.length >= 30}
                onClick={() =>
                  setMedications((v) => [
                    ...v,
                    {
                      medicamento: '',
                      dosis: '',
                      via: '',
                      frecuencia: '',
                      duracion: '',
                      indicaciones: '',
                    },
                  ])
                }
              >
                Agregar medicamento
              </button>
              <div className="daily-pagination">
                <button type="button" className="secondary" onClick={onCancel}>
                  Volver a pacientes
                </button>
                <button
                  className="primary"
                  disabled={
                    !motivo.trim() ||
                    !indicaciones.trim() ||
                    !diagnoses.length ||
                    medications.some((m) =>
                      medicationFields.some(
                        (f) => f.key !== 'indicaciones' && !m[f.key].trim(),
                      ),
                    )
                  }
                >
                  Revisar consulta
                </button>
              </div>
            </fieldset>
          </form>
          {!vitals && (
            <button className="secondary" onClick={onCancel}>
              Volver a pacientes
            </button>
          )}
        </section>
      </div>
      {confirming && (
        <dialog
          ref={confirmationDialog}
          className="medical-confirmation"
          aria-labelledby="medical-confirm-title"
          onCancel={(event) => {
            event.preventDefault()
            if (!saving) {
              if (saved) onCancel()
              else setConfirming(false)
            }
          }}
        >
          <header className="medical-confirm-top">
            <span className="medical-confirm-icon" aria-hidden="true">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5M9 14l2 2 4-4" />
              </svg>
            </span>
            <h2 id="medical-confirm-title">Confirmar atención</h2>
            <span className={`medical-confirm-tag${saved ? ' done' : ''}`}>
              {saved ? 'Atendida' : 'En edición'}
            </span>
          </header>
          <div className="medical-confirm-patient">
            <span className="medical-confirm-avatar" aria-hidden="true">
              {appointment.paciente.nombres.charAt(0)}
              {appointment.paciente.apellidos.charAt(0)}
            </span>
            <div>
              <strong>
                {appointment.paciente.nombres} {appointment.paciente.apellidos}
              </strong>
              <span>Cita #{appointment.citaId}</span>
            </div>
          </div>
          <dl
            className="medical-confirm-record"
            aria-label="Resumen de la consulta"
          >
            <div>
              <dt>Motivo</dt>
              <dd>{motivo}</dd>
            </div>
            <div>
              <dt>Diagnósticos</dt>
              <dd className="medical-confirm-diagnoses">
                {diagnoses.map((d, index) => (
                  <span className="medical-confirm-chip" key={d.codigo}>
                    <strong>{d.codigo}</strong> {d.descripcion}
                    <small>{index === 0 ? 'Principal' : 'Secundario'}</small>
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt>Indicaciones</dt>
              <dd>{indicaciones}</dd>
            </div>
            <div>
              <dt>Receta</dt>
              <dd>
                {medications.length ? (
                  <ul className="medical-confirm-prescription">
                    {medications.map((m, index) => (
                      <li key={index}>
                        <strong>{m.medicamento}</strong>
                        <span>
                          Dosis: {m.dosis} · Vía: {m.via}
                        </span>
                        <span>
                          Frecuencia: {m.frecuencia} · Duración: {m.duracion}
                        </span>
                        {m.indicaciones && <span>{m.indicaciones}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="medical-confirm-empty">Sin receta.</span>
                )}
              </dd>
            </div>
          </dl>
          {saved ? (
            <div
              className="medical-confirm-success"
              role="status"
              aria-live="polite"
            >
              <svg
                aria-hidden="true"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M7.5 12.5l3 3 6-6.5" />
              </svg>
              <h3>Consulta guardada</h3>
              <p>
                El registro de {appointment.paciente.nombres}{' '}
                {appointment.paciente.apellidos} quedó guardado y la cita #
                {appointment.citaId} pasó a atendida.
              </p>
              <button className="secondary" onClick={onCancel}>
                Volver a mis citas
              </button>
            </div>
          ) : (
            <>
              <p className="medical-confirm-warning">
                <svg
                  aria-hidden="true"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16.5v.01" />
                </svg>
                <span>
                  Al confirmar se guardará el registro definitivo y la cita
                  pasará a atendida.
                </span>
              </p>
              <div className="medical-confirm-actions">
                <button
                  className="secondary"
                  disabled={saving}
                  onClick={() => setConfirming(false)}
                >
                  Seguir editando
                </button>
                <button
                  className="primary"
                  disabled={saving}
                  onClick={async () => {
                    const success = await onSave({
                      citaId: appointment.citaId,
                      motivo: motivo.trim(),
                      indicaciones: indicaciones.trim(),
                      diagnosticos: diagnoses.map((d) => ({
                        codigo: d.codigo,
                      })),
                      receta: medications,
                    })
                    if (success) setSaved(true)
                    else setConfirming(false)
                  }}
                >
                  {saving
                    ? 'Guardando consulta…'
                    : 'Confirmar y guardar consulta'}
                </button>
              </div>
            </>
          )}
        </dialog>
      )}
    </section>
  )
}
