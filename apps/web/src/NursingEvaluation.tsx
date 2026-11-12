import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'

type Patient = {
  citaId: number
  paciente: {
    nombres: string
    apellidos: string
    tipoDocumento: string
    numeroDocumento: string
    edad: number
  }
  inicio: string
  llegadaEn: string
  medico: { nombres: string; apellidos: string }
  especialidad: { nombre: string }
}
const time = (value: string) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
const groups = [
  {
    title: 'Presión arterial',
    fields: [
      {
        name: 'presionSistolica',
        label: 'Presión sistólica (mmHg)',
        min: 1,
        max: 1000,
        step: 1,
        required: true,
      },
      {
        name: 'presionDiastolica',
        label: 'Presión diastólica (mmHg)',
        min: 1,
        max: 1000,
        step: 1,
        required: true,
      },
    ],
  },
  {
    title: 'Frecuencia cardíaca',
    fields: [
      {
        name: 'frecuenciaCardiaca',
        label: 'Frecuencia cardíaca (latidos/min)',
        min: 1,
        max: 1000,
        step: 1,
        required: true,
      },
    ],
  },
  {
    title: 'Temperatura',
    fields: [
      {
        name: 'temperaturaC',
        label: 'Temperatura (°C)',
        min: 0.1,
        max: 100,
        step: 0.1,
        required: true,
      },
    ],
  },
  {
    title: 'Saturación de oxígeno',
    fields: [
      {
        name: 'saturacionOxigeno',
        label: 'Saturación de oxígeno (%)',
        min: 0,
        max: 100,
        step: 0.1,
        required: true,
      },
    ],
  },
  {
    title: 'Frecuencia respiratoria',
    fields: [
      {
        name: 'frecuenciaRespiratoria',
        label: 'Frecuencia respiratoria (respiraciones/min)',
        min: 1,
        max: 1000,
        step: 1,
        required: true,
      },
    ],
  },
  {
    title: 'Biometría (opcional)',
    fields: [
      {
        name: 'pesoKg',
        label: 'Peso (kg, opcional)',
        min: 0.01,
        max: 2000,
        step: 0.01,
        required: false,
      },
      {
        name: 'tallaCm',
        label: 'Talla (cm, opcional)',
        min: 0.1,
        max: 400,
        step: 0.1,
        required: false,
      },
    ],
  },
]

export function NursingEvaluation({
  appointment,
  saving,
  error,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  appointment: Patient
  saving: boolean
  error: string
  onSave: (values: Record<string, number | string>) => Promise<void>
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    title.current?.focus()
  }, [])
  function change(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
    onDirtyChange(true)
  }
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const data: Record<string, number | string> = {}
    for (const group of groups)
      for (const field of group.fields)
        if (values[field.name]?.trim())
          data[field.name] = Number(values[field.name])
    if (values.observaciones?.trim())
      data.observaciones = values.observaciones.trim()
    void onSave(data)
  }
  return (
    <section className="nw-evaluation" aria-labelledby="vital-title">
      <header className="nw-patient-banner">
        <span className="nw-large-avatar" aria-hidden="true">
          {appointment.paciente.nombres.charAt(0)}
          {appointment.paciente.apellidos.charAt(0)}
        </span>
        <div>
          <span className="nw-banner-caption">
            Paciente seleccionado · Cita #{appointment.citaId}
          </span>
          <h2>
            {appointment.paciente.nombres} {appointment.paciente.apellidos}
          </h2>
          <p>
            {appointment.paciente.tipoDocumento}:{' '}
            {appointment.paciente.numeroDocumento} · {appointment.paciente.edad}{' '}
            años
          </p>
          <p>
            {appointment.especialidad.nombre} · {appointment.medico.nombres}{' '}
            {appointment.medico.apellidos}
          </p>
          <small>
            Cita: {time(appointment.inicio)} · Llegada registrada:{' '}
            {time(appointment.llegadaEn)}
          </small>
        </div>
      </header>
      <div className="nw-panel">
        <div className="nw-form-heading">
          <span className="eyebrow">Evaluación de enfermería</span>
          <h2 id="vital-title" ref={title} tabIndex={-1}>
            Registrar signos vitales
          </h2>
          <p>
            Confirma la identidad del paciente e ingresa las mediciones tomadas
            antes de la consulta. Los campos de biometría y observaciones son
            opcionales.
          </p>
        </div>
        <form onSubmit={submit} aria-busy={saving}>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <fieldset disabled={saving}>
            <div className="nw-measurements">
              {groups.map((group) => (
                <section className="nw-measurement" key={group.title}>
                  <h3>{group.title}</h3>
                  <div
                    className={
                      group.fields.length > 1 ? 'nw-paired-fields' : undefined
                    }
                  >
                    {group.fields.map((field) => (
                      <div key={field.name}>
                        <label htmlFor={`vital-${field.name}`}>
                          {field.label}
                        </label>
                        <input
                          id={`vital-${field.name}`}
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          required={field.required}
                          value={values[field.name] ?? ''}
                          onChange={(event) =>
                            change(field.name, event.target.value)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <section className="nw-observations">
              <h3>Nota de enfermería</h3>
              <label htmlFor="vital-observations">
                Observaciones de enfermería (opcional)
              </label>
              <textarea
                id="vital-observations"
                maxLength={1000}
                rows={4}
                value={values.observaciones ?? ''}
                onChange={(event) =>
                  change('observaciones', event.target.value)
                }
              />
              <p>
                Las mediciones y observaciones quedarán disponibles para el
                médico al guardar la evaluación.
              </p>
            </section>
            <div className="nw-form-actions">
              <button type="button" className="secondary" onClick={onCancel}>
                Volver a pendientes
              </button>
              <button type="submit" className="primary">
                {saving ? 'Guardando evaluación…' : 'Guardar evaluación'}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </section>
  )
}

export function DiscardMeasurements({
  onStay,
  onDiscard,
}: {
  onStay: () => void
  onDiscard: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="card nw-discard"
      aria-labelledby="nw-discard-title"
      onCancel={(event) => {
        event.preventDefault()
        onStay()
      }}
    >
      <h2 id="nw-discard-title">¿Descartar las mediciones?</h2>
      <p>
        Hay datos sin guardar del paciente seleccionado. Si continúas, se
        descartarán.
      </p>
      <div className="nw-form-actions">
        <button className="secondary" onClick={onStay}>
          Seguir evaluando
        </button>
        <button className="danger" onClick={onDiscard}>
          Descartar y continuar
        </button>
      </div>
    </dialog>
  )
}
