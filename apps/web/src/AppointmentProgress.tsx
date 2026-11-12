type Appointment = {
  estado: string
  llegadaEn: string | null
  preparacionCompletadaEn?: string | null
}
const time = (value: string) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

export function AppointmentProgress({
  appointment,
}: {
  appointment: Appointment
}) {
  if (['cancelada', 'no_asistio'].includes(appointment.estado))
    return (
      <p className="pp-progress-stopped">
        {appointment.estado === 'cancelada'
          ? 'La cita fue cancelada. El flujo de atención está cerrado.'
          : 'La cita fue marcada como inasistencia. El flujo de atención está cerrado.'}
      </p>
    )
  const completed =
    appointment.estado === 'pendiente_confirmacion'
      ? 0
      : appointment.estado === 'atendida'
        ? 4
        : appointment.preparacionCompletadaEn
          ? 3
          : appointment.llegadaEn
            ? 2
            : ['programada', 'confirmada', 'reprogramada'].includes(
                  appointment.estado,
                )
              ? 1
              : 0
  const steps = [
    {
      title: 'Cita confirmada',
      description: completed >= 1 ? 'Cupo reservado' : 'Pendiente de admisión',
    },
    {
      title: 'Registro de llegada',
      description: appointment.llegadaEn
        ? `${time(appointment.llegadaEn)} · Admisión`
        : completed >= 2
          ? 'Registrada'
          : 'Pendiente de llegada',
    },
    {
      title: 'Triaje asistencial',
      description: completed >= 3 ? 'Completado' : 'Pendiente de enfermería',
    },
    {
      title: 'Consulta médica',
      description:
        completed === 4 ? 'Atención completada' : 'Pendiente de atención',
    },
  ]
  return (
    <section className="pp-care-flow" aria-label="Flujo de tu atención">
      <div className="pp-progress-heading">
        <h3>Flujo de tu atención</h3>
        <span>
          {completed} de 4 etapas · {completed * 25}%
        </span>
      </div>
      <progress
        className="pp-care-progress"
        max={4}
        value={completed}
        aria-label="Progreso de tu atención"
        aria-valuetext={`${completed} de 4 etapas completadas${completed ? `: ${steps[completed - 1].title}` : ': pendiente de confirmación'}`}
      />
      <ol>
        {steps.map((step, index) => (
          <li
            key={step.title}
            className={
              index < completed
                ? 'pp-flow-done'
                : index === completed
                  ? 'pp-flow-current'
                  : ''
            }
            aria-current={index === completed ? 'step' : undefined}
          >
            <span aria-hidden="true">
              {index < completed ? '✓' : index + 1}
            </span>
            <div>
              <strong>
                {index + 1}. {step.title}
              </strong>
              <small>{step.description}</small>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
