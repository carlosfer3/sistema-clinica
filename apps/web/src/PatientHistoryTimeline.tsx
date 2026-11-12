import { useEffect, useState } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'
import './PatientHistoryTimeline.css'

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
type Context = {
  especialidades: { id: number; nombre: string }[]
  alergias: { id: number; sustancia: string; reaccion: string | null }[]
  antecedentes: {
    id: number
    tipo: string
    descripcion: string
    desde: string | null
  }[]
}
const blankFilters = {
  buscar: '',
  especialidadId: '',
  desde: '',
  hasta: '',
  conReceta: false,
}
const date = (value: string) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    dateStyle: 'long',
  }).format(new Date(value))

export function PatientHistoryTimeline({
  session,
  profile,
  onExpired,
  onHelp,
  refreshRevision,
}: {
  session: Session
  profile: {
    nombres: string
    apellidos: string
    tipoDocumento: string
    numeroDocumento: string
  } | null
  onExpired: () => void
  onHelp: () => void
  refreshRevision: number
}) {
  const [history, setHistory] = useState<History | null>(null)
  const [context, setContext] = useState<Context | null>(null)
  const [contextError, setContextError] = useState('')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(blankFilters)
  const [filters, setFilters] = useState(blankFilters)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [contextRevision, setContextRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    api<Context>('/portal/history-context', {
      token: session.token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setContext(data)
          setContextError('')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else
            setContextError(
              'No pudimos cargar tu resumen clínico y las especialidades.',
            )
        }
      })
    return () => controller.abort()
  }, [session.token, onExpired, contextRevision, refreshRevision])
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ pagina: String(page), limite: '6' })
    for (const [key, value] of Object.entries(filters))
      if (value) params.set(key, String(value))
    api<History>(`/portal/history?${params}`, {
      token: session.token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setHistory(data)
          setError('')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else setError('No pudimos cargar tu historial. Intenta nuevamente.')
        }
      })
    return () => controller.abort()
  }, [session.token, onExpired, filters, page, revision, refreshRevision])
  function changePage(value: number) {
    setHistory(null)
    setError('')
    setPage(value)
  }
  const filtered = Object.values(filters).some(Boolean)
  return (
    <section className="ph-history" aria-label="Historial médico del paciente">
      <form
        className="ph-filters"
        onSubmit={(event) => {
          event.preventDefault()
          if (draft.desde && draft.hasta && draft.desde > draft.hasta) return
          setFilters({ ...draft, buscar: draft.buscar.trim() })
          setHistory(null)
          setError('')
          setPage(1)
          setRevision((v) => v + 1)
        }}
      >
        <div className="ph-search">
          <label htmlFor="ph-search">Buscar en mi historial</label>
          <input
            id="ph-search"
            type="search"
            minLength={2}
            maxLength={100}
            placeholder="Médico, especialidad, motivo o diagnóstico"
            value={draft.buscar}
            onChange={(event) =>
              setDraft({ ...draft, buscar: event.target.value })
            }
          />
        </div>
        <div>
          <label htmlFor="ph-specialty">Especialidad</label>
          <select
            id="ph-specialty"
            value={draft.especialidadId}
            onChange={(event) =>
              setDraft({ ...draft, especialidadId: event.target.value })
            }
          >
            <option value="">Todas</option>
            {context?.especialidades.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ph-from">Desde</label>
          <input
            id="ph-from"
            type="date"
            max={draft.hasta || undefined}
            value={draft.desde}
            onChange={(event) =>
              setDraft({ ...draft, desde: event.target.value })
            }
          />
        </div>
        <div>
          <label htmlFor="ph-until">Hasta</label>
          <input
            id="ph-until"
            type="date"
            min={draft.desde || undefined}
            value={draft.hasta}
            onChange={(event) =>
              setDraft({ ...draft, hasta: event.target.value })
            }
          />
        </div>
        <label className="ph-checkbox">
          <input
            type="checkbox"
            checked={draft.conReceta}
            onChange={(event) =>
              setDraft({ ...draft, conReceta: event.target.checked })
            }
          />
          Con receta
        </label>
        <button className="pp-primary" type="submit">
          Aplicar filtros
        </button>
        <button
          className="pp-secondary"
          type="button"
          onClick={() => {
            setDraft(blankFilters)
            setFilters(blankFilters)
            setPage(1)
            setHistory(null)
            setError('')
            setRevision((v) => v + 1)
          }}
        >
          Limpiar
        </button>
      </form>
      <div className="ph-layout">
        <div className="ph-main">
          <div className="ph-timeline-heading">
            <h3>Historial cronológico de atenciones</h3>
            {history && (
              <span>{history.consultas.length} {history.consultas.length === 1 ? 'consulta' : 'consultas'} en esta página</span>
            )}
          </div>
          {error ? (
            <div className="ph-empty" role="alert">
              <p>{error}</p>
              <button
                className="pp-secondary"
                onClick={() => {
                  setError('')
                  setRevision((v) => v + 1)
                }}
              >
                Reintentar historial
              </button>
            </div>
          ) : !history ? (
            <p role="status">Cargando tu historial…</p>
          ) : (
            <>
              {!history.consultas.length && (
                <div className="ph-empty">
                  <h3>
                    {filtered
                      ? 'Sin atenciones con estos filtros'
                      : 'Todavía no tienes consultas registradas.'}
                  </h3>
                  <p>
                    {filtered
                      ? 'Prueba con otras fechas o limpia los filtros para consultar todo tu historial.'
                      : 'Tus consultas aparecerán aquí después de que el médico las registre.'}
                  </p>
                </div>
              )}
              <div className="ph-timeline">
                {history.consultas.map((consultation) => (
                  <article
                    key={consultation.id}
                    className="ph-consultation"
                    aria-label={`Consulta #${consultation.id}`}
                  >
                    <div className="ph-card-top">
                      <span className="ph-specialty">
                        {consultation.medico.especialidad.nombre}
                      </span>
                      <time dateTime={consultation.fechaHora}>
                        {date(consultation.fechaHora)}
                      </time>
                    </div>
                    <div className="ph-doctor">
                      <h3>
                        {consultation.medico.usuario.nombres}{' '}
                        {consultation.medico.usuario.apellidos}
                      </h3>
                      <span
                        className={
                          consultation.estado === 'anulado'
                            ? 'ph-state annulled'
                            : 'ph-state'
                        }
                      >
                        {consultation.estado === 'anulado'
                          ? 'Consulta anulada'
                          : 'Atención registrada'}
                      </span>
                    </div>
                    <p className="ph-record-id">Consulta #{consultation.id}</p>
                    {consultation.estado === 'anulado' ? (
                      <p className="ph-annulment">
                        Consulta anulada ·{' '}
                        {consultation.motivoAnulacion ||
                          'Sin detalle registrado'}
                      </p>
                    ) : (
                      <>
                        <div className="ph-clinical-detail">
                          <div>
                            <h4>Motivo de consulta</h4>
                            <p>{consultation.motivo}</p>
                          </div>
                          <div>
                            <h4>Diagnósticos registrados</h4>
                            {consultation.diagnosticos.length ? (
                              consultation.diagnosticos.map(
                                (diagnosis, index) => (
                                  <p key={diagnosis.codigo}>
                                    <span className="ph-code">
                                      {diagnosis.codigo}
                                    </span>{' '}
                                    {diagnosis.descripcion}
                                    <small>
                                      {index === 0 ? 'Principal' : 'Secundario'}
                                    </small>
                                  </p>
                                ),
                              )
                            ) : (
                              <p>Sin diagnósticos registrados.</p>
                            )}
                          </div>
                        </div>
                        <details className="ph-expanded">
                          <summary>
                            Ver indicaciones y receta
                            {consultation.recetaItems.length
                              ? ` (${consultation.recetaItems.length} ${consultation.recetaItems.length === 1 ? 'medicamento' : 'medicamentos'})`
                              : ''}
                          </summary>
                          <h4>Indicaciones</h4>
                          <p>
                            {consultation.indicaciones ||
                              'Sin indicaciones registradas.'}
                          </p>
                          <h4>Receta registrada</h4>
                          {consultation.recetaItems.length ? (
                            consultation.recetaItems.map((item) => (
                              <div className="ph-medication" key={item.id}>
                                <strong>{item.medicamento}</strong>
                                <p>
                                  Dosis: {item.dosis} · Vía: {item.via}
                                </p>
                                <p>
                                  Frecuencia: {item.frecuencia} · Duración:{' '}
                                  {item.duracion}
                                </p>
                                {item.indicaciones && (
                                  <p>{item.indicaciones}</p>
                                )}
                              </div>
                            ))
                          ) : (
                            <p>Sin receta registrada.</p>
                          )}
                        </details>
                      </>
                    )}
                  </article>
                ))}
              </div>
              <nav
                className="ph-pagination"
                aria-label="Páginas de mi historial"
              >
                <button
                  className="pp-secondary"
                  disabled={page === 1}
                  onClick={() => changePage(page - 1)}
                >
                  Anterior
                </button>
                <span>Página {page} · Horario de Lima</span>
                <button
                  className="pp-secondary"
                  disabled={!history.hayMas}
                  onClick={() => changePage(page + 1)}
                >
                  Siguiente
                </button>
              </nav>
            </>
          )}
        </div>
        <aside className="ph-sidebar">
          <section className="ph-summary">
            <h3>Resumen clínico</h3>
            {profile && (
              <div className="ph-patient">
                <strong>
                  {profile.nombres} {profile.apellidos}
                </strong>
                <span>
                  {profile.tipoDocumento}: {profile.numeroDocumento}
                </span>
              </div>
            )}
            {contextError ? (
              <div role="alert">
                <p>{contextError}</p>
                <button
                  className="pp-secondary"
                  onClick={() => {
                    setContextError('')
                    setContextRevision((v) => v + 1)
                  }}
                >
                  Reintentar resumen
                </button>
              </div>
            ) : !context ? (
              <p role="status">Cargando resumen clínico…</p>
            ) : (
              <>
                <h4>Alergias registradas</h4>
                {context.alergias.length ? (
                  <ul className="ph-allergies">
                    {context.alergias.map((item) => (
                      <li key={item.id}>
                        <strong>{item.sustancia}</strong>
                        <span>{item.reaccion || 'Reacción no registrada'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No hay alergias registradas. Esto no confirma ausencia de
                    alergias.
                  </p>
                )}
                <h4>Antecedentes registrados</h4>
                {context.antecedentes.length ? (
                  <ul className="ph-background">
                    {context.antecedentes.map((item) => (
                      <li key={item.id}>
                        <strong>{item.tipo}</strong>
                        <p>{item.descripcion}</p>
                        {item.desde && (
                          <small>Desde {item.desde.slice(0, 10)}</small>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No hay antecedentes registrados.</p>
                )}
              </>
            )}
          </section>
          <section className="ph-help">
            <h3>¿Necesitas ayuda?</h3>
            <p>
              Consulta cómo revisar tus atenciones y recetas o gestionar tus
              datos.
            </p>
            <button className="pp-secondary" onClick={onHelp}>
              Centro de ayuda
            </button>
          </section>
        </aside>
      </div>
    </section>
  )
}
