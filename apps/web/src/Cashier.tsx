import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { api, ApiError } from './api'
import type { Session } from './api'
const money = (cents: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(
    cents / 100,
  )

type Patient = {
  id: number
  nombres: string
  apellidos: string
  numeroDocumento: string
}
type Charge = {
  id: number
  concepto: string
  montoCentimos: number
  estado: string
  paciente: Patient
}
type Listing = { cobros: Charge[]; hayMas: boolean }
export function Cashier({
  session,
  onExpired,
  onBusyChange,
}: {
  session: Session
  onExpired: () => void
  onBusyChange: (value: boolean) => void
}) {
  const [dni, setDni] = useState('')
  const [patient, setPatient] = useState<Patient | null>(null)
  const [listing, setListing] = useState<Listing | null>(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [selected, setSelected] = useState<Charge | null>(null)
  const [method, setMethod] = useState('efectivo')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const lock = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ pagina: String(page), limite: '20' })
    if (patient) params.set('pacienteId', String(patient.id))
    api<Listing>(`/billing/charges?${params}`, {
      token: session.token,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setListing(data)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401) onExpired()
          else setError('No se pudieron cargar los cobros.')
        }
      })
    return () => controller.abort()
  }, [patient, page, revision, session.token, onExpired])
  async function run(work: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    setError('')
    setNotice('')
    try {
      await work()
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired()
      else {
        setSelected(null)
        setListing(null)
        setRevision((v) => v + 1)
        setError(
          cause instanceof ApiError && [400, 404, 409].includes(cause.status)
            ? 'No se pudo realizar la operación. Revisa los datos y el estado actual del cobro.'
            : 'No se pudo confirmar el resultado. Revisa la lista antes de volver a intentar.',
        )
      }
    } finally {
      lock.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }
  function refresh() {
    setSelected(null)
    setListing(null)
    setRevision((v) => v + 1)
  }
  function search(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    void run(async () => {
      const rows = await api<Patient[]>(`/billing/patients?q=${dni}`, {
        token: session.token,
      })
      setPatient(rows[0] ?? null)
      setPage(1)
      setNotice(
        rows.length ? 'Paciente seleccionado.' : 'No se encontró el paciente.',
      )
      refresh()
    })
  }
  function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!patient || !/^\d+(?:\.\d{1,2})?$/.test(amount)) return
    const [whole, decimals = ''] = amount.split('.')
    const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'))
    if (!Number.isSafeInteger(cents) || cents < 1 || cents > 100000000) {
      setError('El importe debe estar entre S/ 0.01 y S/ 1,000,000.00.')
      return
    }
    void run(async () => {
      await api('/billing/charges', {
        token: session.token,
        body: {
          pacienteId: patient.id,
          concepto: concept.trim(),
          montoCentimos: cents,
        },
      })
      setConcept('')
      setAmount('')
      refresh()
      setNotice(
        'Cobro pendiente registrado. El paciente puede verlo en su portal.',
      )
    })
  }
  return (
    <section>
      <div className="page-heading">
        <p className="eyebrow">Caja / Cobros</p>
        <h1>Pagos de pacientes</h1>
        <p>
          Registra los cobros y confirma únicamente los pagos que hayas recibido
          y verificado.
        </p>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
      <form className="card" onSubmit={search}>
        <label htmlFor="cash-dni">DNI del paciente</label>
        <input
          id="cash-dni"
          required
          pattern="[0-9]{8}"
          maxLength={8}
          value={dni}
          onChange={(e) => {
            setDni(e.target.value)
            setPatient(null)
          }}
          disabled={busy}
        />
        <button className="primary" disabled={busy || !/^\d{8}$/.test(dni)}>
          Buscar paciente
        </button>
      </form>
      {patient && (
        <form className="card" onSubmit={create}>
          <h2>
            {patient.nombres} {patient.apellidos}
          </h2>
          <p>DNI: {patient.numeroDocumento}</p>
          <label htmlFor="cash-concept">Concepto del cobro</label>
          <input
            id="cash-concept"
            required
            maxLength={160}
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            disabled={busy}
          />
          <label htmlFor="cash-amount">Importe en soles</label>
          <input
            id="cash-amount"
            inputMode="decimal"
            required
            pattern="[0-9]+([.][0-9]{1,2})?"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
          />
          <button className="primary" disabled={busy || !concept.trim()}>
            Registrar cobro pendiente
          </button>
        </form>
      )}
      <div className="daily-toolbar">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setPatient(null)
            setDni('')
            setPage(1)
            refresh()
          }}
        >
          Todos los cobros
        </button>
        <button className="secondary" disabled={busy} onClick={refresh}>
          Actualizar cobros
        </button>
      </div>
      {!listing ? (
        <p role="status">
          {error ? 'Cobros no disponibles.' : 'Cargando cobros…'}
        </p>
      ) : (
        <>
          {listing.cobros.length === 0 && <p>No hay cobros registrados.</p>}
          {listing.cobros.map((charge) => (
            <article className="card" key={charge.id}>
              <h2>{charge.concepto}</h2>
              <p>
                {charge.paciente.nombres} {charge.paciente.apellidos} · DNI{' '}
                {charge.paciente.numeroDocumento}
              </p>
              <p>
                {money(charge.montoCentimos)} ·{' '}
                {charge.estado === 'pagado' ? 'Pagado' : 'Pendiente'}
              </p>
              {charge.estado === 'pendiente' && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    setSelected(charge)
                    setMethod('efectivo')
                    setReference('')
                  }}
                >
                  Registrar pago recibido
                </button>
              )}
            </article>
          ))}
          <nav className="daily-pagination" aria-label="Páginas de cobros">
            <button
              disabled={busy || page === 1}
              onClick={() => {
                setPage((v) => v - 1)
                setListing(null)
                setSelected(null)
              }}
            >
              Anterior
            </button>
            <span>Página {page}</span>
            <button
              disabled={busy || !listing.hayMas}
              onClick={() => {
                setPage((v) => v + 1)
                setListing(null)
                setSelected(null)
              }}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
      {selected && (
        <section className="card">
          <h2>Confirmar pago recibido</h2>
          <p>
            {selected.concepto} · {money(selected.montoCentimos)} ·{' '}
            {selected.paciente.nombres} {selected.paciente.apellidos}
          </p>
          <p>
            Confirma que verificaste el importe completo recibido antes de
            registrar el pago.
          </p>
          <label htmlFor="cash-method">Método de pago</label>
          <select
            id="cash-method"
            value={method}
            disabled={busy}
            onChange={(e) => setMethod(e.target.value)}
          >
            {['efectivo', 'tarjeta', 'yape', 'plin', 'transferencia'].map(
              (value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ),
            )}
          </select>
          <label htmlFor="cash-reference">
            Referencia de la operación
            {method === 'efectivo' ? ' (opcional)' : ''}
          </label>
          <input
            id="cash-reference"
            maxLength={100}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={busy}
          />
          <div className="daily-pagination">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Volver
            </button>
            <button
              className="primary"
              disabled={busy || (method !== 'efectivo' && !reference.trim())}
              onClick={() =>
                void run(async () => {
                  await api(`/billing/charges/${selected.id}/settle`, {
                    token: session.token,
                    body: {
                      metodoPago: method,
                      ...(reference.trim()
                        ? { referencia: reference.trim() }
                        : {}),
                    },
                  })
                  refresh()
                  setNotice('Pago registrado correctamente.')
                })
              }
            >
              {busy ? 'Registrando…' : 'Confirmar pago recibido'}
            </button>
          </div>
        </section>
      )}
    </section>
  )
}
