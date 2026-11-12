import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'

type Consultation = { id: number; fechaHora: string; motivo: string; estado: string; motivoAnulacion: string | null; anuladoEn: string | null; paciente: { nombres: string; apellidos: string; numeroDocumento: string } }
export function ClinicalAnnulments({ session, onExpired, onBusyChange }: { session: Session; onExpired: () => void; onBusyChange: (busy: boolean) => void }) {
  const [rows, setRows] = useState<Consultation[]>([])
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<Consultation | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const lock = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (selected) dialog.current?.showModal() }, [selected])
  useEffect(() => {
    const controller = new AbortController()
    api<Consultation[]>('/consultations', { token: session.token, signal: controller.signal }).then(data => { if (!controller.signal.aborted) setRows(data) }).catch(cause => {
      if (controller.signal.aborted) return
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      else setError('No se pudieron cargar las consultas.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision, session.token, onExpired])
  async function annul() {
    if (!selected || !reason.trim() || lock.current) return
    lock.current = true; setSaving(true); onBusyChange(true); setError('')
    try {
      await api(`/consultations/${selected.id}/annul`, { token: session.token, body: { motivo: reason.trim() } })
      setSelected(null); setNotice('Consulta anulada. El registro original y su receta se conservan como evidencia.'); setLoading(true); setRevision(v => v + 1)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      else setError('No se pudo confirmar la anulación. Cierra el modal y actualiza las consultas para comprobar el estado antes de intentarlo de nuevo.')
    } finally { lock.current = false; setSaving(false); onBusyChange(false) }
  }
  return <section>
    <h2>Mis consultas registradas</h2><p>Últimas 50 consultas. La anulación conserva la evidencia original y no vuelve a abrir la cita atendida.</p>
    <button className="secondary" disabled={saving || loading} onClick={() => { setError(''); setLoading(true); setRevision(v => v + 1) }}>Actualizar consultas</button>
    {notice && <p role="status" className="notice success">{notice}</p>}{error && !selected && <p role="alert" className="notice error">{error}</p>}
    {loading ? <p role="status">Cargando consultas…</p> : <div className="daily-table-wrap"><table className="daily-table"><thead><tr><th>ID</th><th>Paciente</th><th>DNI</th><th>Fecha</th><th>Motivo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{rows.map(c => <tr key={c.id}><td data-label="ID">{c.id}</td><td data-label="Paciente">{c.paciente.nombres} {c.paciente.apellidos}</td><td data-label="DNI">{c.paciente.numeroDocumento}</td><td data-label="Fecha">{new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }).format(new Date(c.fechaHora))}</td><td data-label="Motivo">{c.motivo}</td><td data-label="Estado">{c.estado === 'anulado' ? 'Anulada' : 'Activa'}{c.motivoAnulacion && <p>{c.motivoAnulacion}</p>}</td><td data-label="Acciones">{c.estado === 'activo' && <button className="danger" onClick={() => { setSelected(c); setReason(''); setError(''); setNotice('') }}>Anular consulta</button>}</td></tr>)}</tbody></table>{!rows.length && <p className="empty">No hay consultas registradas.</p>}</div>}
    {selected && <dialog ref={dialog} className="card modal nursing-modal" aria-labelledby="annul-title" onCancel={e => { e.preventDefault(); if (!saving) setSelected(null) }}><div className="nursing-modal-header"><h2 id="annul-title">Anular consulta #{selected.id}</h2><button aria-label="Cerrar anulación" disabled={saving} onClick={() => setSelected(null)}>×</button></div><div className="nursing-modal-body"><p>{selected.paciente.nombres} {selected.paciente.apellidos} · DNI {selected.paciente.numeroDocumento}</p><p className="arrival-reminder">La consulta quedará anulada. Su contenido original se conservará y la receta asociada dejará de mostrarse entre las recetas activas.</p><label htmlFor="annul-reason">Motivo de anulación (obligatorio)</label><textarea id="annul-reason" required maxLength={300} rows={3} value={reason} disabled={saving} onChange={e => setReason(e.target.value)} />{error && <p role="alert" className="notice error">{error}</p>}<div className="daily-pagination"><button className="secondary" disabled={saving} onClick={() => setSelected(null)}>Volver</button><button className="danger" disabled={saving || !reason.trim()} onClick={() => void annul()}>{saving ? 'Anulando…' : 'Confirmar anulación'}</button></div></div></dialog>}
  </section>
}
