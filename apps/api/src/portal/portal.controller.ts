import {
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
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/auth.decorators.js';
import type { AuthRequest } from '../auth/auth.types.js';
import { ApiContract } from '../openapi/api-contract.decorator.js';
import { AgendaService } from '../agenda/agenda.service.js';
import { AvailabilityDto } from '../agenda/availability.dto.js';
import { ArrivalParamsDto } from '../agenda/arrival-params.dto.js';
import { NursingQueueDto } from '../agenda/nursing-queue.dto.js';
import {
  CancelAppointmentDto,
  PortalRescheduleAppointmentDto,
} from '../agenda/change-appointment.dto.js';
import { PortalAppointmentsDto, PortalBookingDto, PortalHistoryDto } from './portal.dto.js';
import { PortalService } from './portal.service.js';

@ApiTags('Portal del paciente')
@Controller('portal')
@Roles('paciente')
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly agenda: AgendaService,
  ) {}

  @Get('profile')
  @ApiContract('Consultar mi perfil', 'Patient', {
    errors: { 404: 'Cuenta sin paciente vinculado.' },
  })
  profile(@Req() req: AuthRequest, @Ip() ip: string) {
    return this.portal.profile(req.user!.id, ip);
  }

  @Get('appointments')
  @ApiContract('Consultar mis citas', 'PortalAppointments', {
    description:
      'Solo el paciente autenticado. No admite pacienteId ni usuarioId. Próximas o todas, con paginación.',
    errors: {
      400: 'Filtros inválidos.',
      404: 'Cuenta sin paciente vinculado.',
    },
  })
  appointments(
    @Query() query: PortalAppointmentsDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.portal.appointments(query, req.user!.id, ip);
  }

  @Get('history')
  @ApiContract('Consultar mis consultas y recetas', 'PortalHistory', {
    description: 'Historial propio, con búsqueda por médico/especialidad/motivo/diagnóstico, especialidad, fechas de Lima inclusivas y consultas activas con receta. Filtros aplicados antes de paginar.',
    errors: {
      400: 'Filtros, rango de fechas o paginación inválidos.',
      404: 'Cuenta sin paciente vinculado.',
    },
  })
  history(
    @Query() query: PortalHistoryDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.portal.history(query, req.user!.id, ip);
  }

  @Get('history-context')
  @ApiContract('Consultar mi resumen clínico y especialidades de mi historial', 'PortalHistoryContext')
  historyContext(@Req() req: AuthRequest, @Ip() ip: string) {
    return this.portal.historyContext(req.user!.id, ip);
  }

  @Get('notifications')
  @ApiContract('Consultar mis notificaciones de citas', 'PortalNotifications', {
    description: 'Avisos propios de registro, confirmación, reprogramación y cancelación, independientemente del envío de correo. Recupera confirmaciones auditadas anteriores sin aviso duplicado.',
    errors: { 400: 'Paginación inválida.', 404: 'Cuenta sin paciente vinculado.' },
  })
  notifications(@Query() query: NursingQueueDto, @Req() req: AuthRequest, @Ip() ip: string) {
    return this.portal.notifications(query, req.user!.id, ip);
  }

  @Get('catalog')
  @ApiContract('Consultar médicos para mi cita', 'Catalog')
  catalog(@Req() req: AuthRequest, @Ip() ip: string) {
    return this.agenda.catalog(req.user!.id, ip);
  }

  @Get('availability')
  @ApiContract('Consultar turnos para mi cita', 'Availability', {
    errors: { 400: 'Fecha o filtros inválidos.' },
  })
  availability(
    @Query() query: AvailabilityDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.availability(query, req.user!.id, ip);
  }

  @Post('appointments')
  @ApiContract('Agendar mi cita', 'Appointment', {
    status: 201,
    description: 'Paciente y canal portal determinados por el servidor.',
    errors: {
      400: 'Turno inválido.',
      404: 'Perfil o médico inexistente.',
      409: 'Turno ocupado.',
    },
  })
  @ApiBody({ type: PortalBookingDto })
  book(
    @Body() dto: PortalBookingDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.portal.book(dto, req.user!.id, ip);
  }

  @Post('appointments/:id/reschedule')
  @HttpCode(200)
  @ApiContract('Reprogramar mi cita', 'Appointment', {
    errors: {
      400: 'Turno inválido.',
      404: 'Cita no encontrada para el paciente.',
      409: 'Cita no modificable o turno ocupado.',
    },
  })
  @ApiBody({ type: PortalRescheduleAppointmentDto })
  reschedule(
    @Param() params: ArrivalParamsDto,
    @Body() dto: PortalRescheduleAppointmentDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.reschedule(
      params.id,
      dto.inicio,
      req.user!.id,
      ip,
      req.user!.id,
    );
  }

  @Post('appointments/:id/cancel')
  @HttpCode(200)
  @ApiContract('Cancelar mi cita', 'Appointment', {
    errors: {
      400: 'ID o cuerpo inválido.',
      404: 'Cita no encontrada para el paciente.',
      409: 'Cita no modificable.',
    },
  })
  @ApiBody({ type: CancelAppointmentDto })
  cancel(
    @Param() params: ArrivalParamsDto,
    @Body() _dto: CancelAppointmentDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.cancel(params.id, req.user!.id, ip, req.user!.id);
  }
}
