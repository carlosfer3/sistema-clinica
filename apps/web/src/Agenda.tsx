import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { api, ApiError } from "./api";
import type { Session } from "./api";

type Patient = {
  id: number;
  nombres: string;
  apellidos: string;
  tipoDocumento: string;
  numeroDocumento: string;
};
type Doctor = { id: number; nombres: string; apellidos: string };
type Specialty = { id: number; nombre: string; medicos: Doctor[] };
type Slot = {
  medicoId: number;
  medico: { nombres: string; apellidos: string };
  consultorioId: number;
  consultorio: string;
  inicio: string;
  fin: string;
};
type Availability = { turnos: Slot[] };
type Booking = { id: number; fechaHoraInicio: string; fechaHoraFin: string };
const time = (value: string) =>
  new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
const day = (value: string) =>
  new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "long",
  }).format(new Date(value));
const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export function Agenda({
  session,
  onExpired,
  onBookingChange,
}: {
  session: Session;
  onExpired: () => void;
  onBookingChange: (busy: boolean) => void;
}) {
  const [catalog, setCatalog] = useState<Specialty[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [patientError, setPatientError] = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [specialtyId, setSpecialtyId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [motive, setMotive] = useState("");
  const [channel, setChannel] = useState("presencial");
  const [booking, setBooking] = useState(false);
  const bookingLock = useRef(false);
  const [notice, setNotice] = useState<{
    text: string;
    success: boolean;
  } | null>(null);
  const searchVersion = useRef(0);
  const availabilityVersion = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api<{ especialidades: Specialty[] }>("/agenda/catalog", {
      token: session.token,
      signal: controller.signal,
    })
      .then((data) => {
        setCatalog(data.especialidades);
        setCatalogError("");
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 401) onExpired();
        else
          setCatalogError(
            "No se pudieron cargar las especialidades. Intenta nuevamente.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });
    return () => controller.abort();
  }, [session.token, retry, onExpired]);

  function resetSlots() {
    availabilityVersion.current++;
    setSlots(null);
    setSlot(null);
    setNotice(null);
    setAvailabilityError("");
  }

  async function search(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const version = ++searchVersion.current;
    setSearching(true);
    setPatientError("");
    setPatients([]);
    setSearched(false);
    try {
      const data = await api<Patient[]>(
        `/patients?${new URLSearchParams({ q: query.trim(), limit: "20" })}`,
        { token: session.token },
      );
      if (mounted.current && version === searchVersion.current) {
        setPatients(data);
        setSearched(true);
      }
    } catch (cause) {
      if (!mounted.current || version !== searchVersion.current) return;
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else
        setPatientError(
          "No se pudieron buscar los pacientes. Comprueba la conexión o tus permisos.",
        );
    } finally {
      if (mounted.current && version === searchVersion.current)
        setSearching(false);
    }
  }

  async function loadAvailability(preserveNotice = false) {
    const version = ++availabilityVersion.current;
    setLoading(true);
    setAvailabilityError("");
    setSlots(null);
    setSlot(null);
    if (!preserveNotice) setNotice(null);
    try {
      const params = new URLSearchParams({
        fecha: date,
        especialidadId: specialtyId,
      });
      if (doctorId) params.set("medicoId", doctorId);
      const data = await api<Availability>(`/agenda/availability?${params}`, {
        token: session.token,
      });
      if (mounted.current && version === availabilityVersion.current)
        setSlots(data.turnos);
    } catch (cause) {
      if (!mounted.current || version !== availabilityVersion.current) return;
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else
        setAvailabilityError(
          "No se pudo consultar la disponibilidad. Comprueba los filtros y vuelve a intentar.",
        );
    } finally {
      if (mounted.current && version === availabilityVersion.current)
        setLoading(false);
    }
  }

  async function reserve(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patient || !slot || bookingLock.current) return;
    bookingLock.current = true;
    setBooking(true);
    onBookingChange(true);
    setNotice(null);
    try {
      const result = await api<Booking>("/agenda/appointments", {
        token: session.token,
        body: {
          pacienteId: patient.id,
          medicoId: slot.medicoId,
          inicio: slot.inicio,
          ...(motive.trim() ? { motivo: motive.trim() } : {}),
          canalOrigen: channel,
        },
      });
      if (!mounted.current) return;
      setNotice({
        success: true,
        text: `Cita #${result.id} reservada para ${patient.nombres} ${patient.apellidos}, el ${day(result.fechaHoraInicio)}, de ${time(result.fechaHoraInicio)} a ${time(result.fechaHoraFin)} (hora de Lima), con ${slot.medico.nombres} ${slot.medico.apellidos}, en ${slot.consultorio}.`,
      });
      setMotive("");
      await loadAvailability(true);
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof ApiError && cause.status === 401) {
        onExpired();
        return;
      }
      if (cause instanceof ApiError && cause.status === 409) {
        setNotice({
          success: false,
          text: "Ese turno acaba de ser ocupado. Actualizamos la disponibilidad; elige otro turno.",
        });
        await loadAvailability(true);
      } else if (
        cause instanceof ApiError &&
        [400, 403, 404].includes(cause.status)
      ) {
        setSlot(null);
        setNotice({
          success: false,
          text: "No se pudo reservar. Verifica el paciente, los permisos y la disponibilidad antes de intentar nuevamente.",
        });
      } else {
        setSlot(null);
        setSlots(null);
        setNotice({
          success: false,
          text: "No se pudo confirmar el resultado de la reserva. Verifica si se registró antes de volver a reservar; no se reintentará automáticamente.",
        });
      }
    } finally {
      bookingLock.current = false;
      if (mounted.current) {
        setBooking(false);
        onBookingChange(false);
      }
    }
  }

  const doctors =
    catalog.find((s) => String(s.id) === specialtyId)?.medicos ?? [];

  return (
    <div className="agenda">
      <div className="page-heading">
        <p className="eyebrow">Área de admisión / Agenda médica</p>
        <h1>Reserva de citas</h1>
        <p>
          Selecciona un paciente y encuentra el próximo turno para su atención.
        </p>
      </div>
      {notice && (
        <div
          className={`notice ${notice.success ? "success" : "error"}`}
          role={notice.success ? "status" : "alert"}
        >
          {notice.text}
        </div>
      )}
      <div className="agenda-grid">
        <section className="card" aria-labelledby="patient-title">
          <h2 id="patient-title">
            <span className="step">1</span> Paciente
          </h2>
          <p className="small muted">Busca por documento, nombre o apellido.</p>
          <fieldset disabled={booking}>
            <form onSubmit={search} aria-busy={searching}>
              <label htmlFor="patient-search">Buscar paciente</label>
              <div className="inline-form">
                <input
                  id="patient-search"
                  placeholder="Documento o nombre"
                  value={query}
                  maxLength={100}
                  minLength={2}
                  required
                  onChange={(e) => {
                    setQuery(e.target.value);
                    searchVersion.current++;
                    setPatients([]);
                    setSearched(false);
                    setSearching(false);
                  }}
                />
                <button
                  className="secondary"
                  disabled={searching || query.trim().length < 2}
                >
                  Buscar
                </button>
              </div>
            </form>
            {searching && (
              <p role="status" className="small">
                Buscando pacientes…
              </p>
            )}
            {patientError && (
              <p className="notice error" role="alert">
                {patientError}
              </p>
            )}
            {searched && patients.length === 0 && (
              <p role="status" className="empty small">
                No se encontraron pacientes. Prueba con otro documento o nombre.
                El registro de pacientes se realiza por API en esta versión.
              </p>
            )}
            {patients.length > 0 && (
              <div
                className="patient-results"
                role="group"
                aria-label="Resultados de pacientes"
              >
                {patients.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`patient-option ${patient?.id === p.id ? "selected" : ""}`}
                    aria-pressed={patient?.id === p.id}
                    onClick={() => {
                      setPatient(p);
                      setNotice(null);
                    }}
                  >
                    <strong>
                      {p.nombres} {p.apellidos}
                    </strong>
                    <span>
                      {p.tipoDocumento} · {p.numeroDocumento}
                    </span>
                  </button>
                ))}
                <p className="small muted">
                  Hasta 20 resultados. Refina la búsqueda si no encuentras al
                  paciente.
                </p>
              </div>
            )}
            {patient && (
              <div className="patient-selected">
                <span className="eyebrow">Paciente seleccionado</span>
                <strong>
                  {patient.nombres} {patient.apellidos}
                </strong>
                <p>
                  {patient.tipoDocumento} · {patient.numeroDocumento}
                </p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setPatient(null);
                    setNotice(null);
                  }}
                >
                  Quitar selección
                </button>
              </div>
            )}
          </fieldset>
        </section>
        <section
          className="card availability-card"
          aria-labelledby="availability-title"
        >
          <h2 id="availability-title">
            <span className="step">2</span> Disponibilidad
          </h2>
          <p className="small muted">
            Todos los horarios se muestran en hora de Lima.
          </p>
          {catalogLoading && <p role="status">Cargando especialidades…</p>}
          {catalogError && (
            <div className="notice error" role="alert">
              {catalogError}
              <button
                className="secondary"
                onClick={() => {
                  setCatalogLoading(true);
                  setRetry((n) => n + 1);
                }}
              >
                Reintentar carga
              </button>
            </div>
          )}
          {!catalogLoading && !catalogError && catalog.length === 0 && (
            <p className="empty" role="status">
              Aún no hay médicos activos con horarios habilitados. Contacta al
              responsable de la agenda.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadAvailability();
            }}
            aria-busy={loading}
          >
            <fieldset
              disabled={
                booking ||
                loading ||
                catalogLoading ||
                !!catalogError ||
                catalog.length === 0
              }
              className="filters"
            >
              <div>
                <label htmlFor="specialty">Especialidad</label>
                <select
                  id="specialty"
                  value={specialtyId}
                  required
                  onChange={(e) => {
                    setSpecialtyId(e.target.value);
                    setDoctorId("");
                    resetSlots();
                  }}
                >
                  <option value="">Seleccionar especialidad</option>
                  {catalog.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="doctor">Médico</label>
                <select
                  id="doctor"
                  value={doctorId}
                  disabled={!specialtyId}
                  onChange={(e) => {
                    setDoctorId(e.target.value);
                    resetSlots();
                  }}
                >
                  <option value="">Todos los médicos</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombres} {d.apellidos}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="date">Fecha</label>
                <input
                  id="date"
                  type="date"
                  required
                  min={today()}
                  max="9999-12-31"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    resetSlots();
                  }}
                />
              </div>
              <button
                className="primary filter-submit"
                disabled={!specialtyId || !date}
              >
                Consultar turnos
              </button>
            </fieldset>
          </form>
          {loading && (
            <p className="empty" role="status">
              Consultando turnos disponibles…
            </p>
          )}
          {availabilityError && (
            <p className="notice error" role="alert">
              {availabilityError}
            </p>
          )}
          {!loading && slots === null && !availabilityError && (
            <p className="empty">
              Elige especialidad y fecha para consultar los turnos disponibles.
            </p>
          )}
          {slots?.length === 0 && (
            <p className="empty" role="status">
              No hay turnos disponibles para estos filtros. Prueba otra fecha o
              médico.
            </p>
          )}
          {!!slots?.length && (
            <>
              <p className="result-count">
                {slots.length} turnos disponibles{" "}
                <span>· Sujeto a confirmación al reservar</span>
              </p>
              <fieldset
                disabled={booking}
                className="slots"
                aria-label="Turnos disponibles"
              >
                {slots.map((s) => (
                  <label
                    className={`slot ${slot === s ? "selected" : ""}`}
                    key={`${s.medicoId}-${s.inicio}`}
                  >
                    <input
                      type="radio"
                      name="slot"
                      checked={slot === s}
                      onChange={() => {
                        setSlot(s);
                        setNotice(null);
                      }}
                    />
                    <span>
                      <strong>
                        {time(s.inicio)} – {time(s.fin)}
                      </strong>
                      <span>
                        {s.medico.nombres} {s.medico.apellidos}
                      </span>
                      <small>{s.consultorio}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
        </section>
      </div>
      <section
        className="card confirmation-card"
        aria-labelledby="confirm-title"
      >
        <h2 id="confirm-title">
          <span className="step">3</span> Confirmar reserva
        </h2>
        {!slot || !patient ? (
          <p className="muted">
            Selecciona un paciente y un turno para revisar y confirmar la cita.
          </p>
        ) : (
          <form onSubmit={reserve} aria-busy={booking}>
            <fieldset disabled={booking}>
              <div className="booking-summary">
                <div>
                  <span>Paciente</span>
                  <strong>
                    {patient.nombres} {patient.apellidos}
                  </strong>
                </div>
                <div>
                  <span>Atención presencial</span>
                  <strong>
                    {day(slot.inicio)}, {time(slot.inicio)} – {time(slot.fin)}
                  </strong>
                </div>
                <div>
                  <span>Médico y consultorio</span>
                  <strong>
                    {slot.medico.nombres} {slot.medico.apellidos} ·{" "}
                    {slot.consultorio}
                  </strong>
                </div>
              </div>
              <div className="booking-fields">
                <div>
                  <label htmlFor="motive">Motivo (opcional)</label>
                  <textarea
                    id="motive"
                    rows={2}
                    maxLength={300}
                    value={motive}
                    onChange={(e) => setMotive(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="channel">Canal de solicitud</label>
                  <select
                    id="channel"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                  >
                    <option value="presencial">Presencial</option>
                    <option value="telefono">Teléfono</option>
                  </select>
                </div>
              </div>
              <div className="confirm-actions">
                <p className="small muted">
                  La disponibilidad se validará nuevamente al confirmar.
                </p>
                <button className="primary">
                  {booking ? "Reservando…" : "Confirmar reserva"}
                </button>
              </div>
            </fieldset>
          </form>
        )}
      </section>
    </div>
  );
}
