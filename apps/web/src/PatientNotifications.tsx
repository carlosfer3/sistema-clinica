import { useEffect, useState } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'

type Notice = {
  id: string
  citaId: number
  tipo: string
  inicio: string | null
  inicioAnterior: string | null
  especialidad: string
  pendienteConfirmacion: boolean
  creadoEn: string
}
type Listing = { notificaciones: Notice[]; hayMas: boolean }
const date = (value: string) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

export function PatientNotifications({
  session,
  onExpired,
  onAppointments,
}: {
  session: Session
  onExpired: () => void
  onAppointments: () => void
}) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setRevision((v) => v + 1)
    }
    const timer = setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    api<Listing>(`/portal/notifications?pagina=${page}&limite=6`, {
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
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else setError('No pudimos cargar los avisos de tus citas.')
        }
      })
    return () => controller.abort()
  }, [session.token, onExpired, page, revision])
  return (
    <section
      className="pp-notice-feed"
      aria-label="Notificaciones de tus citas"
    >
      <div className="pp-section-heading">
        <h2>Notificaciones de tus citas</h2>
        <button
          className="pp-text-button"
          onClick={() => {
            setPage(1)
            setListing(null)
            setError('')
            setRevision((v) => v + 1)
          }}
        >
          Actualizar avisos
        </button>
      </div>
      {error ? (
        <p role="alert">
          {error}{' '}
          <button
            className="pp-text-button"
            onClick={() => {
              setError('')
              setRevision((v) => v + 1)
            }}
          >
            Reintentar avisos
          </button>
        </p>
      ) : !listing ? (
        <p role="status">Cargando notificaciones…</p>
      ) : (
        <>
          {!listing.notificaciones.length ? (
            <p>Aún no tienes avisos de cambios en tus citas.</p>
          ) : (
            <ul>
              {listing.notificaciones.map((notice) => (
                <li key={notice.id}>
                  <span
                    className={`pp-notice-symbol${notice.tipo === 'cancelacion' ? ' cancelled' : ''}`}
                    aria-hidden="true"
                  >
                    {notice.tipo === 'confirmacion'
                      ? '✓'
                      : notice.tipo === 'cancelacion'
                        ? '×'
                        : '◷'}
                  </span>
                  <div>
                    <h3>
                      {notice.tipo === 'confirmacion'
                        ? 'Cita confirmada por admisión'
                        : notice.tipo === 'cancelacion'
                          ? 'Cita cancelada'
                          : notice.tipo === 'reprogramacion'
                            ? 'Cita reprogramada'
                            : notice.pendienteConfirmacion
                              ? 'Solicitud de cita recibida'
                              : 'Cita registrada'}
                    </h3>
                    <p>
                      {notice.tipo === 'confirmacion'
                        ? `Admisión confirmó tu cita #${notice.citaId}.`
                        : `Cita #${notice.citaId}.`}{' '}
                      {notice.especialidad}
                      {notice.inicio && ` · ${date(notice.inicio)} (Lima)`}
                    </p>
                    {notice.inicioAnterior && (
                      <p>Horario anterior: {date(notice.inicioAnterior)}</p>
                    )}
                    {notice.pendienteConfirmacion &&
                      notice.tipo !== 'cancelacion' && (
                        <p>
                          En ese momento quedó pendiente de confirmación por
                          admisión.
                        </p>
                      )}
                    <time dateTime={notice.creadoEn}>
                      {date(notice.creadoEn)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <nav
            className="pp-notice-pagination"
            aria-label="Páginas de notificaciones"
          >
            <button
              className="pp-text-button"
              disabled={page === 1}
              onClick={() => {
                setListing(null)
                setPage((v) => v - 1)
              }}
            >
              Avisos más recientes
            </button>
            <span>Página {page}</span>
            <button
              className="pp-text-button"
              disabled={!listing.hayMas}
              onClick={() => {
                setListing(null)
                setPage((v) => v + 1)
              }}
            >
              Avisos anteriores
            </button>
          </nav>
        </>
      )}
      <button className="pp-text-button" onClick={onAppointments}>
        Revisar el estado actual de mis citas →
      </button>
    </section>
  )
}
