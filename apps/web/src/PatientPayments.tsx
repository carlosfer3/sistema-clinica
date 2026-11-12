import { useEffect, useState } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'

type Charge = {
  id: number
  concepto: string
  montoCentimos: number
  estado: string
  creadoEn: string
  pagadoEn: string | null
  metodoPago: string | null
  referencia: string | null
}
type Payments = {
  cobros: Charge[]
  saldoPendienteCentimos: number
  cantidadPendientes: number
  hayMas: boolean
}
const money = (cents: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(
    cents / 100,
  )

export function PatientPayments({
  session,
  onExpired,
  compact = false,
  onOpen,
}: {
  session: Session
  onExpired: () => void
  compact?: boolean
  onOpen?: () => void
}) {
  const [data, setData] = useState<Payments | null>(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Charge | null>(null)
  const [downloading, setDownloading] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    api<Payments>(
      `/portal/payments?pagina=${page}&limite=${compact ? 1 : 10}`,
      { token: session.token, signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else setError('No pudimos cargar tus pagos. Intenta nuevamente.')
        }
      })
    return () => controller.abort()
  }, [session.token, onExpired, page, revision, compact])
  function reload() {
    setError('')
    setData(null)
    setSelected(null)
    setRevision((v) => v + 1)
  }
  async function download(charge: Charge) {
    if (downloading) return
    setDownloading(true)
    setError('')
    try {
      const receipt = await api<Charge & { tipo: string }>(
        `/portal/payments/${charge.id}/receipt`,
        { token: session.token },
      )
      const body = `CLÍNICA SAN RAFAEL\n${receipt.tipo}\nN.º ${receipt.id}\nConcepto: ${receipt.concepto}\nImporte: ${money(receipt.montoCentimos)}\nPagado: ${receipt.pagadoEn ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'long', timeStyle: 'short' }).format(new Date(receipt.pagadoEn)) : ''}\nMétodo: ${receipt.metodoPago}\nReferencia: ${receipt.referencia || 'No aplica'}\n\nConstancia interna. No reemplaza un comprobante fiscal.\n`
      const url = URL.createObjectURL(
        new Blob([body], { type: 'text/plain;charset=utf-8' }),
      )
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `constancia-pago-${receipt.id}.txt`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      else setError('No pudimos descargar tu constancia. Intenta nuevamente.')
    } finally {
      setDownloading(false)
    }
  }
  if (compact)
    return (
      <section className="pp-payment-summary" aria-label="Resumen de pagos">
        <h3>Pagos y saldo pendiente</h3>
        {error ? (
          <p role="alert">{error}</p>
        ) : !data ? (
          <p role="status">Consultando saldo…</p>
        ) : (
          <>
            <strong>{money(data.saldoPendienteCentimos)}</strong>
            <p>
              {data.cantidadPendientes
                ? `${data.cantidadPendientes} cobro(s) pendiente(s)`
                : 'No tienes pagos pendientes.'}
            </p>
          </>
        )}
        <button className="pp-text-button" onClick={onOpen}>
          Ver pagos →
        </button>
      </section>
    )
  return (
    <section aria-label="Mis pagos">
      <div className="pp-section-heading">
        <h2>Tu saldo pendiente</h2>
        <button className="pp-text-button" onClick={reload}>
          Actualizar pagos
        </button>
      </div>
      {error && (
        <p className="pp-message pp-error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p role="status">
          {error ? 'Pagos no disponibles.' : 'Cargando tus pagos…'}
        </p>
      ) : (
        <>
          <div className="pp-balance">
            <strong>{money(data.saldoPendienteCentimos)}</strong>
            <p>
              {data.cantidadPendientes} cobro(s) pendiente(s) · Pagos en clínica
            </p>
          </div>
          {data.cobros.length === 0 && (
            <div className="pp-empty">
              Todavía no tienes cobros registrados.
            </div>
          )}
          {data.cobros.map((charge) => (
            <article className="pp-history-card pp-charge" key={charge.id}>
              <div>
                <h3>{charge.concepto}</h3>
                <p>
                  Cobro #{charge.id} ·{' '}
                  {charge.estado === 'pagado' ? 'Pagado' : 'Pendiente de pago'}
                </p>
                <strong>{money(charge.montoCentimos)}</strong>
              </div>
              {charge.estado === 'pendiente' ? (
                <button
                  className="pp-primary"
                  onClick={() => setSelected(charge)}
                >
                  Pagar en clínica
                </button>
              ) : (
                <button
                  className="pp-text-button"
                  disabled={downloading}
                  onClick={() => void download(charge)}
                >
                  Descargar constancia
                </button>
              )}
            </article>
          ))}
          {selected && (
            <section
              className="pp-history-card"
              aria-label="Instrucciones de pago"
            >
              <h2>Realiza tu pago en caja</h2>
              <p>
                <strong>
                  {selected.concepto} · {money(selected.montoCentimos)}
                </strong>
              </p>
              <p>
                Acércate a caja de Clínica San Rafael e indica el cobro #
                {selected.id}. Presenta tu documento y realiza el pago. Caja
                verificará la operación y actualizará el estado; después podrás
                descargar tu constancia aquí.
              </p>
              <button
                className="pp-text-button"
                onClick={() => setSelected(null)}
              >
                Cerrar instrucciones
              </button>
            </section>
          )}
          <nav className="pp-pagination" aria-label="Páginas de pagos">
            <button
              disabled={page === 1}
              onClick={() => {
                setData(null)
                setPage((v) => v - 1)
              }}
            >
              Anterior
            </button>
            <span>Página {page}</span>
            <button
              disabled={!data.hayMas}
              onClick={() => {
                setData(null)
                setPage((v) => v + 1)
              }}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
    </section>
  )
}
