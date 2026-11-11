import type { SchemaObject, ReferenceObject } from '@nestjs/swagger';

const integer: SchemaObject = { type: 'integer', example: 1 };
const text: SchemaObject = { type: 'string' };
const instant: SchemaObject = { type: 'string', format: 'date-time' };
export const ref = (name: string): ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});
const array = (items: SchemaObject | ReferenceObject): SchemaObject => ({
  type: 'array',
  items,
});
const object = (
  properties: Record<string, SchemaObject | ReferenceObject>,
  required = Object.keys(properties),
): SchemaObject => ({ type: 'object', properties, required });
const nullable = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
const names = { nombres: text, apellidos: text };
const identity = { id: integer, ...names };
const patient = {
  id: integer,
  tipoDocumento: {
    type: 'string',
    enum: ['DNI', 'CE', 'PASAPORTE'],
  } as SchemaObject,
  numeroDocumento: text,
  ...names,
  fechaNacimiento: instant,
  sexo: { type: 'string', enum: ['M', 'F'] } as SchemaObject,
  telefono: text,
  correo: { type: 'string', format: 'email' } as SchemaObject,
  direccion: nullable(text),
};
const evaluation = {
  id: integer,
  citaId: integer,
  registradoPor: integer,
  registradoEn: instant,
  temperaturaC: { type: 'number' } as SchemaObject,
  presionSistolica: integer,
  presionDiastolica: integer,
  frecuenciaCardiaca: integer,
  frecuenciaRespiratoria: integer,
  saturacionOxigeno: { type: 'number' } as SchemaObject,
  pesoKg: nullable({ type: 'number' }),
  tallaCm: nullable({ type: 'number' }),
  observaciones: nullable(text),
};

export const responseSchemas: Record<string, SchemaObject> = {
  Error: object(
    {
      statusCode: integer,
      message: { oneOf: [text, array(text)] },
      error: text,
    },
    ['statusCode', 'message'],
  ),
  DuplicatePatient: object({
    message: { type: 'string', example: 'Patient document already exists' },
    patientId: integer,
  }),
  Login: object({
    accessToken: {
      type: 'string',
      description:
        'JWT con vigencia de una hora; usar en Authorization: Bearer <token>.',
    },
    tokenType: { type: 'string', enum: ['Bearer'] },
  }),
  Session: object({
    id: integer,
    rol: {
      type: 'string',
      enum: [
        'admision',
        'medico',
        'enfermeria',
        'laboratorio',
        'cajero',
        'gerencia',
        'paciente',
      ],
    },
  }),
  Patient: object(patient),
  PatientHistory: object({
    paciente: ref('ClinicalProfile'),
    pagina: integer,
    limite: integer,
    hayMas: { type: 'boolean' },
    consultas: array(
      object({
        id: integer,
        fechaHora: instant,
        motivo: text,
        indicaciones: nullable(text),
        estado: { type: 'string', enum: ['activo', 'anulado'] },
        motivoAnulacion: nullable(text),
        anuladoEn: nullable(instant),
        medico: object({
          usuario: object(names),
          especialidad: object({ nombre: text }),
        }),
        diagnosticos: array(
          object({ codigo: text, descripcion: text, tipo: text }),
        ),
        recetaItems: array(
          object({
            medicamento: text,
            dosis: text,
            via: text,
            frecuencia: text,
            duracion: text,
            indicaciones: nullable(text),
          }),
        ),
      }),
    ),
  }),
  ClinicalProfile: object({
    ...patient,
    antecedentes: array(
      object({
        id: integer,
        pacienteId: integer,
        tipo: text,
        descripcion: text,
        desde: nullable(instant),
        registradoEn: instant,
      }),
    ),
    alergias: array(
      object({
        id: integer,
        pacienteId: integer,
        sustancia: text,
        reaccion: nullable(text),
      }),
    ),
  }),
  Catalog: object({
    especialidades: array(
      object({ id: integer, nombre: text, medicos: array(object(identity)) }),
    ),
  }),
  Availability: object({
    fecha: { type: 'string', format: 'date' },
    zonaHoraria: { type: 'string', enum: ['America/Lima'] },
    especialidadId: integer,
    turnos: array(
      object({
        medicoId: integer,
        medico: object(names),
        consultorioId: integer,
        consultorio: text,
        inicio: instant,
        fin: instant,
      }),
    ),
  }),
  Appointment: object({
    id: integer,
    pacienteId: integer,
    medicoId: integer,
    fechaHoraInicio: instant,
    fechaHoraFin: instant,
    estado: { type: 'string', enum: ['programada'] },
    canalOrigen: { type: 'string', enum: ['presencial', 'telefono'] },
    modalidad: { type: 'string', enum: ['presencial'] },
  }),
  Arrival: object({
    id: integer,
    estado: {
      type: 'string',
      enum: ['programada', 'confirmada', 'reprogramada'],
    },
    llegadaEn: instant,
  }),
  VitalSigns: object(evaluation),
  MedicalVitalSigns: object({ ...evaluation, autor: object(identity) }),
  DiagnosisCode: object({ codigo: text, descripcion: text }),
  ConsultationDiagnosis: object({
    id: integer,
    consultaId: integer,
    codigo: text,
    descripcion: text,
    tipo: { type: 'string', enum: ['principal', 'secundario'] },
    orden: integer,
  }),
  PrescriptionItem: object({
    id: integer,
    consultaId: integer,
    orden: integer,
    medicamento: text,
    dosis: text,
    via: text,
    frecuencia: text,
    duracion: text,
    indicaciones: nullable(text),
  }),
  Consultation: object({
    id: integer,
    pacienteId: integer,
    medicoId: integer,
    citaId: nullable(integer),
    fechaHora: instant,
    motivo: text,
    indicaciones: nullable(text),
    estado: { type: 'string', enum: ['activo', 'anulado'] },
    motivoAnulacion: nullable(text),
    anuladoPor: nullable(integer),
    anuladoEn: nullable(instant),
    diagnosticos: array(ref('ConsultationDiagnosis')),
    recetaItems: array(ref('PrescriptionItem')),
  }),
  DailyAppointments: object({
    fecha: { type: 'string', format: 'date' },
    zonaHoraria: { type: 'string', enum: ['America/Lima'] },
    pagina: integer,
    limite: integer,
    hayMas: { type: 'boolean' },
    citas: array(
      object({
        id: integer,
        inicio: instant,
        fin: instant,
        estado: {
          type: 'string',
          enum: [
            'programada',
            'confirmada',
            'reprogramada',
            'cancelada',
            'atendida',
            'no_asistio',
          ],
        },
        modalidad: { type: 'string', enum: ['presencial', 'virtual'] },
        llegadaEn: nullable(instant),
        paciente: object({
          ...identity,
          tipoDocumento: text,
          numeroDocumento: text,
        }),
        medico: object(identity),
        especialidad: object({ id: integer, nombre: text }),
      }),
    ),
  }),
  NursingQueue: object({
    fecha: { type: 'string', format: 'date' },
    zonaHoraria: { type: 'string', enum: ['America/Lima'] },
    pagina: integer,
    limite: integer,
    hayMas: { type: 'boolean' },
    pacientes: array(
      object({
        citaId: integer,
        paciente: object({
          id: integer,
          tipoDocumento: text,
          numeroDocumento: text,
          ...names,
          edad: { type: 'integer' },
        }),
        inicio: instant,
        llegadaEn: instant,
        medico: object(identity),
        especialidad: object({ id: integer, nombre: text }),
        estadoPreparacion: { type: 'string', enum: ['pendiente'] },
      }),
    ),
  }),
  MedicalQueue: object({
    fecha: { type: 'string', format: 'date' },
    zonaHoraria: { type: 'string', enum: ['America/Lima'] },
    pagina: integer,
    limite: integer,
    hayMas: { type: 'boolean' },
    pacientes: array(
      object({
        citaId: integer,
        paciente: object({
          id: integer,
          tipoDocumento: text,
          numeroDocumento: text,
          ...names,
          edad: { type: 'integer' },
        }),
        inicio: instant,
        llegadaEn: instant,
        medico: object(identity),
        especialidad: object({ id: integer, nombre: text }),
        estadoPreparacion: { type: 'string', enum: ['completada'] },
      }),
    ),
  }),
};
