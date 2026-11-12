import { useEffect, useId, useState } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'

type AlertIconName = 'clock' | 'calendar' | 'check' | 'file' | 'pill' | 'payment'
function AlertIcon({ name }: { name: AlertIconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'clock' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
    {name === 'calendar' && <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4m8-4v4M3 11h18" /></>}
    {name === 'check' && <path d="m5 12 4 4L19 6" />}
    {name === 'file' && <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" /></>}
    {name === 'pill' && <><path d="m10.5 20.5 10-10a5 5 0 0 0-7-7l-10 10a5 5 0 0 0 7 7ZM8.5 8.5l7 7" /></>}
    {name === 'payment' && <><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20M6 15h4" /></>}
  </svg>
}

type Appointment = {
  inicio: string
  estado: string
  especialidad: { nombre: string }
}
type Balance = { saldoPendienteCentimos: number; cantidadPendientes: number }
export function PatientAlerts({
  session,
  appointments,
  onExpired,
  onAppointments,
  onPayments,
  onPrescriptions,
}: {
  session: Session
  appointments: Appointment[] | null
  onExpired: () => void
  onAppointments: () => void
  onPayments: () => void
  onPrescriptions: () => void
}) {
  const titleId = useId()
  const [balance, setBalance] = useState<Balance | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    api<Balance>('/portal/payments?pagina=1&limite=1', {
      token: session.token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setBalance(data)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else setError('No pudimos consultar tus pagos.')
        }
      })
    return () => controller.abort()
  }, [session.token, onExpired, revision])
  const next = appointments?.find((a) => {
    const hours = (new Date(a.inicio).getTime() - now) / 3600000
    return hours >= 0 && hours <= 48
  })
  const pending = appointments?.some(
    (a) => a.estado === 'pendiente_confirmacion',
  )
  const amount = balance
    ? new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN',
      }).format(balance.saldoPendienteCentimos / 100)
    : ''
  const actionCount = Number(Boolean(next || pending)) + Number(Boolean(balance?.cantidadPendientes))
  return (
    <section className="pp-alerts" aria-labelledby={titleId}>
      <div className="pp-alerts-heading">
        <span className="pp-alerts-icon"><AlertIcon name="clock" /></span>
        <h2 id={titleId}>Alertas y recordatorios</h2>
        {actionCount > 0 && <span className="pp-alerts-count" aria-label={`${actionCount} alertas por atender`}>{actionCount}</span>}
      </div>
      <ul className="pp-alert-list">
      <li
        className={`pp-alert-item ${next || pending ? 'pp-alert-action' : ''}`}
      >
        <span className="pp-alert-badge"><AlertIcon name="calendar" /></span>
        <div>
          <h3>Citas cercanas</h3>
          {!appointments ? (
            <p>Consultando tus próximas citas…</p>
          ) : next ? (
            <p>
              <strong>{next.especialidad.nombre}</strong> ·{' '}
              {new Intl.DateTimeFormat('es-PE', {
                timeZone: 'America/Lima',
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(next.inicio))}
              {next.estado === 'pendiente_confirmacion'
                ? '. Pendiente de confirmación por admisión.'
                : '. Recuerda llegar 10 minutos antes.'}
            </p>
          ) : (
            <p>
              No tienes citas en las próximas 48 horas.
              {pending
                ? ' Tienes una solicitud pendiente de confirmación por admisión.'
                : ''}
            </p>
          )}
          <button className="pp-text-button" onClick={onAppointments}>
            Revisar mis citas →
          </button>
        </div>
      </li>
      <li
        className={`pp-alert-item ${balance?.cantidadPendientes ? 'pp-alert-payment' : balance && !error ? 'pp-alert-ok' : 'pp-alert-idle'}`}
      >
        <span className="pp-alert-badge"><AlertIcon name={balance && !balance.cantidadPendientes && !error ? 'check' : 'payment'} /></span>
        <div>
          <h3>Pagos pendientes</h3>
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button
                className="pp-text-button"
                onClick={() => {
                  setError('')
                  setRevision((v) => v + 1)
                }}
              >
                Reintentar
              </button>
            </>
          ) : !balance ? (
            <p>Consultando tu saldo…</p>
          ) : (
            <p>
              {balance.cantidadPendientes
                ? `${balance.cantidadPendientes} cobro(s) por pagar · ${amount}`
                : 'Estás al día. No tienes pagos pendientes.'}
            </p>
          )}
          <button className="pp-text-button" onClick={onPayments}>
            Ver mis pagos →
          </button>
        </div>
      </li>
      <li className="pp-alert-item pp-alert-idle">
        <span className="pp-alert-badge"><AlertIcon name="file" /></span>
        <div>
          <h3>Resultados de exámenes</h3>
          <p>Aún no hay resultados publicados en este portal.</p>
        </div>
      </li>
      <li className="pp-alert-item pp-alert-info">
        <span className="pp-alert-badge"><AlertIcon name="pill" /></span>
        <div>
          <h3>Tratamientos y renovaciones</h3>
          <p>
            Revisa la duración indicada en tus recetas y consulta con tu médico
            si necesitas renovar tu tratamiento.
          </p>
          <button className="pp-text-button" onClick={onPrescriptions}>
            Revisar mis recetas →
          </button>
        </div>
      </li>
      </ul>
    </section>
  )
}
