import {
  CancelAppointmentDto,
  RescheduleAppointmentDto,
} from './change-appointment.dto.js';
import { DailyAppointmentsDto } from './daily-appointments.dto.js';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { ApiContract } from '../openapi/api-contract.decorator.js';
import { VitalSignsDto } from './vital-signs.dto.js';
import { NursingQueueDto } from './nursing-queue.dto.js';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ArrivalParamsDto } from './arrival-params.dto.js';
import { Roles } from '../auth/auth.decorators.js';
import type { AuthRequest } from '../auth/auth.types.js';
import { AvailabilityDto } from './availability.dto.js';
import { AgendaService } from './agenda.service.js';
import { CreateAppointmentDto } from './create-appointment.dto.js';

@ApiTags('Agenda y atención previa')
@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @ApiContract('Consultar catálogo de agenda', 'Catalog', {
    description:
      'Admisión, médico y enfermería. Especialidades y médicos activos con horarios en consultorios activos.',
  })
  @Get('catalog')
  @Roles('admision', 'medico', 'enfermeria')
  catalog(@Req() req: AuthRequest, @Ip() ip: string) {
    return this.agenda.catalog(req.user!.id, ip);
  }

  @ApiContract('Listar citas del día para admisión', 'DailyAppointments', {
    description:
      'Solo admisión. Día seleccionado en America/Lima (hoy si se omite fecha), todas las modalidades y estados. Filtros opcionales por médico y estado; paginación y orden por hora e ID. Solo identificación y datos operativos, sin información clínica. Registrar llegada sigue limitado a hoy.',
    errors: {
      400: 'Fecha inexistente o distinta de YYYY-MM-DD, filtros inválidos o desconocidos.',
    },
  })
  @Get('appointments')
  @Roles('admision')
  dailyAppointments(
    @Query() query: DailyAppointmentsDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.dailyAppointments(query, req.user!.id, ip);
  }

  @ApiContract('Reservar cita', 'Appointment', {
    status: 201,
    description:
      'Solo admisión. Turno completo futuro según horario de Lima. El servidor calcula duración, creador y estado. Cita presencial y auditoría se guardan juntas.',
    errors: {
      400: 'Datos inválidos, inicio pasado, zona ausente o turno fuera de horario.',
      404: 'Paciente o médico activo inexistente.',
      409: 'Turno ocupado por otra cita no cancelada.',
    },
  })
  @ApiBody({ type: CreateAppointmentDto })
  @Post('appointments')
  @Roles('admision')
  create(
    @Body() dto: CreateAppointmentDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.create(dto, req.user!.id, ip);
  }

  @ApiContract('Reprogramar cita', 'Appointment', {
    description:
      'Solo admisión. Conserva paciente y médico. Revalida turno futuro y disponibilidad en una transacción. No permite llegada, preparación ni consulta registradas.',
    errors: {
      400: 'Inicio inválido, sin cambio o fuera de horario.',
      404: 'Cita o médico inexistente.',
      409: 'Cita no modificable o turno ocupado.',
    },
  })
  @ApiBody({ type: RescheduleAppointmentDto })
  @Post('appointments/:id/reschedule')
  @HttpCode(200)
  @Roles('admision')
  reschedule(
    @Param() params: ArrivalParamsDto,
    @Body() dto: RescheduleAppointmentDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.reschedule(params.id, dto.inicio, req.user!.id, ip, undefined, dto.motivo);
  }

  @ApiContract('Cancelar cita', 'Appointment', {
    description:
      'Solo admisión. Libera el turno sin borrar la cita. No permite llegada, preparación ni consulta registradas. Auditoría transaccional.',
    errors: {
      400: 'ID o cuerpo inválido.',
      404: 'Cita inexistente.',
      409: 'Cita no modificable.',
    },
  })
  @ApiBody({ type: CancelAppointmentDto })
  @Post('appointments/:id/cancel')
  @HttpCode(200)
  @Roles('admision')
  cancel(
    @Param() params: ArrivalParamsDto,
    @Body() _dto: CancelAppointmentDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.cancel(params.id, req.user!.id, ip);
  }

  @ApiContract('Confirmar solicitud de cita del portal', 'Appointment', {
    description:
      'Solo admisión. Confirma una solicitud futura pendiente del portal; cambio y auditoría atómicos. Un reintento conserva la confirmación sin duplicar auditoría.',
    errors: {
      400: 'ID o cuerpo inválido.',
      404: 'Cita inexistente.',
      409: 'Solicitud no confirmable.',
    },
  })
  @ApiBody({ type: CancelAppointmentDto })
  @Post('appointments/:id/confirm')
  @HttpCode(200)
  @Roles('admision')
  confirm(
    @Param() params: ArrivalParamsDto,
    @Body() _dto: CancelAppointmentDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.confirm(params.id, req.user!.id, ip);
  }

  @ApiContract('Registrar llegada', 'Arrival', {
    description:
      'Solo admisión. Sin cuerpo. Cita presencial del día en America/Lima, programada, confirmada o reprogramada. Conserva estado y primera llegada en reintentos; auditoría transaccional.',
    errors: {
      400: 'ID/cuerpo inválido o cita de otro día.',
      404: 'Cita inexistente.',
      409: 'Modalidad o estado incompatible.',
    },
  })
  @ApiBody({
    required: false,
    description:
      'Sin cuerpo; admite un objeto vacío. No permite fecha, actor ni estado enviados por el cliente.',
    schema: { type: 'object', additionalProperties: false, maxProperties: 0 },
  })
  @Post('appointments/:id/arrival')
  @HttpCode(200)
  @Roles('admision')
  registerArrival(
    @Param() params: ArrivalParamsDto,
    @Body() body: Record<string, unknown> | undefined,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    if (body && Object.keys(body).length > 0) {
      throw new BadRequestException(
        'Arrival registration does not accept body fields',
      );
    }
    return this.agenda.registerArrival(params.id, req.user!.id, ip);
  }

  @ApiContract('Registrar signos vitales', 'VitalSigns', {
    status: 201,
    description:
      'Solo enfermería. Cita presencial de hoy, llegada registrada y preparación pendiente (paciente esperando en sala). Registra autor/fecha en servidor, completa preparación y guarda auditoría atómicamente. No cambia la cita a atendida. Una evaluación por cita, sin sobrescritura. Los límites numéricos son validaciones técnicas, no rangos de normalidad clínica.',
    errors: {
      400: 'Mediciones/ID inválidos, campos desconocidos o cita de otro día.',
      404: 'Cita inexistente.',
      409: 'Sin llegada, llegada futura, preparación completada, evaluación existente o cita no elegible.',
    },
  })
  @ApiBody({ type: VitalSignsDto })
  @Post('appointments/:id/vital-signs')
  @Roles('enfermeria')
  recordVitalSigns(
    @Param() params: ArrivalParamsDto,
    @Body() dto: VitalSignsDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.recordVitalSigns(params.id, dto, req.user!.id, ip);
  }

  @ApiContract('Consultar signos vitales de la cita', 'MedicalVitalSigns', {
    description:
      'Solo el médico asignado a la cita. Incluye mediciones, observaciones, fecha y autoría; lectura auditada. Enfermería y admisión reciben 403.',
    errors: {
      400: 'ID inválido.',
      404: 'No existe evaluación accesible para el médico asignado.',
    },
  })
  @Get('appointments/:id/vital-signs')
  @Roles('medico')
  readVitalSigns(
    @Param() params: ArrivalParamsDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.readVitalSigns(params.id, req.user!.id, ip);
  }

  @ApiContract(
    'Listar pacientes pendientes de evaluación previa',
    'NursingQueue',
    {
      description:
        'Solo enfermería. Citas presenciales de hoy en Lima con llegada y preparación pendiente; estados programada, confirmada o reprogramada. Orden por llegada e ID, con paginación. Sin historial, signos vitales ni datos de contacto.',
      errors: {
        400: 'Paginación inválida o filtros desconocidos; no admite otra fecha.',
      },
    },
  )
  @Get('nursing-queue')
  @Roles('enfermeria')
  nursingQueue(
    @Query() query: NursingQueueDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.nursingQueue(query, req.user!.id, ip);
  }

  @ApiContract('Listar pacientes preparados del médico', 'MedicalQueue', {
    description:
      'Solo médico asignado. Citas presenciales de hoy en Lima, con llegada y evaluación completada, sin consulta. Orden por llegada e ID; lectura auditada.',
    errors: { 400: 'Paginación inválida o parámetros desconocidos.' },
  })
  @Get('medical-queue')
  @Roles('medico')
  medicalQueue(
    @Query() query: NursingQueueDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.medicalQueue(query, req.user!.id, ip);
  }

  @ApiContract('Consultar disponibilidad', 'Availability', {
    description:
      'Admisión, médico y enfermería. Turnos completos futuros en America/Lima, excluyendo citas no canceladas. No bloquea ni reserva. Sin coincidencias o para fecha pasada devuelve turnos vacíos. Sin feriados ni excepciones.',
    errors: { 400: 'Fecha, IDs o parámetros inválidos/desconocidos.' },
  })
  @Get('availability')
  @Roles('admision', 'medico', 'enfermeria')
  availability(
    @Query() dto: AvailabilityDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.availability(dto, req.user!.id, ip);
  }
}
