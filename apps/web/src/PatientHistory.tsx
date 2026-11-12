import { useEffect, useState } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'

type History = {
  paciente: { nombres: string; apellidos: string; numeroDocumento: string; antecedentes: { id: number; tipo: string; descripcion: string; desde: string | null }[]; alergias: { id: number; sustancia: string; reaccion: string | null }[] }
  pagina: number; hayMas: boolean
  consultas: { id: number; fechaHora: string; motivo: string; indicaciones: string | null; estado: 'activo' | 'anulado'; motivoAnulacion: string | null; anuladoEn: string | null; medico: { usuario: { nombres: string; apellidos: string }; especialidad: { nombre: string } }; diagnosticos: { codigo: string; descripcion: string; tipo: string }[]; recetaItems: { medicamento: string; dosis: string; via: string; frecuencia: string; duracion: string; indicaciones: string | null }[] }[]
}
const date = (value: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

export function PatientHistory({ patientId, session, onExpired }: { patientId: number; session: Session; onExpired: () => void }) {
  const [history, setHistory] = useState<History | null>(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    api<History>(`/patients/${patientId}/history?pagina=${page}&limite=10`, { token: session.token, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setHistory(data) })
      .catch(cause => {
        if (controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 401) onExpired()
        else setError('No se pudo cargar la HCE. Comprueba tu acceso y vuelve a intentar.')
      }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [patientId, session.token, onExpired, page, revision])
  function reload(nextPage: number) { setLoading(true); setHistory(null); setError(''); setPage(nextPage); setRevision(v => v + 1) }
  return <section className="patient-clinical-history" aria-labelledby="history-title">
    <h3 id="history-title">Historia clínica del paciente</h3>
    <p className="small">Consultas de más reciente a más antigua. Horario de Lima.</p>
    {loading ? <p role="status">Cargando HCE…</p> : error ? <div><p role="alert">{error}</p><button type="button" className="secondary" onClick={() => reload(page)}>Reintentar HCE</button></div> : history && <>
      <p>{history.paciente.nombres} {history.paciente.apellidos} · Documento: {history.paciente.numeroDocumento}</p>
      <h4>Alergias registradas</h4>
      {history.paciente.alergias.length ? <ul className="medical-allergies">{history.paciente.alergias.map(a => <li key={a.id}><strong>{a.sustancia}</strong> · {a.reaccion || 'Reacción no registrada'}</li>)}</ul> : <p>No hay alergias registradas. Esto no confirma ausencia de alergias.</p>}
      <h4>Antecedentes registrados</h4>
      {history.paciente.antecedentes.length ? <ul>{history.paciente.antecedentes.map(a => <li key={a.id}>{a.tipo}: {a.descripcion}{a.desde && ` · Desde ${a.desde.slice(0, 10)}`}</li>)}</ul> : <p>No hay antecedentes registrados.</p>}
      <h4>Consultas anteriores</h4>
      {!history.consultas.length && <p>No hay consultas registradas en esta página.</p>}
      {history.consultas.map(c => <article className="card" key={c.id} aria-label={`Consulta #${c.id}`}>
        <h5>Consulta #{c.id} · {date(c.fechaHora)}</h5>
        <p>{c.medico.usuario.nombres} {c.medico.usuario.apellidos} · {c.medico.especialidad.nombre}</p>
        <p><strong>{c.estado === 'anulado' ? 'Consulta anulada' : 'Consulta activa'}</strong></p>
        {c.estado === 'anulado' && <p>Motivo de anulación: {c.motivoAnulacion || 'Sin detalle'}{c.anuladoEn && ` · ${date(c.anuladoEn)}`}</p>}
        <p><strong>Motivo:</strong> {c.motivo}</p>
        <h6>Diagnósticos</h6>
        {c.diagnosticos.length ? <ul>{c.diagnosticos.map(d => <li key={d.codigo}>{d.codigo} · {d.descripcion} · {d.tipo}</li>)}</ul> : <p>Sin diagnósticos registrados.</p>}
        <p><strong>Indicaciones:</strong> {c.indicaciones || 'Sin indicaciones registradas.'}</p>
        <h6>Receta registrada</h6>
        {c.recetaItems.length ? <ul>{c.recetaItems.map((r, i) => <li key={i}><strong>{r.medicamento}</strong> · Dosis: {r.dosis} · Vía: {r.via} · Frecuencia: {r.frecuencia} · Duración: {r.duracion}{r.indicaciones && ` · ${r.indicaciones}`}</li>)}</ul> : <p>Sin receta registrada.</p>}
      </article>)}
      <nav className="daily-pagination" aria-label="Páginas de historia clínica"><button type="button" className="secondary" disabled={page === 1} onClick={() => reload(page - 1)}>Consultas más recientes</button><span>Página {page}</span><button type="button" className="secondary" disabled={!history.hayMas} onClick={() => reload(page + 1)}>Consultas más antiguas</button></nav>
    </>}
  </section>
}
