import { Body, Controller, Get, Ip, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators.js';
import type { AuthRequest } from '../auth/auth.types.js';
import { AvailabilityDto } from './availability.dto.js';
import { AgendaService } from './agenda.service.js';
import { CreateAppointmentDto } from './create-appointment.dto.js';

@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get('catalog')
  @Roles('admision', 'medico', 'enfermeria')
  catalog(@Req() req: AuthRequest, @Ip() ip: string) {
    return this.agenda.catalog(req.user!.id, ip);
  }

  @Post('appointments')
  @Roles('admision')
  create(
    @Body() dto: CreateAppointmentDto,
    @Req() req: AuthRequest,
    @Ip() ip: string,
  ) {
    return this.agenda.create(dto, req.user!.id, ip);
  }

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
